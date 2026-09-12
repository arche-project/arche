// Construire un corpus (ADR 0014) à partir d'une source : extraire → découper → écrire dans SQLite →
// embarquer. Build a corpus: extract → chunk → write to SQLite → embed.
//
// C'est ce que la CI fait pour des centaines de corpus (index-build.yml → Internet Archive) et ce
// que l'utilisateur fait chez lui pour ses propres PDF (`arche index add`). Deux exigences :
// - reprendre après une coupure : l'embedding de 1,5 million de chunks dure des heures sur CPU. Le
//   point de contrôle, c'est la base elle-même : transactions par lot, un article et ses chunks dans
//   la même transaction ; à la reprise, les articles déjà commis sont sautés et l'embedding repart
//   de max(chunk_id) de la table de vecteurs. Rien à côté du fichier ;
// - garder le texte : il est DANS la base (chunks.text + FTS5), pour un ZIM comme pour un PDF. Une
//   base sans `meta.built_at` est incomplète (et reprenable) ; `built_at` est écrit en dernier.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { DatabaseSync } from 'node:sqlite';
import { chunkArticle, attachAssets } from './chunk.js';
import { extractAssetLinks } from './assets.js';
import { Embedder } from './embed.js';
import { openCorpus, readMeta, quantize, vectorsTable, vectorsTableSql, FORMAT_VERSION } from './sqlite.js';
import type { Article } from './extract.js';

/** Ce que la base dit d'elle-même (clés `meta`, ADR 0014) : la licence est héritée du corpus, jamais « MIT » par défaut. */
export interface CorpusMeta {
  license_spdx: string;
  license_redistribution: string;
  languages: string[];
  title?: string;
  attribution?: string;
  source_kind?: string;
  source_sha256?: string | null;
}

export interface BuildOptions {
  resourceId: string;
  articles: AsyncIterable<Article> | Iterable<Article>;
  /** Absent : corpus FTS5 seul (aucune ligne dans `vectors`) — cherchable tout de suite, vecteurs ajoutables plus tard (M1-4). */ embedder?: Embedder;
  /** Fichier .arche.sqlite de sortie ; s'il existe et n'est pas fini, la construction reprend. */
  out: string;
  meta: CorpusMeta;
  /** Articles par transaction (défaut 50) et lots d'embedding (32 chunks) par transaction (défaut 20). */
  batchArticles?: number;
  checkpointEvery?: number;
  onProgress?: (p: { phase: 'extract' | 'embed' | 'write'; articles: number; chunks: number; done: number }) => void;
  /** Pour les tests : limite le nombre d'articles. */
  limit?: number;
}

export interface BuildResult { // model = 'none' et dims = 0 pour un corpus FTS5 seul
  file: string; bytes: number; sha256: string; resourceId: string; model: string; dims: number; built_at: string;
  articles: number; chunks: number; skipped: number;
  /** Ce que la reprise a trouvé déjà fait dans la base. */
  resumed: { articles: number; chunks: number };
}

export const CHUNKER = 'structure/1200/2000/150/200';
const EMBED_BATCH = 32;
/** La première colonne d'une requête à une ligne (count(*), max(), PRAGMA …) ; 0 si NULL. */
const one = (db: DatabaseSync, sql: string): number => Number(Object.values(db.prepare(sql).get() as Record<string, unknown>)[0] ?? 0);

/** Ouvre la base de sortie : reprise si elle est incomplète et du même corpus, sinon on repart de zéro. */
function openForBuild(out: string, resourceId: string): { db: DatabaseSync; fresh: boolean } {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (fs.existsSync(out)) {
    try {
      const db = openCorpus(out);
      const m = readMeta(db);
      if (m['resource_id'] === resourceId && !m['built_at']) return { db, fresh: false };
      db.close();
    } catch { /* illisible (coupure de courant en pleine écriture) : le fichier est jetable jusqu'à built_at */ }
    fs.rmSync(out); fs.rmSync(`${out}-journal`, { force: true });
  }
  return { db: openCorpus(out, { create: true }), fresh: true };
}

/**
 * Construit le corpus. Idempotent et reprenable : relancé après une coupure, il ré-extrait (rapide,
 * déterministe), saute les articles déjà commis et ne ré-embarque que les chunks sans vecteur.
 */
export async function buildShard(o: BuildOptions): Promise<BuildResult> {
  const every = o.checkpointEvery ?? 20, perTx = o.batchArticles ?? 50;
  const { db, fresh } = openForBuild(o.out, o.resourceId);
  // Sûr contre un processus tué (le journal est remis à l'OS avant chaque page) ; pas contre une
  // coupure de courant — auquel cas la base est jetée et reconstruite (voir openForBuild).
  db.exec('PRAGMA synchronous = OFF; PRAGMA journal_mode = TRUNCATE; PRAGMA cache_size = -65536');
  const metaSet = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
  const setMeta = (kv: Record<string, string | number | null | undefined>) => { for (const [k, v] of Object.entries(kv)) if (v !== undefined && v !== null) metaSet.run(k, String(v)); };
  if (fresh) setMeta({ format_version: FORMAT_VERSION, resource_id: o.resourceId, ...o.meta, languages: o.meta.languages.join(','), built_by: 'arche 0.1.0', chunker: CHUNKER });
  let inTx = false;
  const begin = () => { if (!inTx) { db.exec('BEGIN'); inTx = true; } };
  const commit = () => { if (inTx) { db.exec('COMMIT'); inTx = false; } };
  const resumed = { articles: 0, chunks: fresh ? 0 : one(db, 'SELECT count(*) FROM chunks') };

  // 1. Extraire et découper, un article et ses chunks par transaction de lot.
  const has = db.prepare('SELECT 1 FROM articles WHERE path = ?');
  const insArt = db.prepare('INSERT INTO articles (path, title, url) VALUES (?, ?, ?)');
  const insChunk = db.prepare('INSERT INTO chunks (article, ordinal, heading, byte_offset, byte_length, text, assets) VALUES (?, ?, ?, ?, ?, ?, ?)');
  let articles = 0, skipped = 0, sinceCommit = 0, chunks = resumed.chunks;
  for await (const a of o.articles as AsyncIterable<Article>) {
    if (o.limit && articles >= o.limit) break;
    if (!a.text || a.text.trim().length < 40) { skipped++; continue; }
    articles++;
    if (has.get(a.path)) { resumed.articles++; continue; }
    const links = a.assets?.map(p => ({ path: p })) ?? extractAssetLinks(a.text).map(l => ({ path: l.path }));
    const cs = attachAssets(chunkArticle(a.path, a.title, a.text), a.text, links);
    begin();
    const id = insArt.run(a.path, a.title, `arche://article/${o.resourceId}/${a.path}`).lastInsertRowid;
    cs.forEach((c, i) => insChunk.run(id, i, c.heading, c.offset, c.length, c.text, c.assets?.length ? JSON.stringify(c.assets) : null));
    chunks += cs.length;
    if (++sinceCommit >= perTx) { commit(); sinceCommit = 0; }
    o.onProgress?.({ phase: 'extract', articles, chunks, done: 0 });
  }
  commit();
  chunks = one(db, 'SELECT count(*) FROM chunks');
  if (!chunks) { db.close(); fs.rmSync(o.out); throw new Error(`${o.resourceId} : aucun chunk — la source est vide ou illisible`); }

  // 2. Embarquer, avec reprise : la table du modèle courant, remplie dans l'ordre des chunk_id. Sans embedder : FTS5 seul.
  const { id: model, dims } = o.embedder?.model ?? { id: 'none', dims: 0 }, table = vectorsTable(model); let done = 0;
  if (o.embedder) {
    db.exec(vectorsTableSql(model));
    db.prepare('INSERT OR IGNORE INTO vectors (model, "table", dims, dtype, built_at, count) VALUES (?, ?, ?, \'int8\', \'\', 0)').run(model, table, dims);
    const page = db.prepare(`SELECT id, text FROM chunks WHERE id > ? ORDER BY id LIMIT ${EMBED_BATCH}`);
    const insVec = db.prepare(`INSERT INTO "${table}" (chunk_id, vec, norm) VALUES (?, ?, ?)`);
    let last = one(db, `SELECT max(chunk_id) FROM "${table}"`); done = one(db, `SELECT count(*) FROM "${table}"`);
    const q = new Int8Array(dims);
    for (let sinceCkpt = 0; ;) {
      const rows = page.all(last) as Array<{ id: number; text: string }>;
      if (!rows.length) break;
      const vs = await o.embedder.embed(rows.map(r => o.embedder!.passageText(r.text)));
      begin();
      vs.forEach((v, i) => { quantize(v, q, 0); insVec.run(rows[i]!.id, Buffer.from(q), Math.hypot(...v)); last = rows[i]!.id; });
      done += rows.length;
      if (++sinceCkpt >= every) { commit(); sinceCkpt = 0; }
      o.onProgress?.({ phase: 'embed', articles, chunks, done });
    }
    commit();
  }

  // 3. Finir : compteurs, FTS5 optimisé, journal normal, VACUUM, vérification — et built_at en dernier.
  const built_at = new Date().toISOString(), nArticles = one(db, 'SELECT count(*) FROM articles');
  if (o.embedder) db.prepare('UPDATE vectors SET count = ?, built_at = ? WHERE model = ?').run(done, built_at, model);
  setMeta({ articles: nArticles, chunks });
  db.exec("INSERT INTO chunks_fts (chunks_fts) VALUES ('optimize'); PRAGMA journal_mode = DELETE; VACUUM; PRAGMA synchronous = FULL");
  const check = (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
  if (check !== 'ok') { db.close(); throw new Error(`${o.out} : integrity_check = ${check}`); }
  setMeta({ built_at });
  db.close();
  o.onProgress?.({ phase: 'write', articles, chunks, done });
  const sha256 = createHash('sha256').update(fs.readFileSync(o.out)).digest('hex');
  return { file: o.out, bytes: fs.statSync(o.out).size, sha256, resourceId: o.resourceId, model, dims, built_at, articles: nArticles, chunks, skipped, resumed };
}

/** `zstd -19 -T0` sur le fichier si le binaire est là (transport, ADR 0014) ; null sinon — sans échouer. */
export function compressZstd(file: string): { file: string; bytes: number; sha256: string } | null {
  const r = spawnSync('zstd', ['-19', '-T0', '-q', '-f', file, '-o', `${file}.zst`], { stdio: 'ignore' });
  if (r.error || r.status !== 0) return null;
  return { file: `${file}.zst`, bytes: fs.statSync(`${file}.zst`).size, sha256: createHash('sha256').update(fs.readFileSync(`${file}.zst`)).digest('hex') };
}

export interface SizeEstimate {
  articles: number; chunks: number;
  /** Octets de texte des chunks (recouvrement compris). */
  text_bytes: number;
  /** Texte + FTS5 + lignes, mesuré sur une base en mémoire (échantillon, extrapolé au-delà de `sample` articles). */
  sqlite_text_bytes: number;
  /** dims octets par chunk (int8) + en-têtes de lignes. */
  vectors_bytes: number;
  sqlite_bytes: number;
  /** Ordre de grandeur du .zst : texte et FTS5 ≈ ÷ 5, vecteurs int8 ≈ × 1. */
  zst_bytes: number;
  sampled: boolean;
}

/**
 * Prédit la taille de la base SANS embarquer : les articles sont découpés et insérés (texte + FTS5,
 * la vraie chose) dans une base en mémoire dont on lit le nombre de pages ; au-delà de `sample`
 * articles on extrapole depuis l'échantillon ; les vecteurs int8 se comptent (dims × chunks).
 */
export async function estimateCorpus(articles: AsyncIterable<Article> | Iterable<Article>, o: { resourceId: string; dims: number; sample?: number; limit?: number }): Promise<SizeEstimate> {
  const sample = o.sample ?? 2000;
  const db = openCorpus(':memory:', { create: true });
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('resource_id', o.resourceId);
  const insArt = db.prepare('INSERT INTO articles (path, title, url) VALUES (?, ?, ?)');
  const insChunk = db.prepare('INSERT INTO chunks (article, ordinal, heading, byte_offset, byte_length, text) VALUES (?, ?, ?, ?, ?, ?)');
  const empty = one(db, 'PRAGMA page_count') * one(db, 'PRAGMA page_size');
  let n = 0, chunks = 0, text = 0, sampledText = 0;
  db.exec('BEGIN');
  for await (const a of articles as AsyncIterable<Article>) {
    if (o.limit && n >= o.limit) break;
    if (!a.text || a.text.trim().length < 40) continue;
    const cs = chunkArticle(a.path, a.title, a.text);
    const bytes = cs.reduce((s, c) => s + Buffer.byteLength(c.text, 'utf8'), 0);
    n++; chunks += cs.length; text += bytes;
    if (n > sample) continue;
    sampledText += bytes;
    const id = insArt.run(a.path, a.title, `arche://article/${o.resourceId}/${a.path}`).lastInsertRowid;
    cs.forEach((c, i) => insChunk.run(id, i, c.heading, c.offset, c.length, c.text));
  }
  db.exec("COMMIT; INSERT INTO chunks_fts (chunks_fts) VALUES ('optimize'); VACUUM");
  const measured = one(db, 'PRAGMA page_count') * one(db, 'PRAGMA page_size');
  db.close();
  const sqlite_text_bytes = Math.round(n > sample && sampledText ? empty + (measured - empty) * (text / sampledText) : measured);
  const vectors_bytes = chunks * (o.dims + 12);
  return { articles: n, chunks, text_bytes: text, sqlite_text_bytes, vectors_bytes, sqlite_bytes: sqlite_text_bytes + vectors_bytes, zst_bytes: Math.round(sqlite_text_bytes / 5 + vectors_bytes * 0.95), sampled: n > sample };
}
