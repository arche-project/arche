// Régression du premier run de catalog-update.yml (12 sept. 2026) : les vérificateurs posaient
// `notes.en` seul sur des ressources sans `notes`, et le schéma (i18n : fr ET en requis) refusait
// ensuite le catalogue — 8 ressources invalides, PR jamais ouverte.
// Regression for the first catalog-update.yml run: checkers wrote `notes.en` alone on resources
// without `notes`; the schema (i18n: fr AND en required) then rejected the catalogue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument } from 'yaml';
import { setUpdaterNote, changes, today, type ResourceFile } from '../scripts/catalog/lib.js';
import type { Resource } from '../src/core/types.js';

function file(yamlText: string): ResourceFile {
  const doc = parseDocument(yamlText);
  return { file: '/dev/null', doc, items: doc.toJS() as Resource[] };
}

test('setUpdaterNote : ressource sans notes → objet complet fr + en', () => {
  const rf = file(`- id: a\n  type: software\n`);
  setUpdaterNote(rf, 0, 'asset pattern matches nothing in v2', 'asset pattern broken');
  const notes = rf.doc.getIn([0, 'notes']) as { toJS?: () => unknown } | undefined;
  const js = (rf.doc.toJS() as Array<{ notes: { fr: string; en: string } }>)[0].notes;
  assert.ok(notes, 'notes créé');
  assert.equal(js.en, `[updater ${today()}: asset pattern matches nothing in v2]`);
  assert.equal(js.fr, js.en);
});

test('setUpdaterNote : notes existantes → texte conservé, une seule marque updater, dans les deux langues', () => {
  const rf = file(`- id: b\n  notes:\n    fr: "Lecteur de ZIM. [updater 2025-01-01: ancien]"\n    en: "ZIM reader. [updater 2025-01-01: old]"\n`);
  setUpdaterNote(rf, 0, 'size dropped from 1.0 GB to 0.10 GB', 'size drop');
  const js = (rf.doc.toJS() as Array<{ notes: { fr: string; en: string } }>)[0].notes;
  assert.equal(js.fr, `Lecteur de ZIM. [updater ${today()}: size dropped from 1.0 GB to 0.10 GB]`);
  assert.equal(js.en, `ZIM reader. [updater ${today()}: size dropped from 1.0 GB to 0.10 GB]`);
  assert.equal((js.fr.match(/\[updater /g) ?? []).length, 1);
  assert.equal((js.en.match(/\[updater /g) ?? []).length, 1);
});

test('setUpdaterNote : idempotent le même jour (aucun changement journalisé au second appel)', () => {
  const rf = file(`- id: c\n  notes: { fr: "x", en: "x" }\n`);
  setUpdaterNote(rf, 0, 'note');
  const n = changes.length;
  setUpdaterNote(rf, 0, 'note');
  assert.equal(changes.length, n);
});
