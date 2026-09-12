// M1-3 — le canal `sqlite` de la recherche (ADR 0014) : FTS5 + cosinus lus dans la base du corpus,
// fusion RRF, lecture d'un article entier depuis articles/chunks — sans kiwix-serve, sans index/text,
// sans .arche-idx. Le corpus fixture est construit une fois, dans un dossier temporaire, avec le faux embedder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildShard } from '../src/core/rag/build.js';
import { extractDir } from '../src/core/rag/extract.js';
import { openCorpus, quantize, vectorTables, vectorsTableSql, vectorsTable } from '../src/core/rag/sqlite.js';
import { retrieve, ftsQuery, ftsSearch, vectorSearch, readCorpusArticle, listCorpora, corpusFile } from '../src/core/rag/retrieve.js';
import { createMcpServer } from '../src/core/mcp/server.js';
import { fakeEmbedder, fakeVector, FAKE_DIMS } from './helpers/fake-embedder.js';
import { writeFixtureDocs, CITERNE_SENTENCE, FLUSH_SENTENCE } from './helpers/fixture-docs.js';

const META = { license_spdx: 'CC-BY-SA-4.0', license_redistribution: 'attribution', languages: ['fr'], title: 'Documents de test', source_kind: 'dir' };
/** kiwix-serve absent : le canal xapian tombe en erreur, et rien d'autre ne doit toucher au réseau. */
const down = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-retrieve-'));
const docs = path.join(lib, 'docs'); writeFixtureDocs(docs);
const corpus = path.join(lib, 'index', 'user-docs.arche.sqlite');
const built = await buildShard({ resourceId: 'user-docs', articles: extractDir(docs), embedder: fakeEmbedder(), out: corpus, meta: META });
// Ce qui traîne à côté n'est pas un corpus : un .zst pas encore décompressé, des notes.
fs.writeFileSync(path.join(lib, 'index', 'user-docs.arche.sqlite.zst'), 'pas encore décompressé');
fs.writeFileSync(path.join(lib, 'index', 'notes.txt'), 'rien');
after(() => fs.rmSync(lib, { recursive: true, force: true }));

test('critère 1 — search answers on a SQLite corpus alone: no kiwix-serve, no index/text, no .arche-idx', async () => {
  assert.deepEqual(listCorpora(lib), [corpus], 'seuls les .arche.sqlite sont des corpus');
  assert.ok(!fs.existsSync(path.join(lib, 'index', 'text')) && !fs.readdirSync(path.join(lib, 'index')).some(f => f.endsWith('.arche-idx')));
  const r = await retrieve('volve anneau champignon', { lib, fetchImpl: down, embedder: fakeEmbedder(), k: 5 });
  // Critère 2 : les canaux rapportés sont xapian | sqlite, jamais cachés.
  assert.deepEqual(Object.keys(r.channels).sort(), ['detail', 'sqlite', 'xapian']);
  assert.equal(r.channels.xapian, 'error'); assert.equal(r.channels.sqlite, 'ok');
  assert.equal(r.channels.detail, 'xapian : ECONNREFUSED', 'la seule anomalie est kiwix-serve absent — aucun texte n’a été demandé au réseau');
  const p = r.passages[0]!;
  assert.equal(p.n, 1); assert.equal(p.resource_id, 'user-docs'); assert.equal(p.title, 'Amanite phalloïde');
  assert.ok(p.text.includes('volve'), 'le texte vient de chunks.text');
  assert.equal(p.url, 'arche://article/user-docs/amanite.html');
  assert.match(p.id, /^user-docs\/amanite\.html#\d+$/, 'l’identifiant est le locator de la vue passages');
  assert.deepEqual(p.via, ['fts', 'vec'], 'trouvé par FTS5 ET par le cosinus : les deux listes fusionnent sur le même locator');
  assert.deepEqual(p.assets, ['amanite.jpg']);
  assert.ok(r.passages.length >= 2 && r.passages.every(x => x.resource_id === 'user-docs' && x.text));
  // Restreindre à un corpus par son resource_id ; un autre nom → rien, et le canal est « off », pas en erreur.
  assert.equal((await retrieve('volve', { lib, fetchImpl: down, embedder: fakeEmbedder(), books: ['user-docs'] })).passages[0]!.title, 'Amanite phalloïde');
  const none = await retrieve('volve', { lib, fetchImpl: down, embedder: fakeEmbedder(), books: ['autre-corpus'] });
  assert.deepEqual(none.passages, []); assert.equal(none.channels.sqlite, 'off');
  // Une base illisible à côté ne fait pas tomber la recherche : elle est nommée dans detail.
  const lib2 = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-retrieve-bad-'));
  fs.mkdirSync(path.join(lib2, 'index')); fs.writeFileSync(path.join(lib2, 'index', 'bad.arche.sqlite'), 'pas une base');
  const bad = await retrieve('volve', { lib: lib2, fetchImpl: down });
  assert.equal(bad.channels.sqlite, 'error'); assert.match(bad.channels.detail!, /bad\.arche\.sqlite/);
  fs.rmSync(lib2, { recursive: true, force: true });
});

test('a corpus without the requested model, or without Ollama, answers in FTS5 alone and says so', async () => {
  // Pas d'embedder, pas de modèle demandé : la base n'a que fake-64, inconnu d'Ollama → FTS5 seul, aucun appel réseau.
  const fts = await retrieve('compost paillage rotation', { lib, fetchImpl: down, k: 4 });
  assert.equal(fts.channels.sqlite, 'ok');
  assert.match(fts.channels.detail!, /sans vecteurs d’un modèle connu \(FTS5 seul\) : user-docs/);
  assert.match((await retrieve('compost', { lib, fetchImpl: down, model: 'bge-m3' })).channels.detail!, /sans vecteurs bge-m3 \(FTS5 seul\) : user-docs/, 'un modèle demandé et absent est nommé');
  assert.ok(fts.passages.length >= 3 && fts.passages.every(p => p.via.length === 1 && p.via[0] === 'fts' && p.title === 'Manuel du sol'));
  assert.ok(fts.passages.every(p => p.heading?.startsWith('Section ')), 'le titre de section du chunk est rendu');
  // Le modèle existe dans la base mais l'embedder tombe (Ollama coupé) : FTS5 seul, et dit.
  const cut = await retrieve('compost paillage rotation', { lib, fetchImpl: down, embedder: fakeEmbedder({ failAfter: 0 }), k: 4 });
  assert.match(cut.channels.detail!, /vecteurs fake-64 : coupure simulée — FTS5 seul/);
  assert.ok(cut.passages.length >= 3 && cut.passages.every(p => p.via.join() === 'fts'));
  // Sans modèle demandé, la base porte un modèle qu'Ollama connaît : c'est lui qui est choisi (ici Ollama est injoignable → FTS5 seul, et dit).
  const lib3 = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-retrieve-e5-'));
  fs.mkdirSync(path.join(lib3, 'index')); fs.copyFileSync(corpus, path.join(lib3, 'index', 'user-docs.arche.sqlite'));
  const e5 = openCorpus(path.join(lib3, 'index', 'user-docs.arche.sqlite'));
  e5.exec(`CREATE TABLE "${vectorsTable('multilingual-e5-small')}" AS SELECT * FROM "${vectorsTable('fake-64')}"; INSERT INTO vectors (model, "table", dims, dtype, built_at, count) VALUES ('multilingual-e5-small', '${vectorsTable('multilingual-e5-small')}', 384, 'int8', '', 0)`);
  e5.close();
  const host = process.env['OLLAMA_HOST']; process.env['OLLAMA_HOST'] = 'http://127.0.0.1:1';
  try {
    const picked = await retrieve('compost paillage rotation', { lib: lib3, fetchImpl: down, k: 4 });
    assert.match(picked.channels.detail!, /vecteurs multilingual-e5-small : .* — FTS5 seul/);
    assert.ok(picked.passages.length >= 3 && picked.passages.every(p => p.via.join() === 'fts'));
  } finally { if (host === undefined) delete process.env['OLLAMA_HOST']; else process.env['OLLAMA_HOST'] = host; fs.rmSync(lib3, { recursive: true, force: true }); }
  // Le modèle est là : les deux moitiés du canal répondent.
  const both = await retrieve('compost paillage rotation', { lib, fetchImpl: down, embedder: fakeEmbedder(), k: 4 });
  assert.ok(both.passages.some(p => p.via.includes('vec')) && both.passages.some(p => p.via.includes('fts')));
  assert.ok(both.passages.filter(p => p.resource_id === 'user-docs').length <= 4, 'diversification : k respecté');
});

test('the FTS5 expression is built safely from plain language; nothing to search → no lexical, no error', async () => {
  assert.equal(ftsQuery('Comment traiter une "déshydratation" ? NEAR(a b) AND (urgence) urgence'), '"comment" OR "traiter" OR "une" OR "déshydratation" OR "near" OR "and" OR "urgence"');
  assert.equal(ftsQuery('? ! … a'), null);
  const db = openCorpus(corpus, { readonly: true });
  try {
    assert.equal(ftsSearch(db, ftsQuery('poussiere (fientes) "toiture"')!, 5).length, 1, 'remove_diacritics : « poussiere » trouve « poussière », la ponctuation est ignorée');
    assert.deepEqual(ftsSearch(db, ftsQuery('zzz-introuvable')!, 5), []);
    const hits = ftsSearch(db, ftsQuery('compost')!, 3);
    assert.equal(hits.length, 3); assert.ok(hits[0]!.score >= hits[1]!.score && hits[1]!.score >= hits[2]!.score, 'score décroissant (−bm25)');
  } finally { db.close(); }
  const r = await retrieve('?', { lib, fetchImpl: down, embedder: fakeEmbedder() });
  assert.equal(r.channels.sqlite, 'ok'); assert.ok(r.passages.length >= 1, 'les vecteurs répondent même sans mot cherchable');
});

test('vectorSearch: exact cosine, top-k in order, blocks with non-contiguous ids, per-process cache invalidated on rebuild', async () => {
  const db = openCorpus(corpus, { readonly: true });
  try {
    const vt = vectorTables(db)[0]!;
    assert.deepEqual({ model: vt.model, dims: vt.dims, dtype: vt.dtype, count: vt.count }, { model: 'fake-64', dims: FAKE_DIMS, dtype: 'int8', count: built.chunks });
    const { id, text } = db.prepare('SELECT id, text FROM chunks WHERE id = 7').get() as { id: number; text: string };
    const q = new Int8Array(FAKE_DIMS); quantize(fakeVector(text), q, 0);
    const hits = vectorSearch(db, corpus, vt, q, 3);
    assert.equal(hits.length, 3); assert.equal(hits[0]!.chunk_id, id); assert.ok(hits[0]!.score > 0.98 && hits[0]!.score < 1.03, `cosinus avec lui-même ≈ 1 (à l’arrondi int8 près) : ${hits[0]!.score}`);
    assert.ok(hits[0]!.score >= hits[1]!.score && hits[1]!.score >= hits[2]!.score);
    assert.deepEqual(vectorSearch(db, corpus, vt, q, 3), hits, 'deuxième appel : depuis le cache, même résultat');
    assert.throws(() => vectorSearch(db, corpus, vt, new Int8Array(8), 3), /dimensions/);
  } finally { db.close(); }
  // Une table de 10 000 vecteurs de 8 dimensions aux ids non contigus, lue par plusieurs blocs : le meilleur est trouvé, avec le bon id.
  const file = path.join(lib, 'blocks.arche.sqlite');
  const w = openCorpus(file, { create: true });
  w.exec(vectorsTableSql('m8'));
  w.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('resource_id', 'blocks');
  const art = Number(w.prepare("INSERT INTO articles (path, title) VALUES ('A/x', 'x')").run().lastInsertRowid);
  const chunk = w.prepare("INSERT INTO chunks (id, article, ordinal, byte_offset, byte_length, text) VALUES (?, ?, ?, 0, 1, 'x')");
  const ins = w.prepare(`INSERT INTO "${vectorsTable('m8')}" (chunk_id, vec, norm) VALUES (?, ?, 1.0)`);
  w.exec('BEGIN');
  for (let i = 0; i < 10_000; i++) { const v = new Int8Array(8); v[i % 8] = 100 + (i % 27); v[(i + 3) % 8] = -(i % 50); chunk.run(i * 3 + 1, art, i); ins.run(i * 3 + 1, Buffer.from(v.buffer)); }
  w.prepare('INSERT INTO vectors (model, "table", dims, dtype, built_at, count) VALUES (?, ?, 8, \'int8\', \'\', 10000)').run('m8', vectorsTable('m8'));
  w.exec('COMMIT'); w.close();
  const r = openCorpus(file, { readonly: true });
  try {
    const vt = vectorTables(r)[0]!;
    const q = Int8Array.from([127, 0, 0, 0, 0, 0, 0, 0]);
    // Le meilleur : v[0] = 126 (i % 8 === 0 et i % 27 === 26 → i = 80 mod 216), sans pénalité : chunk_id = i × 3 + 1.
    const best = vectorSearch(r, file, vt, q, 5);
    assert.equal(best[0]!.score, (126 * 127) / (127 * 127));
    assert.ok(best.every(h => (h.chunk_id - 1) % 3 === 0 && (h.chunk_id - 1) / 3 % 216 === 80), `ids ${best.map(h => h.chunk_id)}`);
    assert.equal(best.length, 5);
    // La base est reconstruite (autre contenu, autre mtime/taille) : le cache s'en aperçoit.
    r.close();
    fs.rmSync(file);
    const w2 = openCorpus(file, { create: true }); w2.exec(vectorsTableSql('m8'));
    w2.exec("INSERT INTO articles (id, path, title) VALUES (1, 'A/x', 'x'); INSERT INTO chunks (id, article, ordinal, byte_offset, byte_length, text) VALUES (42, 1, 0, 0, 1, 'x')");
    w2.prepare(`INSERT INTO "${vectorsTable('m8')}" (chunk_id, vec, norm) VALUES (?, ?, 1.0)`).run(42, Buffer.from(Int8Array.from([127, 0, 0, 0, 0, 0, 0, 0]).buffer));
    w2.prepare('INSERT INTO vectors (model, "table", dims, dtype, built_at, count) VALUES (?, ?, 8, \'int8\', \'\', 1)').run('m8', vectorsTable('m8'));
    w2.close();
    const r2 = openCorpus(file, { readonly: true });
    try { assert.deepEqual(vectorSearch(r2, file, vectorTables(r2)[0]!, q, 5), [{ chunk_id: 42, score: 1 }]); } finally { r2.close(); }
  } finally { try { r.close(); } catch { /* déjà fermée */ } }
});

test('read_article and arche://article/… read articles/chunks: overlap removed, headings back, ZIMs still through kiwix-serve', async () => {
  const db = openCorpus(corpus, { readonly: true });
  try {
    const a = readCorpusArticle(db, 'citerne.md')!;
    assert.equal(a.title, 'Dimensionner une citerne'); assert.equal(a.url, 'arche://article/user-docs/citerne.md');
    assert.equal(count(a.text, CITERNE_SENTENCE.trim()), 12, 'le recouvrement copié en tête du 2e chunk est retiré');
    assert.equal(count(a.text, FLUSH_SENTENCE.trim()), 10);
    assert.ok(a.text.includes('\n\n## Premier flush\n\n') && !a.text.includes('## Dimensionner'), 'les sections reviennent, le titre de l’article n’est pas répété');
    const m = readCorpusArticle(db, 'manuel.md')!;
    assert.equal(count(m.text, '## Section '), 45); assert.equal(count(m.text, 'demande du compost mûr'), 45 * 14);
    assert.equal(readCorpusArticle(db, 'nope.md'), null);
  } finally { db.close(); }
  assert.equal(corpusFile(lib, 'user-docs'), corpus); assert.equal(corpusFile(lib, '../docs/citerne'), null); assert.equal(corpusFile(lib, 'zimgit-water_fr'), null);

  const srv = createMcpServer({ lib, lang: 'fr', kiwixHost: 'http://kiwix.test', fetchImpl: down });
  const call = (method: string, params: Record<string, unknown>) => srv.handle({ jsonrpc: '2.0', id: 1, method, params });
  const read = (await call('tools/call', { name: 'read_article', arguments: { book: 'user-docs', path: 'citerne.md', max_chars: 5000 } }))!.result as { content: Array<{ text: string }>; isError: boolean };
  assert.equal(read.isError, false); assert.ok(read.content[0]!.text.startsWith('# Dimensionner une citerne\n\n')); assert.equal(count(read.content[0]!.text, CITERNE_SENTENCE.trim()), 12);
  const res = (await call('resources/read', { uri: 'arche://article/user-docs/amanite.html' }))!.result as { contents: Array<{ text: string }> };
  assert.ok(res.contents[0]!.text.startsWith('# Amanite phalloïde\n\n') && res.contents[0]!.text.includes('volve'));
  const missing = (await call('tools/call', { name: 'read_article', arguments: { book: 'user-docs', path: 'nope.md' } }))!.result as { content: Array<{ text: string }>; isError: boolean };
  assert.equal(missing.isError, true); assert.match(missing.content[0]!.text, /introuvable/);
  const zim = (await call('tools/call', { name: 'read_article', arguments: { book: 'zimgit-water_fr', path: 'A/Citerne' } }))!.result as { content: Array<{ text: string }>; isError: boolean };
  assert.equal(zim.isError, true); assert.match(zim.content[0]!.text, /ECONNREFUSED/, 'un livre sans corpus passe encore par kiwix-serve');
  const s = (await call('tools/call', { name: 'search', arguments: { query: 'volve anneau', k: 3 } }))!.result as { content: Array<{ text: string }>; isError: boolean; structuredContent: { channels: { xapian: string; sqlite: string } } };
  assert.equal(s.isError, false, 'un canal a répondu');
  assert.ok(s.content[0]!.text.includes('[1] user-docs — Amanite phalloïde') && s.content[0]!.text.includes('arche://article/user-docs/amanite.html'));
  assert.ok(s.content[0]!.text.includes('canaux : xapian=error sqlite=ok'));
  assert.deepEqual([s.structuredContent.channels.xapian, s.structuredContent.channels.sqlite], ['error', 'ok']);
});
