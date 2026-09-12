import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { articleFromHtml, articleFromMarkdown, articlesFromPdfText, listZip, readZipEntry, extractEpub, extractDir, extractSource, sourceKind } from '../src/core/rag/extract.js';
import { buildShard, estimateCorpus, compressZstd, CHUNKER } from '../src/core/rag/build.js';
import { openCorpus, readMeta, vectorsTable } from '../src/core/rag/sqlite.js';
import { fakeEmbedder, FAKE_DIMS } from './helpers/fake-embedder.js';
import { writeFixtureDocs } from './helpers/fixture-docs.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const META = { license_spdx: 'CC-BY-SA-4.0', license_redistribution: 'attribution', languages: ['fr'], title: 'Documents de test', source_kind: 'dir' };

const tables = (file: string) => { const db = openCorpus(file, { readonly: true }); try { return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'chunks_fts_%' ORDER BY name").all() as Array<{ name: string }>).map(r => r.name); } finally { db.close(); } };
// Ouvert en écriture : une base tuée au milieu d'une transaction a un journal à rejouer, ce qu'une ouverture en lecture seule refuse.
const one = (file: string, sql: string) => { const db = openCorpus(file); try { return Object.values(db.prepare(sql).get() as Record<string, unknown>)[0]; } finally { db.close(); } };

/** Fabrique un zip minimal (méthode deflate) — pour un EPUB de test sans dépendance. */
function makeZip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8'); const comp = deflateRawSync(data); const n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    parts.push(local, n, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += local.length + n.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(central.length / 2, 8); eocd.writeUInt16LE(central.length / 2, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, eocd]);
}

test('HTML, Markdown and PDF text become articles with titles, clean text and linked files', () => {
  const h = articleFromHtml('A/Pompe', '<html><head><title>Pompe à corde</title></head><body><nav>menu</nav><h2>Principe</h2><p>Un tuyau &amp; des pistons.</p><a href="pompe.stl">pièce</a><img src="schema.svg" alt="schéma"></body></html>');
  assert.equal(h.title, 'Pompe à corde');
  assert.ok(h.text.includes('Un tuyau & des pistons') && !h.text.includes('menu'));
  assert.deepEqual(h.assets, ['pompe.stl', 'schema.svg']);
  const m = articleFromMarkdown('notes/citerne.md', '# Citerne\n\nVolume = jours × conso. Voir [plan](citerne.dxf).');
  assert.equal(m.title, 'Citerne'); assert.deepEqual(m.assets, ['citerne.dxf']);
  const pages = articlesFromPdfText('Chapitre 1\n\nLe sol vivant est la base de toute culture durable et productive.\f\n\n\fChapitre 2\n\nLa rotation des familles évite la fatigue des sols et les maladies.', 'Manuel');
  assert.equal(pages.length, 2, 'la page vide est ignorée');
  assert.deepEqual(pages.map(p => p.path), ['p1', 'p3']);
  assert.equal(pages[1]!.title, 'Manuel — p. 3');
  assert.equal(sourceKind('/x/livre.epub'), 'epub'); assert.equal(sourceKind('/x/a.zim'), 'zim'); assert.equal(sourceKind('/x/a.exe'), null);
});

test('EPUB: the zip is read by hand and chapters follow the OPF spine', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-epub-'));
  const epub = path.join(dir, 'livre.epub');
  fs.writeFileSync(epub, makeZip({
    'mimetype': 'application/epub+zip',
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
    'OEBPS/content.opf': '<package><metadata><dc:title>Le potager sans réseau</dc:title></metadata><manifest><item id="c2" href="ch2.xhtml"/><item id="c1" href="ch1.xhtml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>',
    'OEBPS/ch2.xhtml': '<html><head><title>Rotation</title></head><body><p>Ne jamais remettre une Solanacée au même endroit deux ans de suite.</p></body></html>',
    'OEBPS/ch1.xhtml': '<html><head><title>Semis</title></head><body><p>Semer les tomates au chaud sept semaines avant la dernière gelée.</p></body></html>',
  }));
  const entries = listZip(fs.readFileSync(epub));
  assert.equal(entries.length, 5);
  assert.ok(readZipEntry(fs.readFileSync(epub), entries.find(e => e.name === 'mimetype')!).toString().startsWith('application/epub'));
  const arts = extractEpub(epub);
  assert.deepEqual(arts.map(a => a.title), ['Semis', 'Rotation'], 'ordre du spine, pas ordre alphabétique');
  assert.ok(arts[0]!.text.includes('sept semaines'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('index build writes one SQLite corpus per resource: 5 tables, text + FTS5 + int8 vectors, license inherited — readable without Arche', async () => {
  const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-idx-'));
  try {
    const docs = path.join(lib, 'docs'); writeFixtureDocs(docs);
    const emb = fakeEmbedder();
    const out = path.join(lib, 'index', 'user-docs.arche.sqlite');
    const seen: string[] = [];
    const res = await buildShard({ resourceId: 'user-docs', articles: extractDir(docs), embedder: emb, out, meta: META, onProgress: p => seen.push(p.phase) });
    assert.equal(res.file, out); assert.equal(res.model, 'fake-64'); assert.equal(res.dims, FAKE_DIMS);
    assert.equal(res.skipped, 1, 'le fichier trop court est ignoré'); assert.equal(res.articles, 3);
    assert.ok(res.chunks > 40, `${res.chunks} chunks`); assert.deepEqual(res.resumed, { articles: 0, chunks: 0 });
    assert.ok(seen.includes('extract') && seen.includes('embed') && seen.at(-1) === 'write');
    assert.equal(res.bytes, fs.statSync(out).size); assert.equal(res.sha256.length, 64);
    // Critère 1 : les cinq tables (+ la table du modèle), ouvrables par sqlite3.
    assert.deepEqual(tables(out), ['articles', 'chunks', 'chunks_fts', 'meta', 'vectors', vectorsTable('fake-64')]);
    const db = openCorpus(out, { readonly: true });
    const meta = readMeta(db);
    for (const k of ['format_version', 'resource_id', 'built_at', 'license_spdx', 'license_redistribution', 'languages']) assert.ok(meta[k], `meta.${k} obligatoire`);
    assert.equal(meta['license_spdx'], 'CC-BY-SA-4.0'); assert.equal(meta['license_redistribution'], 'attribution'); assert.equal(meta['languages'], 'fr');
    assert.equal(meta['chunker'], CHUNKER); assert.equal(meta['chunks'], String(res.chunks)); assert.equal(meta['articles'], '3'); assert.equal(meta['source_kind'], 'dir');
    assert.equal((db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode, 'delete', 'pas de -wal/-shm à côté avant publication');
    assert.equal((db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check, 'ok');
    // Le texte est dedans, avec son locator ; FTS5 le trouve sans accent ; les fichiers cités sont là.
    const hit = db.prepare("SELECT p.locator, p.title, p.text, p.assets FROM chunks_fts JOIN passages p ON p.chunk_id = chunks_fts.rowid WHERE chunks_fts MATCH 'volve' ORDER BY bm25(chunks_fts) LIMIT 1").get() as { locator: string; title: string; text: string; assets: string };
    assert.equal(hit.title, 'Amanite phalloïde'); assert.ok(hit.text.includes('volve')); assert.match(hit.locator, /^user-docs\/amanite\.html#\d+$/);
    assert.deepEqual(JSON.parse(hit.assets), ['amanite.jpg']);
    assert.equal((db.prepare("SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH 'poussiere'").get() as { n: number }).n, 1, 'remove_diacritics : « poussiere » trouve « poussière »');
    assert.equal((db.prepare('SELECT url FROM articles WHERE path = ?').get('citerne.md') as { url: string }).url, 'arche://article/user-docs/citerne.md');
    // Les vecteurs : un par chunk, dims octets, normalisés (le cosinus avec lui-même ≈ 1), registre à jour.
    const reg = db.prepare('SELECT model, "table", dims, dtype, count FROM vectors').all().map(r => ({ ...r }));
    assert.deepEqual(reg, [{ model: 'fake-64', table: 'vectors_fake_64', dims: FAKE_DIMS, dtype: 'int8', count: res.chunks }]);
    const vec = db.prepare('SELECT c.text, v.vec, v.norm FROM chunks c JOIN vectors_fake_64 v ON v.chunk_id = c.id LIMIT 1').get() as { text: string; vec: Uint8Array; norm: number };
    assert.equal(vec.vec.byteLength, FAKE_DIMS); assert.ok(Math.abs(vec.norm - 1) < 1e-5, 'le faux embedder rend des vecteurs unitaires');
    const q = Int8Array.from(await emb.embed([vec.text]).then(v => v[0]!), x => Math.round(x * 127));
    const v8 = new Int8Array(vec.vec.buffer, vec.vec.byteOffset, FAKE_DIMS);
    let dot = 0; for (let i = 0; i < FAKE_DIMS; i++) dot += v8[i]! * q[i]!;
    assert.ok(dot / (127 * 127) > 0.98, `cosinus avec lui-même ${dot / (127 * 127)}`);
    db.close();
    // Sans Arche : Python et sa bibliothèque standard lisent la même chose (sauté si python3 manque).
    const py = spawnSync('python3', ['-c', `import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); print(db.execute("SELECT count(*) FROM chunks").fetchone()[0], db.execute("PRAGMA user_version").fetchone()[0], db.execute("SELECT title FROM chunks_fts JOIN passages ON passages.chunk_id = chunks_fts.rowid WHERE chunks_fts MATCH 'flush' LIMIT 1").fetchone()[0])`, out], { encoding: 'utf8' });
    if (!py.error && py.status === 0) assert.equal(py.stdout.trim(), `${res.chunks} 1 Dimensionner une citerne`); else console.log('  (python3 absent : lecture sans Arche non vérifiée ici)');
    // Critère 4 (M1-2) : plus de .arche-idx, plus de index/text, plus de fichiers de point de contrôle — et depuis M1-3, plus de shard.ts du tout.
    assert.deepEqual(fs.readdirSync(path.join(lib, 'index')), ['user-docs.arche.sqlite']);
    assert.ok(!fs.existsSync(path.join(ROOT, 'src/core/rag/shard.ts')) && !fs.existsSync(path.join(ROOT, 'src/core/rag/bm25.ts')), 'les parseurs maison ont disparu');
    // Transport : le .zst se fait avec le binaire zstd s'il est là, et ne fait pas échouer sinon.
    const zst = compressZstd(out), hasZstd = !spawnSync('zstd', ['--version'], { encoding: 'utf8' }).error;
    if (hasZstd) { assert.ok(zst && zst.bytes < res.bytes && zst.file === `${out}.zst`, 'un .zst plus petit à côté'); fs.rmSync(zst!.file); }
    else { assert.equal(zst, null); console.log('  (zstd absent : la compression n’est vérifiée que par son absence)'); }
  } finally { fs.rmSync(lib, { recursive: true, force: true }); }
});

test('an interrupted build (embedder failure, then SIGTERM in a real process) resumes at the last committed batch without duplicates', async () => {
  const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-resume-'));
  try {
    const docs = path.join(lib, 'docs'); writeFixtureDocs(docs);
    // Référence : une construction d'une traite.
    const ref = await buildShard({ resourceId: 'user-docs', articles: extractDir(docs), embedder: fakeEmbedder(), out: path.join(lib, 'ref.arche.sqlite'), meta: META });
    const fingerprint = (file: string) => ({ articles: one(file, 'SELECT count(*) FROM articles'), paths: one(file, 'SELECT count(DISTINCT path) FROM articles'), chunks: one(file, 'SELECT count(*) FROM chunks'), pairs: one(file, 'SELECT count(*) FROM (SELECT DISTINCT article, ordinal FROM chunks)'), vectors: one(file, 'SELECT count(*) FROM vectors_fake_64'), texts: one(file, 'SELECT sum(length(text)) FROM chunks'), fts: one(file, "SELECT count(*) FROM chunks_fts WHERE chunks_fts MATCH 'compost'") });
    const expected = fingerprint(ref.file);
    assert.equal(expected.pairs, expected.chunks); assert.equal(expected.vectors, expected.chunks); assert.equal(expected.fts, 45);

    // a) Coupure simulée : l'embedder tombe après le premier lot ; le point de contrôle est la base.
    const out = path.join(lib, 'index', 'user-docs.arche.sqlite');
    await assert.rejects(() => buildShard({ resourceId: 'user-docs', articles: extractDir(docs), embedder: fakeEmbedder({ failAfter: 1 }), out, meta: META, checkpointEvery: 1 }), /coupure/);
    assert.ok(fs.existsSync(out), 'la base partielle reste');
    assert.equal(one(out, "SELECT count(*) FROM meta WHERE key = 'built_at'"), 0, 'une base sans built_at est incomplète');
    assert.equal(one(out, 'SELECT count(*) FROM vectors_fake_64'), 32, 'le premier lot est commis (checkpointEvery = 1)');
    const emb = fakeEmbedder();
    const res = await buildShard({ resourceId: 'user-docs', articles: extractDir(docs), embedder: emb, out, meta: META, checkpointEvery: 1 });
    assert.deepEqual(res.resumed, { articles: 3, chunks: expected.chunks }, 'les articles déjà commis sont sautés');
    assert.equal(emb.calls, Math.ceil((expected.chunks - 32) / 32), 'seuls les chunks sans vecteur repassent par l’embedder');
    assert.deepEqual(fingerprint(out), expected, 'même contenu qu’une construction d’une traite, sans doublon');
    assert.ok(readMeta(openCorpus(out, { readonly: true }))['built_at']);

    // b) SIGTERM au milieu, dans un vrai processus (un commit tous les deux lots de 32) : le journal SQLite
    //    (TRUNCATE, remis à l'OS) garde ce qui est commis et annule le lot ouvert ; la relance reprend là.
    const docs2 = path.join(lib, 'docs2'); writeFixtureDocs(docs2);
    for (let m = 0; m < 8; m++) fs.writeFileSync(path.join(docs2, `manuel-${m}.md`), `# Manuel ${m}\n\n` + Array.from({ length: 40 }, (_, i) => `## Chapitre ${i + 1}\n\n` + `Le chapitre ${i + 1} du manuel ${m} traite du compost, du paillage et de la rotation des familles. `.repeat(14)).join('\n\n'));
    const ref2 = await buildShard({ resourceId: 'sigterm', articles: extractDir(docs2), embedder: fakeEmbedder(), out: path.join(lib, 'ref2.arche.sqlite'), meta: META });
    const expected2 = fingerprint(ref2.file);
    assert.ok(expected2.chunks as number > 300, `${expected2.chunks} chunks : assez de lots pour tuer au milieu`);
    const out2 = path.join(lib, 'index', 'sigterm.arche.sqlite');
    const child = spawn(process.execPath, ['--import', 'tsx', path.join(ROOT, 'tests/helpers/build-child.ts'), docs2, out2], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '', err = '';
    child.stderr.on('data', d => { err += d; });
    const exit = new Promise<{ code: number | null; signal: string | null }>(r => child.on('exit', (code, signal) => r({ code, signal })));
    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', d => { log += d; if (/^embed 160$/m.test(log)) { child.kill('SIGTERM'); resolve(); } });
      exit.then(() => reject(new Error(`l’enfant a fini avant d’être tué :\n${log}\n${err}`)));
    });
    const { signal } = await exit;
    assert.equal(signal, 'SIGTERM', err);
    assert.ok(!log.includes('done'));
    // 5 lots embarqués, commits après les lots 2 et 4 : 128 vecteurs commis, le 5e lot annulé par le journal
    // (192 si l'ordonnanceur a laissé passer un commit de plus avant le signal — jamais un lot partiel).
    const partial = one(out2, 'SELECT count(*) FROM vectors_fake_64') as number;
    assert.ok(partial >= 128 && partial < (expected2.chunks as number) && partial % 64 === 0, `${partial} vecteurs commis avant le SIGTERM`);
    assert.equal(one(out2, "SELECT count(*) FROM meta WHERE key = 'built_at'"), 0);
    const emb2 = fakeEmbedder();
    const res2 = await buildShard({ resourceId: 'sigterm', articles: extractDir(docs2), embedder: emb2, out: out2, meta: META, checkpointEvery: 2 });
    assert.equal(res2.resumed.chunks, expected2.chunks, 'tous les chunks étaient déjà extraits');
    assert.equal(emb2.calls, Math.ceil(((expected2.chunks as number) - partial) / 32), 'reprise au dernier lot commis, ni avant ni après');
    assert.deepEqual(fingerprint(out2), expected2, 'même contenu qu’une construction d’une traite, sans doublon');
    assert.equal(one(out2, "SELECT value FROM meta WHERE key = 'resource_id'"), 'sigterm');

    // c) Une base finie du même corpus est reconstruite de zéro (pas « reprise ») ; une base d'un autre corpus aussi.
    const again = await buildShard({ resourceId: 'sigterm', articles: extractDir(docs), embedder: fakeEmbedder(), out: out2, meta: META });
    assert.deepEqual(again.resumed, { articles: 0, chunks: 0 });
    const other = await buildShard({ resourceId: 'autre', articles: extractDir(docs), embedder: fakeEmbedder(), out: out2, meta: META });
    assert.equal(one(out2, "SELECT value FROM meta WHERE key = 'resource_id'"), 'autre'); assert.deepEqual(other.resumed, { articles: 0, chunks: 0 });
  } finally { fs.rmSync(lib, { recursive: true, force: true }); }
});

test('index estimate predicts the SQLite size (text + FTS5 + int8 vectors) within ±30 %, exact or sampled', async () => {
  const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-est-'));
  try {
    const docs = path.join(lib, 'docs'); writeFixtureDocs(docs);
    const res = await buildShard({ resourceId: 'user-docs', articles: extractDir(docs), embedder: fakeEmbedder(), out: path.join(lib, 'x.arche.sqlite'), meta: META });
    const est = await estimateCorpus(extractDir(docs), { resourceId: 'user-docs', dims: FAKE_DIMS });
    assert.equal(est.articles, 3); assert.equal(est.chunks, res.chunks); assert.equal(est.sampled, false);
    assert.equal(est.vectors_bytes, res.chunks * (FAKE_DIMS + 12)); assert.equal(est.sqlite_bytes, est.sqlite_text_bytes + est.vectors_bytes);
    assert.ok(Math.abs(est.sqlite_bytes / res.bytes - 1) < 0.3, `estimé ${est.sqlite_bytes}, réel ${res.bytes}`);
    assert.ok(est.zst_bytes < est.sqlite_bytes);
    // Échantillonné : 120 articles de prose pseudo-naturelle (vocabulaire zipfien, déterministe), 20 mesurés, le reste extrapolé — à ±30 % aussi.
    const big = path.join(lib, 'big'); fs.mkdirSync(big);
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const syll = ['ba', 'ri', 'to', 'mé', 'lu', 'sa', 'vé', 'no', 'cha', 'pi', 'dor', 'fen', 'gu', 'tra', 'ou', 'ké', 'zi', 'plan', 'tor', 'mi'];
    const vocab = Array.from({ length: 4000 }, () => Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => syll[Math.floor(rnd() * syll.length)]).join(''));
    const word = () => vocab[Math.floor(rnd() ** 2 * vocab.length)]!, sentence = () => Array.from({ length: 6 + Math.floor(rnd() * 12) }, word).join(' ') + '.';
    const para = () => Array.from({ length: 3 + Math.floor(rnd() * 5) }, sentence).join(' ');
    for (let i = 0; i < 120; i++) fs.writeFileSync(path.join(big, `a${String(i).padStart(3, '0')}.md`), `# Article ${i}\n\n` + Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, k) => `## Section ${k}\n\n` + Array.from({ length: 1 + Math.floor(rnd() * 4) }, para).join('\n\n')).join('\n\n'));
    const real = await buildShard({ resourceId: 'big', articles: extractDir(big), embedder: fakeEmbedder(), out: path.join(lib, 'big.arche.sqlite'), meta: META });
    const sampled = await estimateCorpus(extractDir(big), { resourceId: 'big', dims: FAKE_DIMS, sample: 20 });
    assert.equal(sampled.sampled, true); assert.equal(sampled.articles, 120); assert.equal(sampled.chunks, real.chunks);
    assert.ok(Math.abs(sampled.sqlite_bytes / real.bytes - 1) < 0.3, `échantillonné ${sampled.sqlite_bytes}, réel ${real.bytes}`);
    const exact = await estimateCorpus(extractDir(big), { resourceId: 'big', dims: FAKE_DIMS });
    assert.ok(Math.abs(exact.sqlite_bytes / real.bytes - 1) < 0.3, `exact ${exact.sqlite_bytes}, réel ${real.bytes}`);
  } finally { fs.rmSync(lib, { recursive: true, force: true }); }
});

test('extractSource dispatches by kind and refuses unknown files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-src-'));
  fs.writeFileSync(path.join(dir, 'a.md'), '# Titre\n\ncorps');
  const arts = []; for await (const a of extractSource(path.join(dir, 'a.md'))) arts.push(a);
  assert.equal(arts[0]!.title, 'Titre');
  await assert.rejects(async () => { for await (const _ of extractSource(path.join(dir, 'x.exe'))) void _; }, /non reconnue/);
  fs.rmSync(dir, { recursive: true, force: true });
});
