import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, compareVersions, latestStable, isNewer, freshness } from '../src/core/versions.js';

test('prerelease markers are recognised across conventions', () => {
  const pre = ['v2.0.0-rc.1', '1.0.0-beta', '3.1.0b2', '1.4.0a1', '2.0rc1', '1.2.3.dev4', 'nightly-2026-09-01', 'v1.9-preview', 'rolling-2026', 'humble-testing-1'];
  for (const t of pre) assert.equal(parseVersion(t)?.prerelease ?? false, true, `${t} devrait être une prérelease`);
  const stable = ['v2.0.0', '1.0.0', '3.1.0', 'release-1.2', 'jazzy-1.0', '2024.05', '22.04 LTS', 'v0.0.1', 'core-1.1'];
  for (const t of stable) assert.equal(parseVersion(t)?.prerelease ?? true, false, `${t} ne devrait pas être une prérelease`);
});

test('a bare word without digits is not a version', () => {
  assert.equal(parseVersion('latest'), null);
  assert.equal(parseVersion('rolling'), null);
});

test('comparison is numeric, not lexical, and finals beat their prereleases', () => {
  const v = (s: string) => parseVersion(s)!;
  assert.ok(compareVersions(v('1.10.0'), v('1.9.9')) > 0, '1.10 > 1.9 (pas de comparaison de chaînes)');
  assert.ok(compareVersions(v('2.0.0'), v('2.0.0-rc.1')) > 0);
  assert.ok(compareVersions(v('1.2'), v('1.2.0')) === 0);
});

test('latestStable skips release candidates even when they are the newest tag', () => {
  const r = latestStable(['v1.8.2', 'v2.0.0-rc.3', 'v1.9.0', 'v2.0.0-beta.1']);
  assert.equal(r?.tag, 'v1.9.0');
  assert.equal(r?.fallback, undefined);
});

test('latestStable flags a project that only ever ships prereleases', () => {
  const r = latestStable(['0.3.0-alpha', '0.2.0-alpha']);
  assert.equal(r?.tag, '0.3.0-alpha');
  assert.equal(r?.fallback, 'only-prereleases');
});

test('lts stability prefers the LTS line and says when none exists', () => {
  const isLts = (t: string) => ['22.11.0', '20.19.0'].includes(t);
  const r = latestStable(['23.5.0', '22.11.0', '20.19.0'], 'lts', isLts);
  assert.equal(r?.tag, '22.11.0', 'la LTS la plus haute, pas la version la plus haute');
  const none = latestStable(['1.2.0', '1.1.0'], 'lts');
  assert.equal(none?.tag, '1.2.0');
  assert.equal(none?.fallback, 'no-lts-found');
});

test('any stability takes the bleeding edge on purpose', () => {
  assert.equal(latestStable(['1.0.0', '1.1.0-rc.1'], 'any')?.tag, '1.1.0-rc.1');
});

test('isNewer tolerates a missing current version', () => {
  assert.equal(isNewer('1.2.0', null), true);
  assert.equal(isNewer('1.2.0', '1.2.0'), false);
  assert.equal(isNewer('1.2.1', '1.2.0'), true);
  assert.equal(isNewer('1.2.0', '1.2.1'), false);
  assert.equal(isNewer('garbage', '1.0'), false);
});

test('freshness distinguishes fresh, stale, never and exempt', () => {
  const now = new Date('2026-09-11');
  assert.equal(freshness('2026-09-10', 7, 'npm', now).state, 'fresh');
  assert.equal(freshness('2026-08-01', 7, 'npm', now).state, 'stale');
  assert.equal(freshness('2026-08-01', 7, 'npm', now).ageDays, 41);
  assert.equal(freshness(null, 7, 'npm', now).state, 'never');
  assert.equal(freshness(null, 7, 'none', now).state, 'exempt');
  assert.equal(freshness('pas une date', 7, 'npm', now).state, 'never');
});

// --- Analyseurs de registres (purs) -------------------------------------------------------------

import { parseRosdistroIndex, latestActiveRos2Lts, parseDebianRelease, pickNode } from '../scripts/catalog/registries-parse.js';

const INDEX_V4 = `%YAML 1.1
# ROS index file
---
distributions:
  foxy:
    distribution: [foxy/distribution.yaml]
    distribution_status: end-of-life
    distribution_type: ros2
    python_version: 3
  humble:
    distribution: [humble/distribution.yaml]
    distribution_status: active
    distribution_type: ros2
  jazzy:
    distribution: [jazzy/distribution.yaml]
    distribution_status: active
    distribution_type: ros2
  kilted:
    distribution: [kilted/distribution.yaml]
    distribution_status: active
    distribution_type: ros2
  noetic:
    distribution: [noetic/distribution.yaml]
    distribution_status: active
    distribution_type: ros1
  rolling:
    distribution: [rolling/distribution.yaml]
    distribution_status: rolling
    distribution_type: ros2
type: index
version: 4
`;

test('rosdistro index is read without a YAML parser', () => {
  const d = parseRosdistroIndex(INDEX_V4);
  assert.deepEqual(d.map(x => x.name), ['foxy', 'humble', 'jazzy', 'kilted', 'noetic', 'rolling']);
  assert.equal(d.find(x => x.name === 'foxy')?.status, 'end-of-life');
  assert.equal(d.find(x => x.name === 'noetic')?.type, 'ros1');
});

test('latest active ROS 2 LTS ignores ros1, rolling, EOL and non-LTS distros', () => {
  // kilted est plus récente que jazzy mais n'est pas LTS ; noetic est ROS 1 ; rolling n'est pas stable.
  assert.equal(latestActiveRos2Lts(parseRosdistroIndex(INDEX_V4)), 'jazzy');
  assert.equal(latestActiveRos2Lts([]), null);
});

test('rosdistro parser returns nothing on an unexpected shape, so the PR shows it', () => {
  assert.deepEqual(parseRosdistroIndex('type: index\nversion: 4\n'), []);
});

test('debian Release file yields codename, version and date', () => {
  const rel = parseDebianRelease('Origin: Debian\nLabel: Debian\nSuite: stable\nVersion: 13.1\nCodename: trixie\nDate: Sat, 06 Sep 2026 10:12:00 UTC\nArchitectures: amd64 arm64\n');
  assert.deepEqual(rel, { codename: 'trixie', version: '13.1', date: '2026-09-06' });
  assert.equal(parseDebianRelease('garbage'), null);
});

test('node picker: lts takes the promoted line, stable the even line, any the newest', () => {
  const entries = [
    { version: 'v24.7.0', lts: false as const, date: '2026-09-01' },
    { version: 'v23.11.0', lts: false as const, date: '2026-04-01' },
    { version: 'v22.19.0', lts: 'Jod', date: '2026-08-15' },
    { version: 'v20.19.0', lts: 'Iron', date: '2026-03-01' },
  ];
  assert.equal(pickNode(entries, 'lts')?.version, 'v22.19.0');
  assert.equal(pickNode(entries, 'stable')?.version, 'v24.7.0', 'ligne paire la plus récente, même pas encore LTS');
  assert.equal(pickNode(entries, 'any')?.version, 'v24.7.0');
  assert.equal(pickNode([], 'lts'), null);
});

import { parseUbuntuMetaRelease, pickRaspiosImage } from '../scripts/catalog/registries-parse.js';

test('ubuntu meta-release-lts yields the last still-supported LTS', () => {
  const text = `Dist: focal
Name: Focal Fossa
Version: 20.04.6 LTS
Date: Thu, 23 Apr 2020 12:00:00 UTC
Supported: 0
Description: This is the 20.04 LTS release
Release-File: http://changelogs.ubuntu.com/meta-release-lts/focal

Dist: jammy
Name: Jammy Jellyfish
Version: 22.04.5 LTS
Date: Thu, 21 Apr 2022 12:00:00 UTC
Supported: 1
Description: This is the 22.04 LTS release

Dist: noble
Name: Noble Numbat
Version: 24.04.3 LTS
Date: Thu, 25 Apr 2024 12:00:00 UTC
Supported: 1
Description: This is the 24.04 LTS release
`;
  assert.deepEqual(parseUbuntuMetaRelease(text), { dist: 'noble', version: '24.04.3 LTS', date: '2024-04-25' });
  assert.equal(parseUbuntuMetaRelease('nonsense'), null);
});

test('raspberry pi imager list is searched recursively by image name', () => {
  const list = {
    os_list: [
      { name: 'Raspberry Pi OS (64-bit)', url: 'https://downloads.raspberrypi.com/raspios_arm64/images/raspios_arm64-2026-05-13/2026-05-13-raspios-bookworm-arm64.img.xz', release_date: '2026-05-13', image_download_sha256: 'aa'.repeat(32) },
      { name: 'Raspberry Pi OS (other)', subitems: [
        { name: 'Raspberry Pi OS Lite (64-bit)', url: 'https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-2026-05-13/2026-05-13-raspios-bookworm-arm64-lite.img.xz', release_date: '2026-05-13', image_download_sha256: 'bb'.repeat(32) },
        { name: 'Raspberry Pi OS Lite (32-bit)', url: 'https://example/32.img.xz' },
      ] },
    ],
  };
  const img = pickRaspiosImage(list, 'Raspberry Pi OS Lite \\(64-bit\\)');
  assert.equal(img?.url.endsWith('arm64-lite.img.xz'), true, 'la Lite 64 bits, pas la Desktop ni la 32 bits');
  assert.equal(img?.image_download_sha256?.startsWith('bb'), true);
  assert.equal(pickRaspiosImage(list, 'Ubuntu'), null);
  assert.equal(pickRaspiosImage(null, 'x'), null);
});
