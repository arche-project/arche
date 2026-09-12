// Mesure la latence du canal `sqlite` (M1-3, critère 4) sur un corpus synthétique de N chunks :
// FTS5 (BM25), cosinus exhaustif à froid (première question du processus : les vecteurs sont lus
// depuis le fichier) et à chaud (les suivantes : bloc en mémoire), et `retrieve()` complet.
// Le corpus est construit une fois dans un dossier temporaire (texte pseudo-naturel zipfien, vecteurs
// int8 aléatoires normalisés) et réutilisé ; rien n'est téléchargé, rien n'entre dans le dépôt.
//
// Usage : npx tsx scripts/index/bench-retrieve.ts [--chunks 100000] [--dims 1024] [--queries 20] [--json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openCorpus, quantize, vectorTables, vectorsTable, vectorsTableSql, FORMAT_VERSION } from '../../src/core/rag/sqlite.js';
import { retrieve, ftsQuery, ftsSearch, vectorSearch } from '../../src/core/rag/retrieve.js';
import { Embedder } from '../../src/core/rag/embed.js';

const arg = (name: string, def: number) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : def; };
const N = arg('chunks', 100_000), DIMS = arg('dims', 1024), QUERIES = arg('queries', 20), json = process.argv.includes('--json');
const lib = path.join(os.tmpdir(), 'arche-bench-retrieve'), file = path.join(lib, 'index', `bench-${N}-${DIMS}.arche.sqlite`);

// Prose pseudo-naturelle déterministe (vocabulaire zipfien de 4 000 mots) : FTS5 se comporte comme sur du vrai texte.
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const syll = ['ba', 'ri', 'to', 'mé', 'lu', 'sa', 'vé', 'no', 'cha', 'pi', 'dor', 'fen', 'gu', 'tra', 'ou', 'ké', 'zi', 'plan', 'tor', 'mi'];
const vocab = Array.from({ length: 4000 }, () => Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => syll[Math.floor(rnd() * syll.length)]).join(''));
const word = () => vocab[Math.floor(rnd() ** 2 * vocab.length)]!;
const sentence = () => Array.from({ length: 8 + Math.floor(rnd() * 10) }, word).join(' ') + '.';

function build(): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) return;
  const t = performance.now();
  const db = openCorpus(file, { create: true });
  db.exec(`PRAGMA synchronous = OFF; PRAGMA journal_mode = OFF; ${vectorsTableSql('bench')}`);
  const meta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries({ format_version: String(FORMAT_VERSION), resource_id: 'bench', built_at: new Date().toISOString(), license_spdx: 'CC0-1.0', license_redistribution: 'allowed', languages: 'fr', chunker: 'structure/1200/2000/150/200' })) meta.run(k, v);
  const art = db.prepare('INSERT INTO articles (path, title, url) VALUES (?, ?, ?)');
  const chunk = db.prepare('INSERT INTO chunks (article, ordinal, heading, byte_offset, byte_length, text) VALUES (?, ?, ?, ?, ?, ?)');
  const vec = db.prepare(`INSERT INTO "${vectorsTable('bench')}" (chunk_id, vec, norm) VALUES (?, ?, 1.0)`);
  const v = new Float32Array(DIMS), q = new Int8Array(DIMS);
  db.exec('BEGIN');
  for (let i = 0, a = 0; i < N; i++) {
    if (i % 8 === 0) a = Number(art.run(`A/article-${i / 8}`, `Article ${i / 8}`, `arche://article/bench/A/article-${i / 8}`).lastInsertRowid);
    const text = Array.from({ length: 6 }, sentence).join(' ');
    const id = Number(chunk.run(a, i % 8, `Section ${i % 8}`, 0, Buffer.byteLength(text), text).lastInsertRowid);
    for (let d = 0; d < DIMS; d++) v[d] = rnd() - 0.5;
    quantize(v, q, 0); vec.run(id, Buffer.from(q.buffer.slice(0)));
    if (i % 5000 === 4999) { db.exec('COMMIT; BEGIN'); process.stderr.write(`\r${i + 1}/${N}`); }
  }
  db.exec('COMMIT');
  db.prepare('INSERT INTO vectors (model, "table", dims, dtype, built_at, count) VALUES (?, ?, ?, \'int8\', ?, ?)').run('bench', vectorsTable('bench'), DIMS, new Date().toISOString(), N);
  db.exec("INSERT INTO chunks_fts (chunks_fts) VALUES ('optimize'); PRAGMA journal_mode = DELETE; VACUUM");
  db.close();
  process.stderr.write(`\rcorpus construit : ${N} chunks × ${DIMS} d, ${(fs.statSync(file).size / 1e6).toFixed(0)} Mo, ${((performance.now() - t) / 1000).toFixed(0)} s\n`);
}

/** Un faux embedder : vecteur déterministe par hachage de mots (pas d'Ollama dans une mesure de lecture). */
function fakeEmbedder(): Embedder {
  const e = Object.create(Embedder.prototype) as Embedder;
  Object.defineProperty(e, 'model', { value: { id: 'bench', dims: DIMS, ram_gb: 0, multilingual: true, note: { fr: '', en: '' } } });
  (e as { embed: (t: string[]) => Promise<Float32Array[]> }).embed = async texts => texts.map(t => { const v = new Float32Array(DIMS); for (const w of t.split(/\W+/)) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % DIMS] += 1; } return v; });
  return e;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const ms = (fn: () => unknown, n = QUERIES) => { const t: number[] = []; for (let i = 0; i < n; i++) { const s = performance.now(); fn(); t.push(performance.now() - s); } return { median: median(t), max: Math.max(...t) }; };

build();
const queries = Array.from({ length: QUERIES }, () => Array.from({ length: 4 }, word).join(' '));
const db = openCorpus(file, { readonly: true });
const vt = vectorTables(db)[0]!;
const q = new Int8Array(DIMS); { const v = new Float32Array(DIMS); for (let d = 0; d < DIMS; d++) v[d] = rnd() - 0.5; quantize(v, q, 0); }
let qi = 0;
const fts = ms(() => ftsSearch(db, ftsQuery(queries[qi++ % QUERIES]!)!, 16));
const cold = ms(() => vectorSearch(db, file, vt, q, 16), 1);      // première lecture : les lignes viennent du fichier
const warm = ms(() => vectorSearch(db, file, vt, q, 16));         // les suivantes : bloc en mémoire
db.close();
const down = (async () => { throw new Error('kiwix-serve absent'); }) as unknown as typeof fetch;
const emb = fakeEmbedder();
const full: number[] = [];
for (let i = 0; i < QUERIES; i++) { const s = performance.now(); await retrieve(queries[i]!, { lib, fetchImpl: down, embedder: emb, k: 8 }); full.push(performance.now() - s); }
const out = { chunks: N, dims: DIMS, file_mb: Math.round(fs.statSync(file).size / 1e6), cpu: os.cpus()[0]?.model ?? '?', node: process.version,
  fts5_ms: Math.round(fts.median), vec_cold_ms: Math.round(cold.median), vec_warm_ms: Math.round(warm.median), retrieve_warm_ms: Math.round(median(full)), retrieve_max_ms: Math.round(Math.max(...full)) };
if (json) console.log(JSON.stringify(out));
else console.log(`${N} chunks × ${DIMS} d (${out.file_mb} Mo) — ${out.cpu}, Node ${out.node}\n  FTS5 (BM25, 4 mots) : ${out.fts5_ms} ms médian\n  cosinus à froid (1re question du processus, lecture des lignes) : ${out.vec_cold_ms} ms\n  cosinus à chaud (bloc en mémoire) : ${out.vec_warm_ms} ms médian\n  retrieve() complet à chaud (FTS5 + cosinus + RRF, kiwix-serve absent) : ${out.retrieve_warm_ms} ms médian, ${out.retrieve_max_ms} ms max`);
