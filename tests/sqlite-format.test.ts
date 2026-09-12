// ADR 0014 — le format de corpus SQLite. Les requêtes de l'ADR sont exécutées ici, sur un corpus
// minuscule construit à la volée : ce que la page affirme doit tourner, sur node:sqlite, en Python
// (standard library) et avec le shell sqlite3 quand il est installé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL, FORMAT_VERSION, APPLICATION_ID, openCorpus, readMeta, vectorsTable, vectorsTableSql } from '../src/core/rag/sqlite.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const ADR = fs.readFileSync(path.join(ROOT, 'docs/adr/0014-format-sqlite.md'), 'utf8');
const RESOURCE = 'pdf-ou-il-ny-a-pas-de-docteur';
const MODEL = 'fake-64';
const DIMS = 64;

/** Les blocs de code de l'ADR par langage — `sql` exact (pas `sql template`). */
const blocks = (lang: string): string[] => [...ADR.matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g'))].map(m => m[1]!);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Le même faux embedder que index.test.ts : hachage de mots sur 64 dimensions, puis int8 normalisé × 127. */
function embed(text: string): Float32Array {
  const v = new Float32Array(DIMS);
  for (const w of text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % DIMS] += 1; }
  const n = Math.hypot(...v) || 1; return v.map(x => x / n);
}
const int8 = (v: Float32Array): Int8Array => Int8Array.from(v, x => Math.max(-127, Math.min(127, Math.round(x * 127))));

const ARTICLES: Array<{ path: string; title: string; chunks: Array<{ heading: string; text: string }> }> = [
  { path: 'A/Diarrhee', title: 'Diarrhée et déshydratation', chunks: [
    { heading: 'Réhydratation', text: "La diarrhée fait perdre de l'eau et des sels ; chez l'enfant, la déshydratation tue vite. Préparez une solution de réhydratation orale : un litre d'eau bouillie et refroidie, huit cuillères à café rases de sucre et une demi-cuillère à café de sel. Donnez-en à boire à petites gorgées, souvent." },
    { heading: 'Signes de danger', text: 'Yeux enfoncés, peau qui garde le pli, urines rares et foncées : la déshydratation est grave. Continuez la solution et cherchez de l’aide.' },
  ] },
  { path: 'A/Eau', title: 'Eau potable', chunks: [{ heading: "Rendre l'eau sûre", text: "Faire bouillir l'eau à gros bouillons pendant une minute la rend sûre à boire. Un filtre à sable lent retient les parasites mais pas tous les microbes." }] },
  { path: 'A/Brulures', title: 'Brûlures', chunks: [{ heading: 'Premiers gestes', text: "Refroidir la brûlure sous l'eau fraîche pendant dix minutes. Ne pas percer les cloques. Couvrir d'un linge propre." }] },
];

/** Construit le corpus fixture dans un dossier temporaire et rend son chemin. */
function buildFixture(): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-sqlite-'));
  const file = path.join(dir, `${RESOURCE}.arche.sqlite`);
  const db = openCorpus(file, { create: true });
  db.exec(vectorsTableSql(MODEL));
  const meta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries({ format_version: String(FORMAT_VERSION), resource_id: RESOURCE, built_at: '2026-09-12T00:00:00Z', license_spdx: 'LicenseRef-Hesperian-Open-Copyright', license_redistribution: 'allowed-nc', languages: 'fr', source_kind: 'pdf', attribution: 'Hesperian Health Guides, hesperian.org' })) meta.run(k, v);
  const art = db.prepare('INSERT INTO articles (path, title, url) VALUES (?, ?, ?)');
  const chunk = db.prepare('INSERT INTO chunks (article, ordinal, heading, byte_offset, byte_length, text) VALUES (?, ?, ?, ?, ?, ?)');
  const vec = db.prepare(`INSERT INTO "${vectorsTable(MODEL)}" (chunk_id, vec, norm) VALUES (?, ?, ?)`);
  let count = 0;
  for (const a of ARTICLES) {
    const id = Number(art.run(a.path, a.title, `arche://article/${RESOURCE}/${a.path}`).lastInsertRowid);
    let offset = 0;
    a.chunks.forEach((c, i) => {
      const len = Buffer.byteLength(c.text, 'utf8');
      const cid = Number(chunk.run(id, i, c.heading, offset, len, c.text).lastInsertRowid);
      vec.run(cid, Buffer.from(int8(embed(c.text)).buffer), 1.0);
      offset += len + 2; count++;
    });
  }
  db.prepare('INSERT INTO vectors (model, "table", dims, dtype, built_at, count) VALUES (?, ?, ?, ?, ?, ?)').run(MODEL, vectorsTable(MODEL), DIMS, 'int8', '2026-09-12T00:00:00Z', count);
  db.close();
  return { dir, file };
}

test('le schéma SQL de l’ADR 0014 est celui du code, et il se pose sur node:sqlite avec FTS5', () => {
  const [schema] = blocks('sql');
  assert.ok(schema, 'l’ADR doit contenir un bloc ```sql — le schéma');
  assert.equal(norm(schema), norm(SCHEMA_SQL), 'docs/adr/0014-format-sqlite.md et src/core/rag/sqlite.ts doivent porter le même schéma');
  const db = openCorpus(':memory:', { create: true });
  const names = (db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'chunks_fts_%' ORDER BY name").all() as Array<{ name: string }>).map(r => r.name);
  assert.deepEqual(names, ['articles', 'chunks', 'chunks_fts', 'meta', 'passages', 'vectors']);
  assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, FORMAT_VERSION);
  assert.equal((db.prepare('PRAGMA application_id').get() as { application_id: number }).application_id, APPLICATION_ID);
  db.close();
  // Une base quelconque n'est pas un corpus Arche : refus explicite, pas de lecture hasardeuse.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-sqlite-'));
  const foreign = path.join(dir, 'autre.sqlite');
  new DatabaseSync(foreign).exec('CREATE TABLE t (x)');
  assert.throws(() => openCorpus(foreign), /pas un corpus Arche au format 1/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('chaque requête de référence de l’ADR s’exécute sur le corpus fixture et rend ce qu’elle promet', () => {
  const { dir, file } = buildFixture();
  try {
    const db = openCorpus(file, { readonly: true });
    const [, ...queries] = blocks('sql');
    assert.ok(queries.length >= 5, `au moins cinq requêtes de référence (${queries.length} trouvées)`);
    const results = queries.map(q => db.prepare(q).all() as Array<Record<string, unknown>>);
    // 1. FTS5 : accents et casse ignorés, snippet marqué, le meilleur passage d'abord.
    const fts = results[0]!;
    assert.equal(fts[0]!['locator'], `${RESOURCE}/A/Diarrhee#0`);
    assert.match(String(fts[0]!['extrait']), /\[(dés|ré)hydratation\]/);
    assert.equal(fts.length, 2, 'les deux chunks de l’article Diarrhée, pas les autres');
    // 2. Le registre des modèles.
    assert.deepEqual(results[1]!.map(r => [r['model'], r['table'], r['dims'], r['dtype'], r['count']]), [[MODEL, vectorsTable(MODEL), DIMS, 'int8', 4]]);
    // 3. Lire un article : ses chunks dans l'ordre.
    assert.deepEqual(results[2]!.map(r => r['ordinal']), [0, 1]);
    assert.equal(results[2]![0]!['heading'], 'Réhydratation');
    // 4. La licence héritée est lisible en clair.
    const meta = Object.fromEntries(results[3]!.map(r => [r['key'], r['value']]));
    assert.equal(meta['license_spdx'], 'LicenseRef-Hesperian-Open-Copyright');
    assert.equal(meta['license_redistribution'], 'allowed-nc');
    assert.deepEqual(readMeta(db), meta);
    // 5. Un locator résout vers un passage et un seul.
    assert.equal(results[4]!.length, 1);
    assert.equal(results[4]![0]!['title'], 'Diarrhée et déshydratation');
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('le cosinus sur les blobs int8 retrouve le bon passage — en TypeScript et avec le script Python de l’ADR, sans Arche', () => {
  const { dir, file } = buildFixture();
  try {
    const query = embed('préparer une solution de réhydratation orale avec du sucre et du sel');
    const db = openCorpus(file, { readonly: true });
    const { table, dims, dtype } = db.prepare('SELECT "table", dims, dtype FROM vectors WHERE model = ?').get(MODEL) as { table: string; dims: number; dtype: string };
    assert.equal(dtype, 'int8');
    const q = int8(query);
    const scored: Array<[number, number]> = [];
    for (const row of db.prepare(`SELECT chunk_id, vec FROM "${table}"`).iterate() as Iterable<{ chunk_id: number; vec: Uint8Array }>) {
      const v = new Int8Array(row.vec.buffer, row.vec.byteOffset, dims);
      assert.equal(row.vec.byteLength, dims, 'un vec fait exactement dims octets en int8');
      let dot = 0; for (let i = 0; i < dims; i++) dot += v[i]! * q[i]!;
      scored.push([dot / (127 * 127), row.chunk_id]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const best = db.prepare('SELECT locator FROM passages WHERE chunk_id = ?').get(scored[0]![1]) as { locator: string };
    assert.equal(best.locator, `${RESOURCE}/A/Diarrhee#0`);
    assert.ok(scored[0]![0] > 0.3 && scored[0]![0] <= 1.0001, `cosinus plausible (${scored[0]![0]})`);
    db.close();

    // Le même calcul par le script Python de l'ADR, standard library seule — sauté si python3 manque.
    const [py] = blocks('python');
    assert.ok(py, 'l’ADR doit contenir le script Python du cosinus');
    const has = spawnSync('python3', ['-c', 'import sqlite3'], { encoding: 'utf8' });
    if (has.error || has.status !== 0) { console.log('  (python3 absent : la vérification du script Python est sautée)'); return; }
    const script = path.join(dir, 'cosinus.py');
    fs.writeFileSync(script, py);
    const r = spawnSync('python3', [script, file, MODEL], { input: JSON.stringify(Array.from(query)), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 4, 'les quatre chunks, classés');
    assert.ok(lines[0]!.includes(`${RESOURCE}/A/Diarrhee#0`), `Python trouve le même passage : ${lines[0]}`);
    assert.ok(Math.abs(Number(lines[0]!.split('\t')[0]) - scored[0]![0]) < 0.01, 'même cosinus à 0,01 près');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('la question « sans Arche » de l’ADR : la commande sqlite3, telle quelle', () => {
  const { dir, file } = buildFixture();
  try {
    const cmd = blocks('bash').find(b => b.startsWith('sqlite3'));
    assert.ok(cmd, 'l’ADR doit contenir la commande sqlite3');
    const sql = cmd.slice(cmd.indexOf('"') + 1, cmd.lastIndexOf('"'));
    const db = openCorpus(file, { readonly: true });
    const rows = db.prepare(sql).all() as Array<{ title: string; heading: string; reponse: string }>;
    db.close();
    assert.equal(rows[0]!.title, 'Diarrhée et déshydratation');
    assert.equal(rows[0]!.heading, 'Réhydratation');
    assert.ok(rows[0]!.reponse.includes('>réhydratation<'), rows[0]!.reponse);
    const has = spawnSync('sqlite3', ['-version'], { encoding: 'utf8' });
    if (has.error || has.status !== 0) { console.log('  (sqlite3 absent : la commande n’est vérifiée que par node:sqlite)'); return; }
    // Le sqlite3 système de macOS et de certaines images CI est compilé sans FTS5 : la commande de
    // l’ADR suppose un sqlite3 avec FTS5 (Debian, Homebrew, Windows officiel). On le dit, on ne triche pas.
    const fts5 = spawnSync('sqlite3', [':memory:', 'CREATE VIRTUAL TABLE t USING fts5(x);'], { encoding: 'utf8' });
    if (fts5.status !== 0) { console.log('  (sqlite3 sans FTS5 sur cette machine : la commande n’est vérifiée que par node:sqlite)'); return; }
    const r = spawnSync('sqlite3', ['-readonly', '-box', file, sql], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('>réhydratation<') && r.stdout.includes('Diarrhée'), r.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('une table de vecteurs s’ajoute et se retire sans toucher au texte ; les triggers tiennent FTS5 à jour', () => {
  const { dir, file } = buildFixture();
  try {
    assert.equal(vectorsTable('bge-m3'), 'vectors_bge_m3');
    assert.equal(vectorsTable('nomic-embed-text:v1.5@256'), 'vectors_nomic_embed_text_v1_5_256');
    const db = openCorpus(file);
    const fingerprint = () => db.prepare('SELECT count(*) AS n, sum(length(text)) AS bytes, (SELECT count(*) FROM articles) AS a, (SELECT count(*) FROM meta) AS m FROM chunks').get();
    const before = fingerprint();
    db.exec(vectorsTableSql('nomic-embed-text:v1.5@256'));
    db.prepare('INSERT INTO vectors (model, "table", dims, dtype, built_at, count) VALUES (?, ?, 256, ?, ?, 0)').run('nomic-embed-text:v1.5@256', 'vectors_nomic_embed_text_v1_5_256', 'int8', '2026-09-12T00:00:00Z');
    assert.equal((db.prepare('SELECT count(*) AS n FROM vectors').get() as { n: number }).n, 2);
    assert.deepEqual(fingerprint(), before, 'ajouter un modèle ne change ni le texte, ni les articles, ni meta');
    db.exec('DROP TABLE "vectors_nomic_embed_text_v1_5_256"; DELETE FROM vectors WHERE model = \'nomic-embed-text:v1.5@256\'');
    assert.equal((db.prepare('SELECT count(*) AS n FROM vectors').get() as { n: number }).n, 1);
    assert.deepEqual(fingerprint(), before);
    // FTS5 en contenu externe : les triggers suivent les suppressions — sinon l'index mentirait.
    assert.equal((db.prepare("SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH 'bouillir'").get() as { n: number }).n, 1);
    db.exec("DELETE FROM chunks WHERE article = (SELECT id FROM articles WHERE path = 'A/Eau')");
    assert.equal((db.prepare("SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH 'bouillir'").get() as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH 'bouillie'").get() as { n: number }).n, 1, 'l’autre article reste');
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('docs/fr/ARCHITECTURE.md et BASE-CONNAISSANCE.md renvoient à l’ADR 0014', () => {
  for (const f of ['docs/fr/ARCHITECTURE.md', 'docs/fr/BASE-CONNAISSANCE.md']) {
    const md = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(md.includes('0014-format-sqlite.md'), `${f} doit lier docs/adr/0014-format-sqlite.md`);
  }
});
