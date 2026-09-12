import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDebianPackages, parseApkIndex, closure, compareDebVersion } from '../src/core/mirror/packages.js';
import { planMirror, indexUrl, packageUrl, validateRecipe, mergeIndexes, type MirrorRecipe } from '../src/core/mirror/recipe.js';
import { extractApkIndex } from '../src/commands/mirror.js';

const PACKAGES = `Package: hostapd
Version: 2:2.10-22
Architecture: arm64
Depends: libc6 (>= 2.34), libssl3t64 (>= 3.0.0), lsb-base | sysvinit-utils
Recommends: wpasupplicant
Filename: pool/main/w/wpa/hostapd_2.10-22_arm64.deb
Size: 780000
SHA256: aa11

Package: libc6
Version: 2.40-3
Architecture: arm64
Depends: libgcc-s1
Filename: pool/main/g/glibc/libc6_2.40-3_arm64.deb
Size: 2800000
SHA256: bb22

Package: libgcc-s1
Version: 14.2.0-6
Architecture: arm64
Filename: pool/main/g/gcc-14/libgcc-s1_14.2.0-6_arm64.deb
Size: 60000

Package: libssl3t64
Version: 3.4.0-1
Architecture: arm64
Depends: libc6 (>= 2.34)
Filename: pool/main/o/openssl/libssl3t64_3.4.0-1_arm64.deb
Size: 2200000

Package: sysvinit-utils
Version: 3.12-1
Architecture: arm64
Provides: lsb-base (= 11.99)
Filename: pool/main/s/sysvinit/sysvinit-utils_3.12-1_arm64.deb
Size: 30000

Package: wpasupplicant
Version: 2:2.10-22
Architecture: arm64
Depends: libc6 (>= 2.34), libpcsclite1
Filename: pool/main/w/wpa/wpasupplicant_2.10-22_arm64.deb
Size: 1300000

Package: libc6
Version: 2.39-1
Architecture: arm64
Description: an older duplicate that must lose
Filename: pool/main/g/glibc/libc6_2.39-1_arm64.deb
Size: 1
`;

test('debian Packages: stanzas, alternatives, virtual providers, version dedup', () => {
  const idx = parseDebianPackages(PACKAGES);
  assert.equal(idx.byName.size, 6);
  const h = idx.byName.get('hostapd')!;
  assert.deepEqual(h.depends, [['libc6'], ['libssl3t64'], ['lsb-base', 'sysvinit-utils']], 'contraintes de version retirées, alternatives gardées');
  assert.deepEqual(h.recommends, [['wpasupplicant']]);
  assert.equal(h.sha256, 'aa11');
  assert.equal(idx.providers.get('lsb-base')?.[0]?.name, 'sysvinit-utils');
  assert.equal(idx.byName.get('libc6')!.version, '2.40-3', 'la version la plus haute gagne, quel que soit l’ordre');
});

test('debian version comparison handles epochs, numbers and revisions', () => {
  assert.ok(compareDebVersion('2:2.10-22', '2.11-1') > 0, 'l’epoch prime');
  assert.ok(compareDebVersion('2.40-3', '2.39-1') > 0);
  assert.ok(compareDebVersion('1.10', '1.9') > 0, 'numérique, pas lexical');
  assert.equal(compareDebVersion('3.4.0-1', '3.4.0-1'), 0);
});

test('closure is exact: hard deps only, first available alternative, virtual via provider', () => {
  const idx = parseDebianPackages(PACKAGES);
  const r = closure(idx, ['hostapd']);
  assert.deepEqual(r.packages.map(p => p.name), ['hostapd', 'libc6', 'libgcc-s1', 'libssl3t64', 'sysvinit-utils']);
  assert.equal(r.unresolved.length, 0);
  assert.equal(r.totalBytes, 780000 + 2800000 + 60000 + 2200000 + 30000);
});

test('closure with recommends follows them and reports what cannot be resolved', () => {
  const idx = parseDebianPackages(PACKAGES);
  const r = closure(idx, ['hostapd'], { recommends: true });
  assert.ok(r.packages.some(p => p.name === 'wpasupplicant'));
  assert.ok(r.unresolved.some(u => u.from === 'wpasupplicant' && u.dep === 'libpcsclite1'), 'libpcsclite1 n’est pas dans l’index : dit, pas caché');
});

test('closure of an unknown root is reported, not silently empty', () => {
  const r = closure(parseDebianPackages(PACKAGES), ['nonexistent-pkg']);
  assert.equal(r.packages.length, 0);
  assert.deepEqual(r.unresolved, [{ from: '(racine)', dep: 'nonexistent-pkg' }]);
});

const APKINDEX = `C:Q1abc
P:hostapd
V:2.10-r10
A:aarch64
S:512000
D:so:libc.musl-aarch64.so.1 so:libcrypto.so.3 /bin/sh
p:cmd:hostapd=2.10-r10

C:Q1def
P:musl
V:1.2.5-r0
A:aarch64
S:400000
p:so:libc.musl-aarch64.so.1=1

C:Q1ghi
P:openssl
V:3.3.2-r0
A:aarch64
S:300000
D:so:libc.musl-aarch64.so.1
p:so:libcrypto.so.3=3 so:libssl.so.3=3 cmd:openssl=3.3.2-r0

C:Q1jkl
P:busybox
V:1.36.1-r29
A:aarch64
S:600000
D:so:libc.musl-aarch64.so.1 !busybox-initscripts
p:/bin/sh cmd:sh=1.36.1-r29
`;

test('alpine APKINDEX: so:/cmd:/path providers resolve, conflicts are ignored', () => {
  const idx = parseApkIndex(APKINDEX);
  assert.equal(idx.byName.size, 4);
  const r = closure(idx, ['hostapd']);
  assert.deepEqual(r.packages.map(p => p.name), ['busybox', 'hostapd', 'musl', 'openssl']);
  assert.equal(r.unresolved.length, 0, 'so: et /bin/sh sont fournis par p:');
  assert.equal(idx.byName.get('hostapd')!.filename, 'hostapd-2.10-r10.apk');
});

test('APKINDEX member is extracted from a hand-built tar without any library', () => {
  const body = Buffer.from('P:demo\nV:1\n', 'utf8');
  const header = Buffer.alloc(512);
  header.write('APKINDEX', 0, 'utf8');
  header.write(body.length.toString(8).padStart(11, '0') + '\0', 124, 'utf8');
  const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512); body.copy(padded);
  const junkHeader = Buffer.alloc(512); junkHeader.write('DESCRIPTION', 0, 'utf8'); junkHeader.write('00000000003\0', 124, 'utf8');
  const junk = Buffer.alloc(512); junk.write('xyz');
  const tar = Buffer.concat([junkHeader, junk, header, padded, Buffer.alloc(1024)]);
  assert.equal(extractApkIndex(tar), 'P:demo\nV:1\n');
  assert.throws(() => extractApkIndex(Buffer.concat([junkHeader, junk, Buffer.alloc(1024)])), /APKINDEX absent/);
});

test('recipe URLs follow each repository layout', () => {
  const deb: MirrorRecipe = { id: 'd', resource: 'x', type: 'apt', base_url: 'https://deb.debian.org/debian', suite: 'trixie', components: ['main'], architectures: ['arm64'], packages: ['git'] };
  assert.equal(indexUrl(deb, 'main', 'arm64'), 'https://deb.debian.org/debian/dists/trixie/main/binary-arm64/Packages');
  assert.equal(packageUrl(deb, 'main', 'arm64', 'pool/main/g/git/git_2.47.deb'), 'https://deb.debian.org/debian/pool/main/g/git/git_2.47.deb');
  const apk: MirrorRecipe = { ...deb, type: 'apk', base_url: 'https://dl-cdn.alpinelinux.org/alpine', suite: 'v3.21', components: ['main', 'community'], architectures: ['aarch64'] };
  assert.equal(indexUrl(apk, 'community', 'aarch64'), 'https://dl-cdn.alpinelinux.org/alpine/v3.21/community/aarch64/APKINDEX.tar.gz');
  assert.equal(packageUrl(apk, 'main', 'aarch64', 'musl-1.2.5-r0.apk'), 'https://dl-cdn.alpinelinux.org/alpine/v3.21/main/aarch64/musl-1.2.5-r0.apk');
});

test('planMirror merges components, attributes each apk package to its component, and sums size', () => {
  const main = parseApkIndex(APKINDEX.split('\n\n').slice(0, 3).join('\n\n'));  // hostapd, musl, openssl
  const community = parseApkIndex(APKINDEX.split('\n\n').slice(3).join('\n\n')); // busybox
  const r: MirrorRecipe = { id: 'a', resource: 'alpine-standard', type: 'apk', base_url: 'https://dl-cdn.alpinelinux.org/alpine', suite: 'v3.21', components: ['main', 'community'], architectures: ['aarch64'], packages: ['hostapd'] };
  const plan = planMirror(r, 'aarch64', { main, community });
  assert.equal(plan.result.packages.length, 4);
  assert.ok(plan.downloads.some(d => d.url.includes('/community/aarch64/busybox-')), 'busybox vient de community');
  assert.ok(plan.downloads.some(d => d.url.includes('/main/aarch64/musl-')));
  assert.equal(plan.result.totalBytes, 512000 + 400000 + 300000 + 600000);
  assert.equal(mergeIndexes([]).byName.size, 0);
});

test('recipe validation catches the mistakes people actually make', () => {
  assert.deepEqual(validateRecipe({ id: 'x', resource: 'r', type: 'apt', base_url: 'https://a.b/c', suite: 's', components: ['main'], architectures: ['amd64'], packages: ['git'] }), []);
  const bad = validateRecipe({ id: 'x', type: 'yum' as never, base_url: 'https://a.b/c/', components: [], architectures: [], packages: [] });
  assert.ok(bad.some(e => e.includes('type inconnu')));
  assert.ok(bad.some(e => e.includes('finir par /')));
  assert.ok(bad.some(e => e.includes('packages vide')));
  assert.ok(bad.some(e => e.includes('resource')));
});

test('the four shipped recipes are valid and consistent with the catalog', async () => {
  const fs = await import('node:fs');
  const { parse } = await import('yaml');
  const { loadCatalog } = await import('../src/core/catalog.js');
  const cat = loadCatalog({ strict: true });
  for (const f of fs.readdirSync('catalog/mirrors').filter(x => x.endsWith('.yaml'))) {
    const r = parse(fs.readFileSync(`catalog/mirrors/${f}`, 'utf8')) as MirrorRecipe;
    assert.deepEqual(validateRecipe(r), [], f);
    assert.ok(cat.byId.has(r.resource), `${f}: la ressource ${r.resource} n’existe pas dans le catalogue`);
  }
});
