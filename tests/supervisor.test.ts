import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backoffDelay, findBinary, discoverServices, Supervisor } from '../src/core/supervisor.js';
import { systemdUnit, launchdPlist, serviceInstallPlan } from '../src/core/service-files.js';
import { runtimeIssues } from '../src/core/catalog.js';
import type { Resource } from '../src/core/types.js';

// --- Parties pures -------------------------------------------------------------------------------

test('backoff doubles and is capped', () => {
  assert.equal(backoffDelay(0, 1000, 60000), 1000);
  assert.equal(backoffDelay(1, 1000, 60000), 2000);
  assert.equal(backoffDelay(5, 1000, 60000), 32000);
  assert.equal(backoffDelay(6, 1000, 60000), 60000, 'plafonné');
  assert.equal(backoffDelay(100, 1000, 60000), 60000, 'pas de débordement pour un grand n');
  assert.equal(backoffDelay(-1, 1000, 60000), 1000);
});

test('findBinary prefers the library over the PATH and tolerates a missing library', () => {
  const lib = mkdtempSync(path.join(tmpdir(), 'arche-lib-'));
  try {
    assert.equal(findBinary(lib, 'definitely-not-a-binary-xyz'), null);
    const dir = path.join(lib, 'software', 'kiwix-tools', 'bin');
    mkdirSync(dir, { recursive: true });
    const bin = path.join(dir, 'kiwix-serve');
    writeFileSync(bin, '#!/bin/sh\n'); chmodSync(bin, 0o755);
    assert.equal(findBinary(lib, 'kiwix-serve'), bin);
    // `sh` existe dans le PATH mais pas dans la bibliothèque : on le trouve quand même.
    assert.equal(findBinary(lib, 'sh'), 'sh');
  } finally { rmSync(lib, { recursive: true, force: true }); }
});

test('discoverServices launches only what is installed and honours --no-*', () => {
  const lib = mkdtempSync(path.join(tmpdir(), 'arche-lib-'));
  try {
    const dir = path.join(lib, 'software', 'x'); mkdirSync(dir, { recursive: true });
    for (const n of ['kiwix-serve', 'ollama']) { const b = path.join(dir, n); writeFileSync(b, '#!/bin/sh\n'); chmodSync(b, 0o755); }
    const zims = ['/a.zim'];
    const { specs, missing } = discoverServices(lib, { bind: '127.0.0.1', kiwixPort: 8080, zims });
    assert.deepEqual(specs.map(s => s.name), ['kiwix', 'ollama']);
    assert.deepEqual(missing, ['gitea']);
    assert.ok(specs[0]!.args.includes('/a.zim'));
    assert.equal(specs[1]!.env?.OLLAMA_MODELS, path.join(lib, 'models'), 'les modèles vivent dans la bibliothèque');
    const off = discoverServices(lib, { bind: '127.0.0.1', kiwixPort: 8080, zims, disable: ['ollama'] });
    assert.deepEqual(off.specs.map(s => s.name), ['kiwix']);
    const noZim = discoverServices(lib, { bind: '127.0.0.1', kiwixPort: 8080, zims: [] });
    assert.ok(!noZim.specs.some(s => s.name === 'kiwix'), 'kiwix-serve sans ZIM n’a rien à servir');
  } finally { rmSync(lib, { recursive: true, force: true }); }
});

test('systemd unit and launchd plist carry the exec line, the library and restart policy', () => {
  const o = { execPath: '/opt/arche/arche', args: ['serve', '--quiet'], library: '/srv/library' };
  const unit = systemdUnit(o);
  assert.ok(unit.includes('ExecStart=/opt/arche/arche serve --quiet --library /srv/library'));
  assert.ok(unit.includes('Restart=on-failure'));
  assert.ok(unit.includes('WantedBy=default.target'), 'unité utilisateur par défaut');
  assert.ok(systemdUnit({ ...o, user: 'arche' }).includes('WantedBy=multi-user.target'));
  const quoted = systemdUnit({ ...o, library: '/srv/ma bibliothèque' });
  assert.ok(quoted.includes('"/srv/ma bibliothèque"'), 'un chemin avec espace est cité');
  const plist = launchdPlist(o);
  assert.ok(plist.includes('<string>org.arche.serve</string>'));
  assert.ok(plist.includes('<string>--library</string>') && plist.includes('<string>/srv/library</string>'));
  assert.ok(plist.includes('<key>KeepAlive</key>'));
  assert.ok(launchdPlist({ ...o, library: '/a&b' }).includes('/a&amp;b'), 'XML échappé');
});

test('install plan targets the user session on both platforms and refuses others', () => {
  const o = { execPath: '/usr/bin/node', args: ['/opt/arche/dist/cli.js', 'serve'], library: '/srv/lib' };
  const lin = serviceInstallPlan('linux', '/home/f', o)!;
  assert.equal(lin.file, '/home/f/.config/systemd/user/arche.service');
  assert.deepEqual(lin.enable, ['systemctl', '--user', 'enable', '--now', 'arche']);
  const mac = serviceInstallPlan('darwin', '/Users/f', o)!;
  assert.equal(mac.file, '/Users/f/Library/LaunchAgents/org.arche.serve.plist');
  assert.equal(mac.enable[0], 'launchctl');
  assert.equal(serviceInstallPlan('win32', 'C:\\Users\\f', o), null);
});

// --- Règle ADR 0008 ------------------------------------------------------------------------------

const base = (over: Partial<Resource>): Resource => ({
  id: 'x', type: 'software', category: 'dev', name: { fr: 'x', en: 'x' }, description: { fr: 'x', en: 'x' },
  languages: ['mul'], profiles: ['bunker'], priority: 'optional', source: { kind: 'manual' }, license: { spdx: 'MIT' }, status: 'active', ...over,
});

test('runtime is mandatory for software and toolchains only', () => {
  assert.equal(runtimeIssues(base({})).length, 1);
  assert.equal(runtimeIssues(base({ runtime: 'static-binary' })).length, 0);
  assert.equal(runtimeIssues(base({ type: 'zim' })).length, 0, 'un ZIM n’a pas de runtime');
});

test('a container runtime can be neither recommended nor essential nor novice', () => {
  const ok = base({ runtime: 'container', requires: { tools: ['docker'] } });
  assert.deepEqual(runtimeIssues(ok), []);
  assert.ok(runtimeIssues({ ...ok, priority: 'recommended' }).some(m => m.includes('recommended')));
  assert.ok(runtimeIssues({ ...ok, priority: 'essential' }).some(m => m.includes('essential')));
  assert.ok(runtimeIssues({ ...ok, profiles: ['bunker', 'novice'] }).some(m => m.includes('novice')));
  assert.ok(runtimeIssues(base({ runtime: 'container' })).some(m => m.includes('requires.tools')), 'doit dire quel moteur il exige');
});

// --- Le superviseur, pour de vrai --------------------------------------------------------------

test('supervisor restarts a dying service with backoff and stops cleanly', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arche-sup-'));
  try {
    // Un service qui écrit puis meurt aussitôt : le superviseur doit le relancer.
    const script = path.join(dir, 'flaky.sh');
    writeFileSync(script, '#!/bin/sh\necho "hello from flaky"\nexit 3\n'); chmodSync(script, 0o755);
    const sup = new Supervisor({ logDir: path.join(dir, 'logs'), baseDelayMs: 30, maxDelayMs: 100, maxRestarts: 3 });
    sup.start([{ name: 'flaky', bin: script, args: [] }]);
    await new Promise(r => setTimeout(r, 900));
    const st = sup.status().find(s => s.name === 'flaky')!;
    assert.ok(st.restarts >= 2, `attendu au moins 2 relances, obtenu ${st.restarts}`);
    assert.ok(['restarting', 'failed', 'running'].includes(st.state));
    assert.equal(st.lastExit?.code, 3);
    await sup.stop(500);
    const log = readFileSync(sup.logFile, 'utf8');
    assert.ok(log.includes('[flaky] hello from flaky'), 'la sortie du service est dans le journal unique');
    assert.ok(log.includes('relance n°1'));
    assert.ok(log.includes('arrêt propre'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('supervisor gives up after maxRestarts and says so in the log', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arche-sup-'));
  try {
    const script = path.join(dir, 'dead.sh');
    writeFileSync(script, '#!/bin/sh\nexit 1\n'); chmodSync(script, 0o755);
    const sup = new Supervisor({ logDir: path.join(dir, 'logs'), baseDelayMs: 10, maxDelayMs: 20, maxRestarts: 2 });
    sup.start([{ name: 'dead', bin: script, args: [] }]);
    await new Promise(r => setTimeout(r, 600));
    assert.equal(sup.status()[0]!.state, 'failed');
    await sup.stop(200);
    assert.ok(readFileSync(sup.logFile, 'utf8').includes("on n'insiste plus"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('supervisor reports a missing binary instead of crashing', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arche-sup-'));
  try {
    const sup = new Supervisor({ logDir: path.join(dir, 'logs') });
    sup.start([{ name: 'ghost', bin: path.join(dir, 'nope'), args: [] }]);
    assert.equal(sup.status()[0]!.state, 'failed');
    await sup.stop(100);
    assert.ok(existsSync(sup.logFile));
    assert.ok(readFileSync(sup.logFile, 'utf8').includes('binaire introuvable'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
