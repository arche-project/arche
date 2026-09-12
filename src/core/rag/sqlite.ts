// Le format de corpus (ADR 0014) : une base SQLite par corpus — texte des chunks, FTS5, vecteurs par
// modèle, métadonnées et licence — lisible avec sqlite3 seul. Ici : le schéma, son ouverture et
// l'encodage des vecteurs ; l'écriture est dans build.ts, la lecture (FTS5 + cosinus) dans retrieve.ts.
// The per-corpus SQLite format (ADR 0014): schema, open and vector encoding; writer in build.ts,
// reader in retrieve.ts.

import { DatabaseSync } from 'node:sqlite';

export const FORMAT_VERSION = 1;
/** PRAGMA application_id = 'ARCH' en ASCII : `sqlite3` et `file` reconnaissent un corpus Arche sans l'ouvrir. */
export const APPLICATION_ID = 0x41524348;
/** int8 = round(x × 127) d'un vecteur normalisé L2 : le cosinus de deux int8 vaut dot / 127² (ADR 0014). */
export const QUANT = 127;

/** Normalise L2 puis quantifie un vecteur flottant en int8, à `out[at…]`. / L2-normalise then quantise. */
export function quantize(v: readonly number[] | Float32Array, out: Int8Array, at: number): void {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i]! * v[i]!;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) {
    const q = Math.round((v[i]! / norm) * QUANT);
    out[at + i] = q > QUANT ? QUANT : q < -QUANT ? -QUANT : q;
  }
}

/** Le schéma — identique au bloc « Schéma SQL » de docs/adr/0014-format-sqlite.md (un test le vérifie). */
export const SCHEMA_SQL = `
-- Métadonnées en clé/valeur : ajouter une clé ne change jamais le schéma. Clés obligatoires :
-- format_version, resource_id, built_at, license_spdx, license_redistribution, languages.
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
-- Un article = une page de la source (ZIM, PDF, EPUB, Markdown). url : où l'ouvrir hors ligne (kiwix-serve, arche://).
CREATE TABLE articles (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL, url TEXT, lang TEXT);
-- Un chunk = un passage AVEC son texte. byte_offset/byte_length : sa place dans le texte de l'article (le locator).
-- assets : fichiers cités (JSON, chemins) ; kind : NULL = texte, 'asset' = description générée d'un fichier.
CREATE TABLE chunks (id INTEGER PRIMARY KEY, article INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL, heading TEXT NOT NULL DEFAULT '', byte_offset INTEGER NOT NULL, byte_length INTEGER NOT NULL,
  text TEXT NOT NULL, assets TEXT, kind TEXT, UNIQUE (article, ordinal));
-- Lexical : FTS5 (BM25 intégré) sur le texte et le titre de section, sans dupliquer le texte (content=chunks).
-- porter unicode61 : insensible à la casse et aux accents (remove_diacritics 2), racines EN ; le FR est mesuré par eval.
CREATE VIRTUAL TABLE chunks_fts USING fts5(text, heading, content='chunks', content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 2');
CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts (rowid, text, heading) VALUES (new.id, new.text, new.heading); END;
CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, text, heading) VALUES ('delete', old.id, old.text, old.heading); END;
CREATE TRIGGER chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts (chunks_fts, rowid, text, heading) VALUES ('delete', old.id, old.text, old.heading);
  INSERT INTO chunks_fts (rowid, text, heading) VALUES (new.id, new.text, new.heading); END;
-- Registre des vecteurs : une ligne par modèle d'embedding — sa table, dims, type. Le lecteur ne devine
-- jamais un nom de table : il lit ce registre. Aucune ligne = corpus cherchable en FTS5 seul.
CREATE TABLE vectors (model TEXT PRIMARY KEY, "table" TEXT NOT NULL UNIQUE, dims INTEGER NOT NULL,
  dtype TEXT NOT NULL CHECK (dtype IN ('int8', 'f16')), built_at TEXT NOT NULL, count INTEGER NOT NULL) WITHOUT ROWID;
-- Un passage cité : locator = resource_id/path#byte_offset, stable d'une version du format à l'autre.
CREATE VIEW passages AS SELECT c.id AS chunk_id,
  (SELECT value FROM meta WHERE key = 'resource_id') || '/' || a.path || '#' || c.byte_offset AS locator,
  a.path, a.title, a.url, c.heading, c.ordinal, c.byte_offset, c.byte_length, c.text, c.assets, c.kind
  FROM chunks c JOIN articles a ON a.id = c.article;
`;

/** `vectors_<model>` : « bge-m3 » → vectors_bge_m3, « nomic-embed-text:v1.5@256 » → vectors_nomic_embed_text_v1_5_256. */
export const vectorsTable = (model: string): string => 'vectors_' + model.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Le DDL d'une table de vecteurs — ajoutable à une base publiée sans toucher au texte (M1-4). */
export const vectorsTableSql = (model: string): string =>
  `CREATE TABLE IF NOT EXISTS "${vectorsTable(model)}" (chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE, vec BLOB NOT NULL, norm REAL)`;

/** Ouvre un corpus. `create` pose le schéma sur une base neuve ; sinon la base doit être au format courant. */
export function openCorpus(file: string, o: { create?: boolean; readonly?: boolean } = {}): DatabaseSync {
  const db = new DatabaseSync(file, { readOnly: !!o.readonly && !o.create });
  if (o.create) db.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${FORMAT_VERSION};${SCHEMA_SQL}`);
  const { application_id: id } = db.prepare('PRAGMA application_id').get() as { application_id: number };
  const { user_version: v } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (id !== APPLICATION_ID || v !== FORMAT_VERSION) { db.close(); throw new Error(`${file} : pas un corpus Arche au format ${FORMAT_VERSION} (application_id 0x${id.toString(16)}, user_version ${v})`); }
  return db;
}

/** Les métadonnées d'un corpus, en clair. / A corpus' metadata as a plain record. */
export const readMeta = (db: DatabaseSync): Record<string, string> =>
  Object.fromEntries((db.prepare('SELECT key, value FROM meta').all() as Array<{ key: string; value: string }>).map(r => [r.key, r.value]));

/** Une ligne du registre `vectors` : le lecteur ne devine jamais un nom de table, il lit ceci. */
export interface VectorTable { model: string; table: string; dims: number; dtype: 'int8' | 'f16'; count: number }

/** Les tables de vecteurs que la base porte (zéro ligne : corpus cherchable en FTS5 seul). */
export const vectorTables = (db: DatabaseSync): VectorTable[] =>
  db.prepare('SELECT model, "table", dims, dtype, count FROM vectors ORDER BY model').all() as unknown as VectorTable[];
