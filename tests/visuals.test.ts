import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadViews, manifestIssues, coverageOf, summarize, loadManifests, type VisualManifest } from '../src/core/visuals.js';
import { normalizeLicense, parseImageInfo, guessView } from '../scripts/visuals/commons-lib.js';

const tax = loadViews();

const base = (over: Partial<VisualManifest> = {}): VisualManifest => ({
  id: 'amanita-phalloides', kind: 'fungus', names: { fr: 'Amanite phalloïde', en: 'Death cap' }, views: {}, ...over,
});
const photo = (file: string, status: 'candidate' | 'verified' | 'rejected' = 'verified') => ({
  file, source: `https://commons.wikimedia.org/wiki/${file}`, license: 'CC-BY-SA-4.0', provenance: 'photo' as const, status,
});

test('views taxonomy loads and marks identification views as diagnostic', () => {
  assert.ok(tax.kinds['fungus']!.views['stem_base']!.diagnostic);
  assert.ok(tax.kinds['fungus']!.views['lookalike']!.required);
  assert.equal(tax.provenance.generated.diagnostic_ok, false);
  assert.equal(tax.provenance.photo.diagnostic_ok, true);
});

test('a generated image on a diagnostic view is refused, on a diagram view it is allowed', () => {
  const bad = base({ views: { hymenium: { files: [{ ...photo('File:x.png'), provenance: 'generated' }] } } });
  assert.ok(manifestIssues(bad, tax).some(m => /DIAGNOSTIQUE.*generated/.test(m)));
  const ok: VisualManifest = { id: 'rope-pump', kind: 'machine', names: { fr: 'Pompe à corde', en: 'Rope pump' }, views: { principle: { files: [{ ...photo('File:p.svg'), provenance: 'generated' }] } } };
  assert.deepEqual(manifestIssues(ok, tax), []);
});

test('files without licence, with NC/ND licence, or without source are refused', () => {
  const m = base({ views: { cap: { files: [
    { file: 'File:a.jpg', source: 'https://x', license: 'CC-BY-NC-4.0', provenance: 'photo' },
    { file: 'File:b.jpg', source: '', license: 'CC-BY-4.0', provenance: 'photo' },
    { file: 'File:c.jpg', source: 'https://x', license: '', provenance: 'photo' },
  ] } } });
  const issues = manifestIssues(m, tax);
  assert.ok(issues.some(i => i.includes('File:a.jpg') && i.includes('non redistribuable')));
  assert.ok(issues.some(i => i.includes('File:b.jpg') && i.includes('source')));
  assert.ok(issues.some(i => i.includes('File:c.jpg') && i.includes('licence manquante')));
});

test('unknown kind or view is reported', () => {
  assert.ok(manifestIssues(base({ kind: 'dragon' }), tax).some(m => m.includes('kind inconnu')));
  assert.ok(manifestIssues(base({ views: { wings: { files: [] } } }), tax).some(m => m.includes('vue inconnue')));
});

test('coverage counts only verified files for required views, and separates pending from missing', () => {
  const m = base({ views: {
    habit: { files: [photo('File:h.jpg')] },
    cap: { files: [photo('File:c.jpg', 'candidate')] },
    hymenium: { files: [photo('File:g.jpg', 'rejected')] },
    micrograph: { files: [photo('File:m.jpg')] }, // non requise : ne compte pas dans le total
  } });
  const c = coverageOf(m, tax);
  assert.equal(c.requiredTotal, 7);
  assert.equal(c.requiredCovered, 1);
  assert.deepEqual(c.pendingOnly, ['cap']);
  assert.ok(c.missing.includes('hymenium'), 'un fichier rejeté ne couvre rien');
  assert.ok(c.missing.includes('stem_base'));
  assert.equal(c.files, 4); assert.equal(c.verified, 2);
  const s = summarize([c]);
  assert.equal(s.pct, Math.round((1 / 7) * 100));
  assert.equal(summarize([]).pct, 100);
});

test('the shipped manifests are valid and load from the catalog', () => {
  const ms = loadManifests();
  assert.ok(ms.length >= 2);
  for (const { file, manifest } of ms) assert.deepEqual(manifestIssues(manifest, tax), [], file);
});

// --- Commons -------------------------------------------------------------------------------------

test('licence normalisation: free vs not, versions, public domain', () => {
  assert.deepEqual(normalizeLicense('CC BY-SA 4.0'), { license: 'CC-BY-SA-4.0', free: true });
  assert.deepEqual(normalizeLicense('CC BY 2.0'), { license: 'CC-BY-2.0', free: true });
  assert.deepEqual(normalizeLicense('CC BY-NC-SA 3.0'), { license: 'CC-BY-NC-SA-3.0', free: false });
  assert.deepEqual(normalizeLicense('CC BY-ND 4.0'), { license: 'CC-BY-ND-4.0', free: false });
  assert.deepEqual(normalizeLicense('CC0'), { license: 'CC0', free: true });
  assert.deepEqual(normalizeLicense('Public domain'), { license: 'PD', free: true });
  assert.equal(normalizeLicense(undefined).free, false);
  assert.equal(normalizeLicense('Fair use').free, false);
});

test('imageinfo response is parsed into files with licence, author and categories', () => {
  const json = { query: { pages: [
    { title: 'File:Amanita phalloides 1.JPG', imageinfo: [{ url: 'https://upload.wikimedia.org/x/Amanita_phalloides_1.JPG', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Amanita_phalloides_1.JPG', sha1: 'abc', width: 3000, height: 2000, mime: 'image/jpeg',
      extmetadata: { LicenseShortName: { value: 'CC BY-SA 3.0' }, Artist: { value: '<a href="/wiki/User:X">Archenzo</a>' }, ImageDescription: { value: 'Death cap, <b>volva</b> visible, Italy' } } }],
      categories: [{ title: 'Category:Amanita phalloides' }, { title: 'Category:Fungi of Italy' }] },
    { title: 'File:NoInfo.jpg' },
    { title: 'Category:Not a file', imageinfo: [{ url: 'x' }] },
  ] } };
  const files = parseImageInfo(json);
  assert.equal(files.length, 1);
  const f = files[0]!;
  assert.equal(f.license, 'CC-BY-SA-3.0'); assert.equal(f.free, true);
  assert.equal(f.author, 'Archenzo', 'balises HTML retirées');
  assert.equal(f.description, 'Death cap, volva visible, Italy');
  assert.deepEqual(f.categories, ['Amanita phalloides', 'Fungi of Italy']);
  assert.deepEqual(parseImageInfo({}), []);
});

test('view guessing proposes the right slot from title, description and categories', () => {
  const mk = (title: string, description = '', categories: string[] = []) => ({ title, url: '', descriptionUrl: '', license: 'CC0', free: true, categories, description });
  assert.equal(guessView('fungus', mk('File:Amanita phalloides spore print.jpg')), 'spore_print');
  assert.equal(guessView('fungus', mk('File:A.jpg', 'volva and ring clearly visible')), 'stem_base');
  assert.equal(guessView('fungus', mk('File:A.jpg', '', ['Amanita phalloides in situ'])), 'habit');
  assert.equal(guessView('plant', mk('File:Allium ursinum flowers.jpg')), 'flower');
  assert.equal(guessView('plant', mk('File:Illustration Allium ursinum0.jpg', 'Köhler plate')), 'plate');
  assert.equal(guessView('plant', mk('File:IMG_2041.jpg')), null, 'sans indice, on ne place pas');
  assert.equal(guessView('tool', mk('File:hammer.jpg')), null, 'pas de règles pour ce domaine : pas de devinette');
});
