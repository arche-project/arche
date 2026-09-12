// M1-7 — `arche eval` : le jeu knowledge/eval.yaml joué contre des corpus installés. Le corpus fixture
// est notre propre documentation (docs/ → `arche-docs`, le ZIM du catalogue), construite dans un dossier
// temporaire : avec le faux embedder (FTS5 + vecteurs), et en FTS5 seul par la CLI comme la CI le fait.
// On vérifie les colonnes par canal (xapian / sqlite / fusion / rerank), les garde-fous, les négatives,
// les sorties JSON et Markdown, le bloc réécrit dans EVAL.md, et le seuil qui fait échouer la commande.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildShard } from '../src/core/rag/build.js';
import { extractDir } from '../src/core/rag/extract.js';
import { openCorpus, vectorTables } from '../src/core/rag/sqlite.js';
import { runEval, renderMarkdown, writeEvalDoc, passes, CHANNELS, installedCorpora, type EvalReport } from '../src/core/rag/eval.js';
import { fakeEmbedder } from './helpers/fake-embedder.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const META = { license_spdx: 'CC-BY-SA-4.0', license_redistribution: 'attribution', languages: ['fr', 'en'], title: 'Arche — docs', source_kind: 'dir' };
const down = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-eval-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Le corpus fixture : docs/ (les fichiers Markdown, ce que le ZIM arche-docs contient — 94 au 12 septembre 2026), FTS5 + vecteurs fake-64.
const lib = path.join(tmp, 'lib');
await buildShard({ resourceId: 'arche-docs', articles: extractDir(path.join(ROOT, 'docs')), embedder: fakeEmbedder(), out: path.join(lib, 'index', 'arche-docs.arche.sqlite'), meta: META });
const cli = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'src/cli.ts'), ...args], { cwd: ROOT, encoding: 'utf8' });

test('critère 3 — le tableau distingue xapian / sqlite / fusion / rerank ; mesurable = un corpus attendu installé', async () => {
  const r = await runEval({ lib, fetchImpl: down, embedder: fakeEmbedder() });
  assert.deepEqual(r.corpora, ['arche-docs']);
  assert.deepEqual(r.questions, { total: 60, positives: 45, measurable: 13, negatives: 15, flagged: 12 }, '13 positives attendent arche-docs');
  assert.deepEqual(Object.keys(r.channels), CHANNELS);
  assert.equal(r.channels.xapian, null, 'kiwix-serve absent : canal muet, ni pour ni contre');
  assert.equal(r.channels.rerank, null, 'pas de reclasseur demandé');
  assert.deepEqual(r.channels.sqlite, { n: 13, recall_at_5: 1, mrr: 1 }, 'un seul corpus installé : tout extrait est du corpus attendu — c’est mots@5 qui discrimine');
  assert.deepEqual(r.channels.fusion, { n: 13, recall_at_5: 1, mrr: 1 });
  assert.ok(r.must_at_5.n === 13 && r.must_at_5.ok >= 8 && r.must_at_5.ok <= 13, `mots obligatoires dans les 5 premiers : ${r.must_at_5.ok}/13 (les faux vecteurs — un sac de mots haché — ajoutent du bruit ; la fixture de la CI est en FTS5 seul, test 3)`);
  assert.deepEqual(r.guardrails, { total: 60, correct: 60, missed: 0, false_positives: 0 }, 'les 12 garde-fous rendus, et rien sur les 48 autres');
  assert.deepEqual(r.negatives, { total: 15, not_found: 0, rate: 0 }, 'la recherche rend toujours des extraits : « je ne trouve pas » n’existe pas encore (mesuré, pas caché)');
  assert.equal(r.pass, passes(r), 'pass = le seuil du jeu, appliqué au rapport');
  for (const row of r.rows) {
    assert.deepEqual(Object.keys(row.rank), CHANNELS);
    assert.equal(row.rank.xapian, null); assert.equal(row.rank.rerank, null);
    if (row.negative) { assert.equal(row.measurable, false); assert.equal(row.not_found, false); assert.equal(row.rank.fusion, 0, 'aucune ressource attendue : rang 0'); }
    else assert.equal(row.not_found, null);
    if (row.measurable) assert.ok(row.rank.fusion! >= 1 && row.rank.sqlite! >= 1);
  }
  const citerne = r.rows.find(x => x.id === 'eau-03')!;
  assert.equal(citerne.resource, 'arche-docs'); assert.ok(citerne.must_at_5);
  assert.match(citerne.proposed_chunk!, /^arche-docs\/printables\/fr\/08-chiffres\.md#\d+$/, 'un locator pending reçoit le chunk proposé (l’article que le jeu annonce)');
  assert.equal(r.rows.find(x => x.id === 'eau-04')!.proposed_chunk, undefined, 'locator vers un corpus non installé : rien à proposer');
  assert.deepEqual(Object.keys(r.by_corpus).sort(), ['arche-docs', 'fao-poultry-manual', 'pdf-ou-il-ny-a-pas-de-docteur', 'pdf-sanitation-sphere-handbook', 'stackexchange-ham']);
  assert.equal(r.by_corpus['arche-docs']!.n, 9); assert.ok(Object.keys(r.by_topic).includes('entrainement'));
  assert.match(r.detail!, /xapian : ECONNREFUSED/);
  const md = renderMarkdown(r);
  for (const c of CHANNELS) assert.ok(md.includes(`\n| ${c} |`), `ligne ${c} du tableau`);
  assert.ok(md.includes('| xapian | — | — | 0 (canal muet) |') && md.includes('| sqlite | 100 % | 1.00 | 13 |') && md.includes(r.pass ? '**tenu**' : '**non tenu**') && md.includes('| arche-docs | 9 |'));
});

test('xapian (kiwix-serve simulé) et rerank (reclasseur injecté) remplissent leurs colonnes ; un reclasseur muet ne compte pas', async () => {
  // kiwix-serve répond la même chose à toute question : un article de zimgit-water. Il est « installé » (état de la bibliothèque).
  const rss = '<rss><channel><item><title>Water purification</title><link>/content/zimgit-water/A/Water_purification</link><description>Boiling water kills most pathogens.</description><book>zimgit-water</book></item></channel></rss>';
  const kiwix = (async (url: string) => new Response(String(url).includes('/search?') ? rss : '<html><title>Water purification</title><body><p>Bring the water to a rolling boil for one minute. Boiling kills pathogens.</p></body></html>', { status: 200 })) as unknown as typeof fetch;
  const reversed = { lastBackend: 'llama-server' as const, rerank: async <T extends { id: string; text: string }>(_q: string, items: readonly T[]) => [...items].reverse().map(item => ({ item, score: 0 })) };
  // Sans embedder : FTS5 seul côté sqlite, donc deux listes (xapian, fts) à un rang chacune — l'extrait Xapian, inséré le premier, gagne l'égalité RRF.
  const r = await runEval({ lib, fetchImpl: kiwix, installed: ['zimgit-water'], reranker: reversed });
  assert.deepEqual(r.corpora, ['arche-docs', 'zimgit-water']);
  assert.equal(r.questions.measurable, 16, '13 + les 3 questions qui attendent zimgit-water');
  assert.equal(r.channels.xapian!.n, 16); assert.equal(r.channels.rerank!.n, 16);
  const eau = r.rows.find(x => x.id === 'eau-01')!;
  assert.equal(eau.rank.xapian, 1, 'le seul résultat Xapian est du corpus attendu');
  assert.equal(eau.rank.sqlite, 0, 'arche-docs n’est pas attendu pour eau-01 : le canal sqlite ne le trouve pas');
  assert.ok(eau.rank.fusion === 1 && eau.must_at_5, `fusion : ${eau.rank.fusion} — l’extrait (« boil ») vient du ZIM via /raw et porte le mot obligatoire`);
  assert.ok(eau.rank.rerank! > 5, `ordre inversé par le reclasseur : le bon extrait recule au rang ${eau.rank.rerank}`);
  assert.equal(r.rows.find(x => x.id === 'eau-03')!.rank.xapian, 0, 'Xapian a répondu, mais pas la ressource attendue : 0, pas null');
  assert.ok(r.channels.rerank!.recall_at_5 < r.channels.fusion!.recall_at_5, 'le tableau montre quand le reclasseur nuit');
  const mute = await runEval({ lib, fetchImpl: down, embedder: fakeEmbedder(), reranker: { lastBackend: 'none', rerank: async <T,>(_q: string, items: readonly T[]) => items.map(item => ({ item, score: 0 })) } });
  assert.equal(mute.channels.rerank, null, 'aucun serveur de reclassement : colonne muette');
});

test('critères 1 et 2 — la CLI : corpus FTS5 seul construit sans Ollama (--no-vectors), eval --json / --markdown, --write, code 1 sous le seuil', async () => {
  const lib2 = path.join(tmp, 'lib-ci');
  const b = cli('index', 'build', 'arche-docs', '--source', 'docs', '--no-vectors', '--no-compress', '--library', lib2);
  assert.equal(b.status, 0, b.stderr); assert.match(b.stdout, /\d+ articles · \d+ chunks · .* · FTS5 · sha256/); assert.ok(Number(b.stdout.match(/(\d+) articles/)![1]) >= 92, 'toute la doc est indexée');
  const db = openCorpus(path.join(lib2, 'index', 'arche-docs.arche.sqlite'), { readonly: true });
  try { assert.deepEqual(vectorTables(db), [], 'aucune table de vecteurs : cherchable en FTS5, vecteurs ajoutables plus tard'); } finally { db.close(); }
  assert.deepEqual(installedCorpora(lib2), ['arche-docs']);
  const j = cli('eval', '--library', lib2, '--kiwix-host', 'http://127.0.0.1:1', '--json');
  assert.equal(j.status, 0, j.stderr);
  const r = JSON.parse(j.stdout) as EvalReport;
  assert.ok(r.pass && passes(r)); assert.equal(r.channels.sqlite!.n, 13); assert.equal(r.channels.xapian, null);
  assert.match(r.detail!, /sans vecteurs d’un modèle connu \(FTS5 seul\) : arche-docs/);
  assert.ok(r.must_at_5.rate >= r.threshold.must_at_5! && r.channels.fusion!.recall_at_5 >= r.threshold.recall_at_5, 'le seuil de knowledge/eval.yaml est tenu sur la fixture CI');
  const m = cli('eval', '--library', lib2, '--kiwix-host', 'http://127.0.0.1:1', '--markdown');
  assert.equal(m.status, 0); assert.ok(m.stdout.includes('| Canal | rappel@5 | MRR | n |') && m.stdout.includes('| rerank | — | — | 0 (canal muet) |'));
  // --write : seul le bloc <!-- eval --> … <!-- /eval --> de EVAL.md change.
  const doc = path.join(tmp, 'EVAL.md');
  fs.writeFileSync(doc, '# Titre\n\nAvant.\n\n<!-- eval -->\nvieux tableau\n<!-- /eval -->\n\nAprès.\n');
  const w = cli('eval', '--library', lib2, '--kiwix-host', 'http://127.0.0.1:1', '--write', doc);
  assert.equal(w.status, 0, w.stderr);
  const out = fs.readFileSync(doc, 'utf8');
  assert.ok(out.startsWith('# Titre\n\nAvant.\n\n<!-- eval -->\nMesure du ') && out.endsWith('**tenu**.\n<!-- /eval -->\n\nAprès.\n') && !out.includes('vieux tableau'));
  assert.throws(() => writeEvalDoc(path.join(ROOT, 'README.md'), 'x'), /pas de bloc/);
  assert.ok(fs.readFileSync(path.join(ROOT, 'docs/fr/EVAL.md'), 'utf8').includes('<!-- eval -->'), 'docs/fr/EVAL.md porte le bloc que --write réécrit');
  // Sous le seuil : code 1 et la raison sur stderr. Bibliothèque vide : rien de mesurable → code 1 aussi.
  const low = cli('eval', '--library', lib2, '--kiwix-host', 'http://127.0.0.1:1', '--json', '--min', '101');
  assert.equal(low.status, 1); assert.match(low.stderr, /sous le seuil \(rappel@5 100 % < 101 %\)/); assert.equal((JSON.parse(low.stdout) as EvalReport).pass, false);
  const empty = cli('eval', '--library', path.join(tmp, 'nothing'), '--kiwix-host', 'http://127.0.0.1:1');
  assert.equal(empty.status, 1); assert.match(empty.stderr, /aucune question mesurable/); assert.ok(empty.stdout.includes('corpus installés : aucun'));
});

test('ci.yml construit la fixture et lance eval', () => {
  const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  assert.ok(ci.includes('index build arche-docs --source docs --no-vectors') && /node dist\/cli\.js eval /.test(ci));
});
