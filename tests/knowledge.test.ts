// M4-1 — Provenance ou rien (audit, décision 2). Chaque valeur numérique de knowledge/*.yaml porte
// `source: {resource, path, quote}` ou, en période de grâce, `unsourced: true` — explicite, compté,
// publié dans le README. `verified` n'est jamais écrit : `arche knowledge verify` le calcule en ouvrant
// les shards installés. Ici : la règle sur le dépôt réel (critère 1), la règle sur des fixtures
// minuscules (chaque refus), le calcul de `verified` contre un shard construit à la volée (critère 2),
// la commande et son code de sortie, et le bloc du README (critère 3).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { scanKnowledge, verifyKnowledge, knowledgeSummary, renderKnowledge, knowledgeFiles } from '../src/core/knowledge.js';
import { buildShard } from '../src/core/rag/build.js';
import { loadCatalog } from '../src/core/catalog.js';
import { computeFigures } from '../src/core/compute.js';
import { figures, runCalculator } from '../src/core/rag/figures.js';
import { cropsFile } from '../src/core/project/garden.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-knowledge-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const catalogIds = new Set(loadCatalog({ strict: true }).byId.keys());
const cli = (env: Record<string, string>, ...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'src/cli.ts'), ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ARCHE_LANG: 'fr', ...env } });

/** Un dossier knowledge/ minuscule avec un seul fichier. */
function fixture(name: string, yaml: string): string {
  const dir = path.join(tmp, name); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'facts.yaml'), yaml);
  return dir;
}

// ─────────────────── Critère 1 : le dépôt réel ───────────────────

test('critère 1 — chaque valeur de knowledge/*.yaml a une source ou une grâce explicite ; sinon la CI échoue ici', () => {
  const r = scanKnowledge({ catalogIds });
  assert.deepEqual(r.issues, [], r.issues.map(i => `${i.file}:${i.path} — ${i.message}`).join('\n'));
  assert.ok(r.values >= 400, `${r.values} valeurs (figures, cultures, calcul)`);
  assert.equal(r.sourced + r.unsourced, r.values);
  assert.deepEqual(Object.keys(r.files), ['compute.yaml', 'crops.yaml', 'figures.yaml', 'views.yaml'], 'tous les fichiers de tête sauf eval.yaml (son propre schéma, M1-6)');
  assert.equal(r.files['views.yaml']!.values, 0, 'la taxonomie des vues ne porte aucun nombre');
  for (const f of knowledgeFiles()) assert.ok(!/^\s*verified:/m.test(fs.readFileSync(f, 'utf8')), `${path.basename(f)} : \`verified\` n'est jamais écrit à la main`);
  // La grâce est explicite : chaque valeur non sourcée est couverte par un `unsourced: true` visible, et compté.
  const grace = knowledgeFiles().reduce((n, f) => n + (fs.readFileSync(f, 'utf8').match(/unsourced: true/g) ?? []).length, 0);
  assert.ok(grace >= 100 && r.unsourced >= grace, `${grace} marqueurs couvrent ${r.unsourced} valeurs`);
});

test('les lecteurs (calculateurs, planificateur, estimateur) lisent les fichiers marqués sans être gênés par les marqueurs', () => {
  const stock = runCalculator('stock_un_an', { people: 2 });
  assert.ok(stock.value > 400 && Number.isFinite(stock.value), `stock_un_an ignore le marqueur du bloc : ${stock.value}`);
  assert.ok(stock.steps.every(s => !s.includes('unsourced')));
  assert.equal(runCalculator('citerne', { people: 4, dry_days: 60 }).value > 0, true);
  assert.equal(typeof computeFigures().system_reserve_gb.value, 'number');
  assert.equal(figures().water.litres_per_person_day.sphere_minimum.unsourced, true, 'la valeur Sphère attend son locator (M4-2)');
  for (const [k, c] of Object.entries(cropsFile().crops)) assert.ok(c.unsourced === true || c.source, `${k} : grâce explicite ou source`);
});

// ─────────────────── La règle, refus par refus ───────────────────

test('une valeur sans provenance est refusée ; un bloc couvre ses valeurs ; une valeur peut porter la sienne', () => {
  const dir = fixture('rule', [
    'version: 1', 'updated: 2026-09-12', 'defaults: { people: 2 }',
    'eau:', '  unsourced: true', '  survie: { value: 3 }', '  frugal: { lo: 30, hi: 50, source: { resource: zimgit-water, path: "A/Water", quote: "30 to 50 litres per person per day" } }',
    'nu: 42',
    'liste:', '  - { tok_s: { lo: 1, hi: 2 }, unsourced: true }', '  - { tok_s: { lo: 1, hi: 2 } }',
  ].join('\n'));
  const r = scanKnowledge({ dir, catalogIds });
  assert.deepEqual(r.issues.map(i => i.path), ['nu', 'liste[1].tok_s.lo', 'liste[1].tok_s.hi']);
  assert.match(r.issues[0]!.message, /sans provenance/);
  assert.deepEqual({ values: r.values, sourced: r.sourced, unsourced: r.unsourced }, { values: 8, sourced: 2, unsourced: 3 }, 'defaults est une métadonnée ; les 3 valeurs sans provenance ne sont ni sourcées ni en grâce');
  assert.deepEqual(r.sources.map(s => [s.at, s.values, s.state]), [['eau.frugal', 2, 'unchecked']]);
});

test('verified écrit à la main, source en texte libre, citation trop courte, unsourced: false, ressource inconnue, provenance à la racine : refusés', () => {
  const check = (yaml: string, re: RegExp) => {
    const r = scanKnowledge({ dir: fixture(`refus-${Math.random().toString(36).slice(2)}`, yaml), catalogIds });
    assert.ok(r.issues.some(i => re.test(i.message)), `attendu ${re} dans :\n${r.issues.map(i => i.message).join('\n') || '(aucun problème)'}`);
  };
  check('x: { value: 1, unsourced: true, verified: true }', /`verified` est calculé/);
  check('x: { value: 1, source: "Sphere Handbook 2018" }', /`source` = \{ resource/);
  check('x: { value: 1, source: { resource: zimgit-water, path: A/W, quote: "15 L" } }', /≥ 12 caractères/);
  check('x: { value: 1, unsourced: false }', /`unsourced` vaut `true`/);
  check('x: { value: 1, source: { resource: pas-dans-le-catalogue, path: A/W, quote: "quinze litres par jour" } }', /n’est pas dans le catalogue/);
  check('unsourced: true\nx: { value: 1 }', /pas à la racine/);
  check('x: { value: 1, unsourced: true, source: { resource: zimgit-water, path: A/W, quote: "quinze litres par jour" } }', /s’excluent/);
});

// ─────────────────── Critère 2 : verified, calculé contre les shards ───────────────────

const lib = path.join(tmp, 'lib');
await buildShard({
  resourceId: 'zimgit-water', out: path.join(lib, 'index', 'zimgit-water.arche.sqlite'), meta: { license_spdx: 'CC-BY-SA-4.0', license_redistribution: 'attribution', languages: ['en'] },
  articles: [{ path: 'A/Water_supply', title: 'Water supply', text: '# Water supply\n\nThe Sphere minimum is 15 litres per person per day for drinking, cooking and hygiene.\n\n## Storage\n\nHousehold storage should cover the longest dry spell. '.repeat(3) }],
});

test('critère 2 — `verified` : article et citation trouvés dans le shard installé ; citation absente = échec ; article absent = échec ; shard absent = non résolu', () => {
  const dir = fixture('verify', [
    'eau:',
    '  ok: { value: 15, source: { resource: zimgit-water, path: A/Water_supply, quote: "15 litres per person per day" } }',
    '  casse: { value: 15, source: { resource: zimgit-water, path: A/Water_supply, quote: "  Sphere MINIMUM is 15 litres " } }',
    '  faux: { value: 20, source: { resource: zimgit-water, path: A/Water_supply, quote: "20 litres per person per day" } }',
    '  article: { value: 15, source: { resource: zimgit-water, path: A/Nowhere, quote: "15 litres per person per day" } }',
    '  shard: { value: 15, source: { resource: pdf-sanitation-sphere-handbook, path: p12, quote: "15 litres per person per day" } }',
  ].join('\n'));
  const r = verifyKnowledge(lib, scanKnowledge({ dir, catalogIds }));
  assert.deepEqual(Object.fromEntries(r.sources.map(s => [s.at, s.state])), { 'eau.ok': 'verified', 'eau.casse': 'verified', 'eau.faux': 'mismatch', 'eau.article': 'no-article', 'eau.shard': 'no-shard' });
  assert.deepEqual({ verified: r.verified, failed: r.failed, unresolved: r.unresolved, sourced: r.sourced, unsourced: r.unsourced }, { verified: 2, failed: 2, unresolved: 1, sourced: 5, unsourced: 0 });
  const text = renderKnowledge(r);
  assert.ok(text.includes('5 déclarées · 2 vérifiées · 2 fausses · 1 sans shard installé') && text.includes('✗ facts.yaml:eau.faux → zimgit-water/A/Water_supply (mismatch)') && text.includes('∅ facts.yaml:eau.shard'));
  assert.ok(!text.includes('eau.ok'), 'une source vérifiée ne fait pas de bruit');
});

test('`arche knowledge verify` : code 1 sur une citation fausse, 0 quand tout résout ou qu’aucun shard n’est installé ; --json', () => {
  const good = fixture('cli-good', 'eau:\n  ok: { value: 15, source: { resource: zimgit-water, path: A/Water_supply, quote: "15 litres per person per day" } }\n  grace: { value: 3, unsourced: true }\n');
  const g = cli({ ARCHE_KNOWLEDGE_DIR: good }, 'knowledge', 'verify', '--library', lib);
  assert.equal(g.status, 0, g.stderr);
  assert.ok(g.stdout.includes('1 valeurs sourcées / 2') && g.stdout.includes('1 vérifiées · 0 fausses'), g.stdout);
  const j = JSON.parse(cli({ ARCHE_KNOWLEDGE_DIR: good }, 'knowledge', 'verify', '--library', lib, '--json').stdout);
  assert.equal(j.sources[0].state, 'verified'); assert.equal(j.files['facts.yaml'].unsourced, 1);
  const none = cli({ ARCHE_KNOWLEDGE_DIR: good }, 'knowledge', 'verify', '--library', path.join(tmp, 'vide'));
  assert.equal(none.status, 0, 'shard absent : compté, pas un échec'); assert.ok(none.stdout.includes('1 sans shard installé'));
  const bad = fixture('cli-bad', 'eau:\n  faux: { value: 20, source: { resource: zimgit-water, path: A/Water_supply, quote: "20 litres per person per day" } }\n');
  assert.equal(cli({ ARCHE_KNOWLEDGE_DIR: bad }, 'knowledge', 'verify', '--library', lib).status, 1, 'citation absente du shard : code 1');
  const nu = fixture('cli-nu', 'eau:\n  nu: 3\n');
  const n = cli({ ARCHE_KNOWLEDGE_DIR: nu }, 'knowledge', 'verify', '--library', lib);
  assert.equal(n.status, 1); assert.ok(n.stdout.includes('sans provenance'));
});

test('`arche catalog validate` inclut knowledge/ : une valeur sans provenance rend le catalogue invalide', () => {
  const nu = fixture('cat-nu', 'eau:\n  nu: 3\n');
  const r = cli({ ARCHE_KNOWLEDGE_DIR: nu }, 'catalog', 'validate');
  assert.equal(r.status, 1); assert.ok(r.stderr.includes('knowledge/facts.yaml: eau.nu: valeur sans provenance'), r.stderr);
  const ok = cli({}, 'catalog', 'validate');
  assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /Catalogue valide : \d+ ressources, \d+ paquets\. `knowledge\/` : \d+ valeurs sourcées \/ \d+/);
});

// ─────────────────── Critère 3 : le README ───────────────────

test('critère 3 — le README publie N valeurs sourcées / total, à jour ; --write réécrit le bloc et rien d’autre', () => {
  const r = scanKnowledge({ catalogIds });
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const m = readme.match(/<!-- knowledge -->\n?(.*?)\n?<!-- \/knowledge -->/s);
  assert.ok(m, 'README.md porte le bloc <!-- knowledge --> … <!-- /knowledge -->');
  assert.equal(m![1]!.trim(), knowledgeSummary(r), 'le README est en retard : `npx tsx src/cli.ts knowledge verify --write README.md`');
  const copy = path.join(tmp, 'README.md');
  fs.writeFileSync(copy, '# X\n\navant\n<!-- knowledge -->\nvieux\n<!-- /knowledge -->\naprès\n');
  const w = cli({}, 'knowledge', 'verify', '--library', path.join(tmp, 'vide'), '--write', copy);
  assert.equal(w.status, 0, w.stderr);
  assert.equal(fs.readFileSync(copy, 'utf8'), `# X\n\navant\n<!-- knowledge -->\n${knowledgeSummary(r)}\n<!-- /knowledge -->\naprès\n`);
});

test('le format est documenté : docs/fr/PROVENANCE.md décrit source, unsourced, verified et la commande', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'PROVENANCE.md'), 'utf8');
  for (const s of ['source:', 'unsourced: true', 'verified', 'arche knowledge verify', 'quote']) assert.ok(doc.includes(s), s);
  const y = parse(fs.readFileSync(path.join(ROOT, 'knowledge', 'figures.yaml'), 'utf8')) as { water: { litres_per_person_day: { frugal: { unsourced?: boolean } } } };
  assert.equal(y.water.litres_per_person_day.frugal.unsourced, true);
});
