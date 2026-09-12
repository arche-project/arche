// scripts/loc.sh — la mesure du noyau (M3-1, ADR 0013, audit décision 4).
// Le script est en bash : on l'exécute sur une arborescence minuscule créée à la volée, et on
// recoupe son chiffre pour src/ avec un compte indépendant en Node. Sans bash (rare), on saute.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'loc.sh');
// Sous Windows, `bash` peut résoudre le lanceur WSL de System32 : on préfère Git Bash s'il est là.
const GIT_BASH = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe');
const BASH = process.platform === 'win32' && existsSync(GIT_BASH) ? GIT_BASH : 'bash';

function loc(args: string[]) {
  const r = spawnSync(BASH, [SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), missing: r.error?.code === 'ENOENT' };
}

/** Parse « src/  123 lignes » → { src: 123, examples: …, vendor: … }. */
function parse(out: string) {
  const n: Record<string, number> = {};
  for (const m of out.matchAll(/^(src|examples|vendor)\/\s+(\d+) lignes$/gm)) n[m[1]] = Number(m[2]);
  return n;
}

const lines = (s: string) => s.split('\n').length - 1; // même convention que wc -l : les \n

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'arche-loc-'));
  const w = (rel: string, n: number) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), Array.from({ length: n }, (_, i) => `line ${i}`).join('\n') + '\n');
  };
  w('src/cli.ts', 3);
  w('src/core/deep/x.tsx', 4);
  w('src/core/x.test.ts', 50); // test : exclu
  w('src/types.d.ts', 50); // déclaration : exclue
  w('src/web/static/index.html', 50); // pas du code : exclu
  w('src/node_modules/dep/index.js', 50); // exclu
  w('src/fixtures/sample.ts', 50); // exclu
  w('examples/projects/garden.ts', 2);
  w('examples/inventaire.yaml', 50); // pas du code : exclu
  // pas de vendor/ : doit afficher 0, pas planter
  writeFileSync(join(dir, 'README.md'), 'avant\nnoyau : <!-- loc -->x<!-- /loc --> fin\naprès\n');
  return dir;
}

test('loc.sh compte src/, examples/, vendor/ séparément, hors tests et hors non-code', (t) => {
  const dir = fixture();
  try {
    const r = loc(['--root', dir]);
    if (r.missing) return t.skip('bash absent');
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(parse(r.out), { src: 7, examples: 2, vendor: 0 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loc.sh --max échoue au-dessus du seuil, passe au seuil exact', (t) => {
  const dir = fixture();
  try {
    const over = loc(['--root', dir, '--max', '6']);
    if (over.missing) return t.skip('bash absent');
    assert.equal(over.code, 1);
    assert.match(over.out, /src\/ fait 7 lignes, seuil 6/);
    assert.equal(loc(['--root', dir, '--max', '7']).code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loc.sh --readme ne réécrit que le bloc <!-- loc -->', (t) => {
  const dir = fixture();
  try {
    const r = loc(['--root', dir, '--readme']);
    if (r.missing) return t.skip('bash absent');
    assert.equal(r.code, 0, r.out);
    assert.equal(
      readFileSync(join(dir, 'README.md'), 'utf8'),
      'avant\nnoyau : <!-- loc -->`src/` 7 · `examples/` 2 · `vendor/` 0<!-- /loc --> fin\naprès\n',
    );
    // Idempotent : une seconde passe ne change rien.
    loc(['--root', dir, '--readme']);
    assert.match(readFileSync(join(dir, 'README.md'), 'utf8'), /`src\/` 7 · `examples\/` 2 · `vendor\/` 0/);
    // Sans bloc : erreur explicite, README intact.
    writeFileSync(join(dir, 'README.md'), 'rien\n');
    const none = loc(['--root', dir, '--readme']);
    assert.equal(none.code, 2);
    assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), 'rien\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sur le dépôt réel, le chiffre de src/ recoupe un compte indépendant en Node', (t) => {
  const r = loc([]);
  if (r.missing) return t.skip('bash absent');
  assert.equal(r.code, 0, r.out);
  const n = parse(r.out);
  assert.ok(n.src > 0 && Number.isInteger(n.examples) && Number.isInteger(n.vendor), r.out);
  const walk = (d: string): number =>
    readdirSync(d).reduce((sum, name) => {
      const p = join(d, name);
      if (statSync(p).isDirectory()) return ['node_modules', 'fixtures', 'dist'].includes(name) ? sum : sum + walk(p);
      if (/\.(test|d)\.ts$/.test(name) || !/\.(ts|tsx|js|mjs|cjs)$/.test(name)) return sum;
      return sum + lines(readFileSync(p, 'utf8'));
    }, 0);
  assert.equal(n.src, walk(join(ROOT, 'src')));
});

test('le seuil de ci.yml et le bloc du README sont cohérents avec le script', (t) => {
  const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const m = ci.match(/scripts\/loc\.sh --max (\d+)/);
  assert.ok(m, 'ci.yml doit appeler scripts/loc.sh --max N');
  const max = Number(m![1]);
  assert.ok([7000, 5000, 3000].includes(max), `seuil ${max} hors du calendrier 7000 → 5000 → 3000`);
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /<!-- loc -->`src\/` \d+ · `examples\/` \d+ · `vendor\/` \d+<!-- \/loc -->/);
  const r = loc(['--max', String(max)]);
  if (r.missing) return t.skip('bash absent');
  assert.equal(r.code, 0, `src/ dépasse le seuil CI courant :\n${r.out}`);
});
