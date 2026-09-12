// M2-3 — plus d'automerge : les champs sensibles du catalogue (url, checksum, size, licence, index)
// sont mis en évidence et étiquetés `catalog-sensitive`, jamais fusionnés par un robot (audit, erreur 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffCatalogs, isSensitiveField, flatten, renderMarkdown, insertIntoPrBody, type RawResource } from '../scripts/catalog/sensitive-diff.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');

const base: RawResource[] = [
  { id: 'a', status: 'active', version: '2026-08', checked: '2026-09-01', size_bytes: 1000, source: { kind: 'kiwix', kiwix_name: 'x', url: 'https://download.kiwix.org/x_2026-08.zim' }, checksum: null, license: { spdx: 'CC-BY-SA-4.0', redistribution: 'allowed' } },
  { id: 'b', status: 'active', source: { kind: 'http', url: 'https://example.org/b.pdf' }, checksum: { algo: 'sha256', value: 'aa' }, license: { spdx: 'MIT' }, index: { model: 'bge-m3', dims: 1024, url: 'https://archive.org/download/b/b.sqlite.zst', sha256: 'bb' } },
];
const clone = (r: RawResource[]) => JSON.parse(JSON.stringify(r)) as RawResource[];

test('isSensitiveField : source.*, checksum.*, license.*, size_bytes, index.{url,sha256,size_bytes} ; pas version/checked/status', () => {
  for (const f of ['source.url', 'source.kind', 'source.mirrors', 'source.torrent', 'source.magnet', 'source.ia_item', 'checksum.value', 'checksum.url', 'license.spdx', 'license.redistribution', 'size_bytes', 'index.url', 'index.sha256', 'index.size_bytes']) assert.ok(isSensitiveField(f), f);
  for (const f of ['version', 'checked', 'updated', 'status', 'priority', 'index.model', 'index.dims', 'name.fr', 'size_estimate_gb', 'built_from.built_at']) assert.ok(!isSensitiveField(f), f);
});

test('flatten : chemins pointés, tableaux en feuille, null ignoré', () => {
  const m = flatten({ a: { b: 1, c: null }, d: [1, 2], e: null });
  assert.deepEqual([...m.entries()], [['a.b', '1'], ['d', '[1,2]']]);
});

test('un changement de version/checked/status seul n\'est pas sensible', () => {
  const after = clone(base);
  after[0].version = '2026-09'; after[0].checked = '2026-09-12'; after[1].status = 'missing';
  const r = diffCatalogs(base, after);
  assert.equal(r.sensitive, false);
  assert.deepEqual(r.changed, []);
  assert.equal(r.other, 3);
});

test('un changement de source.url est sensible et nommé', () => {
  const after = clone(base);
  (after[0].source as Record<string, unknown>).url = 'https://evil.example/x_2026-09.zim';
  const r = diffCatalogs(base, after);
  assert.equal(r.sensitive, true);
  assert.deepEqual(r.changed, [{ id: 'a', field: 'source.url', from: 'https://download.kiwix.org/x_2026-08.zim', to: 'https://evil.example/x_2026-09.zim' }]);
});

test('checksum null → valeur, hachage modifié, index.sha256, licence, size_bytes : tous sensibles', () => {
  const after = clone(base);
  after[0].checksum = { algo: 'sha256', value: 'cc' };
  after[0].size_bytes = 10;
  (after[0].license as Record<string, unknown>).redistribution = 'forbidden';
  (after[1].checksum as Record<string, unknown>).value = 'dd';
  (after[1].index as Record<string, unknown>).sha256 = 'ee';
  const r = diffCatalogs(base, after);
  assert.equal(r.sensitive, true);
  assert.deepEqual(r.changed.map(c => `${c.id}.${c.field}`), ['a.checksum.algo', 'a.checksum.value', 'a.license.redistribution', 'a.size_bytes', 'b.checksum.value', 'b.index.sha256']);
  const cs = r.changed.find(c => c.id === 'a' && c.field === 'checksum.value')!;
  assert.equal(cs.from, null); assert.equal(cs.to, 'cc');
  assert.equal(r.other, 0);
});

test('ajout = sensible (nouvelle URL à relire) ; retrait = signalé, pas sensible ; l\'ordre ne compte pas', () => {
  const added = diffCatalogs(base, [...clone(base), { id: 'c', source: { kind: 'http', url: 'https://example.org/c' }, license: { spdx: 'MIT' } }]);
  assert.equal(added.sensitive, true); assert.deepEqual(added.added, ['c']); assert.deepEqual(added.changed, []);
  const removed = diffCatalogs(base, [clone(base)[0]]);
  assert.equal(removed.sensitive, false); assert.deepEqual(removed.removed, ['b']);
  const shuffled = diffCatalogs(base, [clone(base)[1], clone(base)[0]]);
  assert.equal(shuffled.sensitive, false); assert.equal(shuffled.other, 0);
});

test('renderMarkdown : tableau avec id, champ, avant/après ; message vide sinon', () => {
  const after = clone(base);
  (after[0].source as Record<string, unknown>).url = 'https://evil.example/x.zim';
  const md = renderMarkdown(diffCatalogs(base, after));
  assert.match(md, /catalog-sensitive/);
  assert.match(md, /\| `a` \| `source\.url` \| `https:\/\/download\.kiwix\.org\/x_2026-08\.zim` \| `https:\/\/evil\.example\/x\.zim` \|/);
  assert.match(md, /CONTRIBUTING\.md/);
  const empty = renderMarkdown(diffCatalogs(base, clone(base)));
  assert.match(empty, /Aucun champ sensible/);
  assert.doesNotMatch(empty, /\|---/);
  assert.match(insertIntoPrBody('## Titre\n\nreste', '### S'), /^## Titre\n\n### S\n\nreste$/);
});

test('CLI : deux répertoires de fixtures → sensitive.md/json, GITHUB_OUTPUT, section insérée dans le corps de PR', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arche-sensitive-'));
  try {
    const A = join(dir, 'a'), B = join(dir, 'b'), R = join(dir, 'reports');
    mkdirSync(A); mkdirSync(B);
    const yaml = (url: string, extra = '') => `- id: r1\n  source:\n    kind: http\n    url: ${url}\n  license:\n    spdx: MIT\n${extra}`;
    writeFileSync(join(A, 'x.yaml'), yaml('https://good.example/f'));
    writeFileSync(join(B, 'x.yaml'), yaml('https://evil.example/f', '  version: "2"\n'));
    writeFileSync(join(B, 'y.yaml'), '- id: r2\n  source:\n    kind: manual\n  license:\n    spdx: MIT\n');
    const body = join(dir, 'PR_BODY.md');
    writeFileSync(body, '## Mise à jour\n\nGénéré.\n');
    const out = join(dir, 'gh-output');
    writeFileSync(out, '');
    const r = spawnSync('npx', ['tsx', join(ROOT, 'scripts', 'catalog', 'sensitive-diff.ts'), '--base', A, '--head', B, '--reports', R, '--pr-body', body],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: undefined }, shell: process.platform === 'win32' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /sensitive: true \(1 champ\(s\), \+1 \/ −0 ressource\(s\), 1 autre\(s\)\)/);
    assert.match(readFileSync(out, 'utf8'), /sensitive=true\ncount=2\n/);
    const json = JSON.parse(readFileSync(join(R, 'sensitive.json'), 'utf8'));
    assert.deepEqual(json.changed, [{ id: 'r1', field: 'source.url', from: 'https://good.example/f', to: 'https://evil.example/f' }]);
    assert.deepEqual(json.added, ['r2']);
    assert.match(readFileSync(join(R, 'sensitive.md'), 'utf8'), /`r1` \| `source\.url`/);
    const pr = readFileSync(body, 'utf8');
    assert.ok(pr.startsWith('## Mise à jour\n\n### 🔒 Champs sensibles'), pr);
    assert.match(pr, /Généré\./);

    // Même contenu → rien de sensible, sortie `sensitive=false`.
    writeFileSync(out, '');
    const same = spawnSync('npx', ['tsx', join(ROOT, 'scripts', 'catalog', 'sensitive-diff.ts'), '--base', A, '--head', A, '--reports', R],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out }, shell: process.platform === 'win32' });
    assert.equal(same.status, 0, same.stdout + same.stderr);
    assert.match(readFileSync(out, 'utf8'), /sensitive=false\ncount=0\n/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('critère 1 — plus aucun automerge dans .github/workflows ; l\'étiquette catalog-sensitive est posée', () => {
  assert.ok(!existsSync(join(WORKFLOWS, 'catalog-automerge.yml')), 'catalog-automerge.yml doit avoir disparu');
  const files = readdirSync(WORKFLOWS).filter(f => /\.ya?ml$/.test(f));
  for (const f of files) {
    const text = readFileSync(join(WORKFLOWS, f), 'utf8');
    assert.doesNotMatch(text, /auto[-_]?merge/i, `${f} ne doit pas contenir automerge`);
    assert.doesNotMatch(text, /pulls\.merge|enablePullRequestAutoMerge|gh pr merge/i, `${f} ne doit fusionner aucune PR`);
  }
  const update = readFileSync(join(WORKFLOWS, 'catalog-update.yml'), 'utf8');
  assert.match(update, /scripts\/catalog\/sensitive-diff\.ts --base HEAD --pr-body \.catalog-reports\/PR_BODY\.md/);
  assert.match(update, /steps\.sensitive\.outputs\.sensitive == 'true' && 'catalog, automated, catalog-sensitive'/);
  for (const f of ['zim-build.yml', 'index-build.yml']) assert.match(readFileSync(join(WORKFLOWS, f), 'utf8'), /labels: catalog, \w+, automated, catalog-sensitive/, f);
  const review = readFileSync(join(WORKFLOWS, 'catalog-review.yml'), 'utf8');
  assert.match(review, /on:\n  pull_request:/);
  assert.match(review, /sensitive-diff\.ts --base origin\/\$\{\{ github\.base_ref \}\}/);
  assert.match(review, /addLabels\(.*labels: \[name\]/);
  assert.match(review, /name = "catalog-sensitive"/);
});

test('critère 2 — CONTRIBUTING.md : relecture à deux pour url/checksum/size/licence', () => {
  const c = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8');
  assert.match(c, /catalog-sensitive/);
  assert.match(c, /deux humains/);
  assert.match(c, /two humans/);
  for (const f of ['source\\.\\*', 'checksum', 'size_bytes', 'license']) assert.match(c, new RegExp(f), f);
  assert.match(c, /Aucun workflow ne fusionne/);
});
