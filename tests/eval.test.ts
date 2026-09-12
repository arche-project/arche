// M1-6 — knowledge/eval.yaml : le jeu d'évaluation, vérifié avant d'être mesuré (audit, décision 3).
// Le schéma (knowledge/eval.schema.json) dit la forme ; ce fichier dit le fond : 60 questions, ids
// uniques, ressources réelles du catalogue et du plan d'indexation, locators pending ou résolus
// dans un shard publié, garde-fous qui se déclenchent vraiment (et seulement là où on les attend),
// 12 garde-fous, 15 négatives, et — pour notre propre corpus, arche-docs — l'article cité existe
// et contient les mots obligatoires.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { validate } from '../src/core/schema.js';
import { loadCatalog } from '../src/core/catalog.js';
import { detectRedFlags } from '../src/core/rag/prompt.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

interface Locator { resource: string; where: string; status: 'pending' | 'resolved'; article?: string; chunk?: string }
interface Question {
  id: string; q: string; lang: 'fr' | 'en'; topic: string; expect: string[]; locator?: Locator;
  must: string[]; flag?: string; negative?: boolean; calculator?: string; why: string;
}
interface Eval { version: number; updated: string; questions: Question[] }

const evalSet = parse(read('knowledge/eval.yaml')) as Eval;
const schema = JSON.parse(read('knowledge/eval.schema.json'));
const plan = parse(read('catalog/index-plan.yaml')) as { build: Array<{ id: string; wave?: number; ci?: boolean }> };
const catalog = loadCatalog({ strict: true });
const byId = new Map(catalog.resources.map(r => [r.id, r]));
const planned = new Set(plan.build.map(b => b.id));
const wave1 = new Set(plan.build.filter(b => b.wave === 1).map(b => b.id));

/** Comparaison insensible à la casse et aux accents, comme `arche eval` l'appliquera aux réponses. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
const hasMust = (text: string, must: string) => must.split('|').some(alt => fold(text).includes(fold(alt)));

const Q = evalSet.questions;
const positives = Q.filter(q => !q.negative);
const negatives = Q.filter(q => q.negative);
const flagged = Q.filter(q => q.flag);

test('critère 1 — 60 entrées, validées par knowledge/eval.schema.json, ids uniques', () => {
  const errors = validate(schema, evalSet);
  assert.deepEqual(errors, [], errors.map(e => `${e.path}: ${e.message}`).join('\n'));
  assert.equal(Q.length, 60);
  assert.equal(new Set(Q.map(q => q.id)).size, 60, 'ids uniques');
  assert.equal(new Set(Q.map(q => fold(q.q))).size, 60, 'questions uniques');
  for (const q of Q) assert.ok(q.id.startsWith(q.topic + '-'), `${q.id} : l'id commence par le sujet`);
});

test('les sept sujets du ticket sont couverts, en français et en anglais', () => {
  for (const t of ['eau', 'energie', 'culture', 'construction', 'electronique', 'entrainement', 'premiers-secours']) {
    assert.ok(positives.filter(q => q.topic === t).length >= 4, `sujet ${t} : au moins 4 questions positives`);
  }
  assert.ok(Q.filter(q => q.lang === 'en').length >= 6, 'quelques questions en anglais sur un corpus mixte');
});

test('chaque ressource attendue existe dans le catalogue ; chaque positive a une ressource du plan d’indexation', () => {
  for (const q of Q) {
    for (const id of q.expect) assert.ok(byId.has(id), `${q.id} : ${id} n'est pas dans le catalogue`);
    for (const id of q.expect) assert.ok(['zim', 'pdf'].includes(byId.get(id)!.type), `${q.id} : ${id} n'est pas un corpus texte (zim/pdf)`);
  }
  for (const q of positives) {
    assert.ok(q.expect.length >= 1, `${q.id} : une positive attend au moins une ressource`);
    assert.ok(q.expect.some(id => planned.has(id)), `${q.id} : aucune ressource attendue n'est dans catalog/index-plan.yaml — jamais mesurable`);
    assert.ok(q.must.length >= 1, `${q.id} : une positive a des mots obligatoires`);
  }
});

test('critère 2 — chaque locator est dans un shard publié de la première vague (M4-3) ou marqué pending', () => {
  assert.equal(wave1.size, 20, 'la première vague est définie : 20 entrées `wave: 1` dans catalog/index-plan.yaml');
  for (const id of wave1) {
    const b = plan.build.find(x => x.id === id)!;
    assert.ok(byId.has(id) && b.ci !== false, `${id} : première vague = dans le catalogue et constructible en CI`);
  }
  let inWave1 = 0;
  for (const q of positives) {
    const l = q.locator;
    assert.ok(l, `${q.id} : une positive a un locator`);
    assert.ok(q.expect.includes(l.resource), `${q.id} : la ressource du locator (${l.resource}) est parmi les attendues`);
    assert.ok(planned.has(l.resource), `${q.id} : la ressource du locator est dans le plan d'indexation`);
    if (wave1.has(l.resource)) inWave1++;
    const published = byId.get(l.resource)!.index?.url;
    if (l.status === 'resolved') {
      assert.ok(l.chunk, `${q.id} : resolved exige chunk`);
      assert.ok(l.chunk!.startsWith(l.resource + '/'), `${q.id} : chunk = resource/path#offset`);
      assert.ok(published, `${q.id} : resolved exige un shard publié (index.url) pour ${l.resource}`);
    } else {
      assert.equal(l.status, 'pending');
      assert.equal(l.chunk, undefined, `${q.id} : pending n'a pas de chunk`);
    }
  }
  for (const q of negatives) assert.equal(q.locator, undefined, `${q.id} : une négative n'a pas de locator`);
  assert.ok(inWave1 >= 15, `au moins 15 locators visent la première vague (${inWave1}) : mesurables dès M4-3`);
});

test('critère 3 — 12 questions déclenchent le garde-fou attendu, 15 sont négatives, et rien d’autre ne déclenche', () => {
  assert.equal(flagged.length, 12);
  assert.equal(negatives.length, 15);
  assert.equal(flagged.filter(q => q.negative).length, 0, 'garde-fous et négatives sont disjoints');
  const counts: Record<string, number> = {};
  for (const q of flagged) {
    const got = detectRedFlags(q.q).map(f => f.id);
    assert.ok(got.includes(q.flag!), `${q.id} « ${q.q} » : attendu ${q.flag}, détecté [${got.join(', ')}]`);
    counts[q.flag!] = (counts[q.flag!] ?? 0) + 1;
  }
  for (const f of ['emergency', 'identification', 'dosage', 'diagnosis']) assert.ok((counts[f] ?? 0) >= 2, `au moins 2 questions pour ${f}`);
  for (const q of Q.filter(q => !q.flag)) {
    const got = detectRedFlags(q.q).map(f => f.id);
    assert.deepEqual(got, [], `${q.id} « ${q.q} » : faux positif [${got.join(', ')}]`);
  }
});

test('négatives : hors base, sans ressource attendue ni mot obligatoire', () => {
  for (const q of negatives) {
    assert.equal(q.topic, 'hors-base');
    assert.deepEqual(q.expect, [], `${q.id} : expect vide`);
    assert.deepEqual(q.must, [], `${q.id} : must vide`);
    assert.equal(q.calculator, undefined);
  }
});

test('arche-docs : les articles cités existent dans docs/ et contiennent les mots obligatoires', () => {
  const ours = positives.filter(q => q.locator!.resource === 'arche-docs');
  assert.ok(ours.length >= 5, 'notre propre corpus est évalué aussi');
  for (const q of ours) {
    const l = q.locator!;
    assert.ok(l.article, `${q.id} : un locator arche-docs donne le fichier de docs/`);
    const file = path.join(ROOT, 'docs', l.article!);
    assert.ok(fs.existsSync(file), `${q.id} : docs/${l.article} n'existe pas`);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of q.must) assert.ok(hasMust(text, m), `${q.id} : « ${m} » absent de docs/${l.article}`);
  }
});

test('régression garde-fou : le pluriel « des champignons … je peux les manger ? » déclenche identification', () => {
  for (const q of ['ces champignons sont comestibles ?', 'des champignons à pied blanc, je peux les manger ?', 'are these mushrooms edible']) {
    assert.ok(detectRedFlags(q).some(f => f.id === 'identification'), `non détecté : « ${q} »`);
  }
});
