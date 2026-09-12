import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { placeModel, estimateStep, estimatePipeline, formatDuration, modelShapeFromTags, computeFigures } from '../src/core/compute.js';
import { createJob, runJob, readJob, listJobs, cancelJob, runPending } from '../src/core/jobs.js';
import { loadCatalog } from '../src/core/catalog.js';
import { plan, isSlowOnThisMachine } from '../src/core/recommend.js';
import type { Hardware } from '../src/core/types.js';
import { validateInventory, inventoryFields } from '../src/core/project/inventory.js';
import { loadRecipes, validateRecipe, missingInventory } from '../src/core/project/recipes.js';

const q4 = (id: string, total_b: number, active_b?: number) => ({ id, size_gb: total_b * 0.58, total_b, ...(active_b ? { active_b } : {}) });

test('placement: VRAM when it fits, RAM otherwise, disk when it overflows — never impossible', () => {
  const m27 = q4('27b', 27);
  assert.equal(placeModel(m27, { ram_gb: 8, vram_gb: 24 }).placement, 'vram');
  assert.equal(placeModel(m27, { ram_gb: 32, vram_gb: 0 }).placement, 'ram');
  const disk = placeModel(m27, { ram_gb: 8, vram_gb: 0, disk_kind: 'nvme' });
  assert.equal(disk.placement, 'disk');
  assert.ok(disk.bandwidth_gbs < 3, 'lu depuis le disque : quelques Go/s au mieux');
  const moe = placeModel(q4('35b-a3b', 35, 3), { ram_gb: 32, vram_gb: 0 });
  assert.equal(moe.placement, 'ram');
  assert.ok(moe.active_gb < 2.5, 'seuls les poids actifs se relisent à chaque token');
});

test('the estimator lands within ×3 of the public reference points', () => {
  const within = (got: number, lo: number, hi: number) => got >= lo / 3 && got <= hi * 3;
  const e4 = estimateStep({ model: q4('qwen3.5:4b', 4), prompt_tokens: 100, output_tokens: 100 }, { ram_gb: 8, vram_gb: 0, cpu_cores: 4 });
  assert.ok(within(e4.tok_s, 6, 12), `4b sur 8 Go : ${e4.tok_s} tok/s`);
  const eMoe = estimateStep({ model: q4('qwen3.5:35b-a3b', 35, 3), prompt_tokens: 100, output_tokens: 100 }, { ram_gb: 32, vram_gb: 0, ram_kind: 'ddr5_dual' });
  assert.ok(within(eMoe.tok_s, 10, 20), `MoE sur 32 Go : ${eMoe.tok_s} tok/s`);
  const eGpu = estimateStep({ model: q4('qwen3.6:27b', 27), prompt_tokens: 100, output_tokens: 100 }, { ram_gb: 32, vram_gb: 24, vram_kind: 'high_end' });
  assert.ok(within(eGpu.tok_s, 30, 45), `27b sur 4090 : ${eGpu.tok_s} tok/s`);
  const eDisk = estimateStep({ model: q4('qwen3.6:27b', 27), prompt_tokens: 100, output_tokens: 100 }, { ram_gb: 8, vram_gb: 0, disk_kind: 'nvme' });
  assert.ok(within(eDisk.tok_s, 0.05, 0.2), `27b depuis NVMe : ${eDisk.tok_s} tok/s`);
  assert.ok(eDisk.advice.some(a => /déborde/.test(a)));
  assert.ok(eDisk.total_s > 0 && Number.isFinite(eDisk.total_s), 'jamais « impossible » : toujours un temps');
});

test('a four-model workflow on 8 GB takes an hour, not "no": reloads are counted and grouping is advised', () => {
  const hw = { ram_gb: 8, vram_gb: 0, cpu_cores: 4, disk_kind: 'sata_ssd' as const };
  const a = q4('a:4b', 4); const b = q4('b:9b', 9); const c = q4('c:4b-embed', 0.6); const d = q4('d:27b', 27);
  const steps = [a, b, c, d].map((m, i) => ({ model: m, prompt_tokens: 1500, output_tokens: 300, label: `étape ${i + 1}` }));
  const p = estimatePipeline(steps, hw, 'fr');
  assert.equal(p.swaps, 3);
  assert.ok(p.total_s > 1800, `${p.total_s} s : plus d’une demi-heure attendue`);
  assert.ok(p.advice.some(x => /file/.test(x)), 'conseille la file de tâches');
  assert.equal(p.steps[0]!.swapped, false);
  assert.equal(p.steps[1]!.swapped, true);
  // Le même modèle deux fois de suite ne recharge pas.
  const twice = estimatePipeline([{ model: a, prompt_tokens: 100, output_tokens: 10 }, { model: a, prompt_tokens: 100, output_tokens: 10 }], hw);
  assert.equal(twice.swaps, 0);
  assert.equal(twice.steps[1]!.load_s, 0);
  assert.ok(/≈ .* au total/.test(p.human));
  assert.equal(formatDuration(45), '45 s'); assert.equal(formatDuration(600), '10 min'); assert.equal(formatDuration(3600 * 1.5), '1 h 30');
  assert.ok(computeFigures().uncertainty.includes('×3'));
  // L'énergie : le même 27B coûte plus de Wh sur un portable lent (depuis le disque) que sur une tour avec GPU.
  const slow = estimatePipeline([{ model: d, prompt_tokens: 2000, output_tokens: 500 }], { ram_gb: 8, vram_gb: 0, cpu_cores: 4, disk_kind: 'nvme', machine_kind: 'laptop_cpu' });
  const fast = estimatePipeline([{ model: d, prompt_tokens: 2000, output_tokens: 500 }], { ram_gb: 32, vram_gb: 24, machine_kind: 'desktop_gpu_high_end' });
  assert.ok(slow.total_wh > fast.total_wh, `${slow.total_wh} Wh vs ${fast.total_wh} Wh`);
  assert.ok(slow.advice.some(x => /Wh/.test(x)), 'conseil énergie au-delà de 50 Wh');
  assert.ok(/Wh/.test(slow.human));
});

test('model shapes come from catalogue ids and tags (MoE active params)', () => {
  const m = modelShapeFromTags('ollama-qwen3-5-35b-a3b', 21, ['moe']);
  assert.deepEqual({ t: m.total_b, a: m.active_b }, { t: 35, a: 3 });
  const dense = modelShapeFromTags('ollama-qwen3-6-27b', 18, []);
  assert.equal(dense.total_b, 27); assert.equal(dense.active_b, undefined);
  const tagged = modelShapeFromTags('x', 10, ['params:16b', 'active:2.5b']);
  assert.deepEqual({ t: tagged.total_b, a: tagged.active_b }, { t: 16, a: 2.5 });
});

test('the planner never hard-filters a model for lack of RAM: included explicitly, it is marked slow', () => {
  const catalog = loadCatalog({ strict: true });
  const hw: Hardware = { os: 'linux', arch: 'x64', ram_gb: 8, vram_gb: 0, disk_free_gb: 2000, tools: {}, online: true };
  const p = plan(catalog, hw, { profile: 'bunker', bundles: ['ai'], include: ['ollama-qwen3-6-27b'] });
  const big = p.items.find(i => i.resource.id === 'ollama-qwen3-6-27b');
  assert.ok(big && big.selected, 'le 27B est proposé malgré 8 Go : lent, pas interdit');
  assert.equal(big!.reason, 'reason.explicit_slow');
  assert.ok(isSlowOnThisMachine(catalog.byId.get('ollama-qwen3-6-27b')!, hw));
  assert.ok(!isSlowOnThisMachine(catalog.byId.get('ollama-qwen3-5-4b')!, hw));
  // Un logiciel qui exige de la RAM reste filtré : lui ne « ralentit » pas, il plante.
  const odm = plan(catalog, hw, { profile: 'bunker', include: ['opendronemap'] }).items.find(i => i.resource.id === 'opendronemap');
  assert.equal(odm, undefined, 'ODM exige 16 Go : filtré sur 8 Go');
});

test('the job queue persists every step and resumes after a simulated crash', async () => {
  const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'arche-jobs-'));
  const job = createJob(lib, 'relevé drone', [
    { id: 'photos', kind: 'count', input: { n: 3 } },
    { id: 'odm', kind: 'crash_once', input: {} },
    { id: 'volumes', kind: 'count', input: { n: 2 } },
  ], { estimate_s: 5400, max_attempts: 3 });
  assert.equal(readJob(lib, job.id)!.status, 'pending');
  let crashed = false;
  const handlers = {
    count: async (input: unknown, ctx: { previous: unknown }) => ({ n: (input as { n: number }).n, prev: ctx.previous ?? null }),
    crash_once: async () => { if (!crashed) { crashed = true; throw new Error('coupure de courant simulée'); } return 'ok'; },
  };
  // Première exécution : l'étape 2 échoue une fois ; on ne dort pas dans les tests.
  const r1 = await runJob(lib, job.id, handlers, { sleep: async () => {}, owner: 'run-1' });
  assert.equal(r1.status, 'done', 'après une tentative ratée, la reprise avec attente réussit');
  assert.equal(r1.steps[1]!.attempts, 2);
  assert.deepEqual(r1.steps[2]!.output, { n: 2, prev: 'ok' }, 'l’étape suivante reçoit la sortie de la précédente');
  assert.equal(r1.lock, undefined);

  // Simulation d'un crash : un fichier laissé en `running` au milieu, verrou d'un exécuteur mort.
  const j2 = createJob(lib, 'workflow 4 modèles', [{ kind: 'count', input: { n: 1 } }, { kind: 'count', input: { n: 2 } }, { kind: 'count', input: { n: 3 } }]);
  const f = path.join(lib, '.arche', 'jobs', `${j2.id}.json`);
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  raw.status = 'running'; raw.cursor = 1; raw.steps[0].status = 'done'; raw.steps[0].output = { n: 1 };
  raw.lock = { owner: 'dead-process', since: '2026-09-11T00:00:00.000Z' }; raw.updated_at = '2026-09-11T00:00:00.000Z';
  fs.writeFileSync(f, JSON.stringify(raw));
  let ran: string[] = [];
  const resumed = await runJob(lib, j2.id, { count: async (input) => { ran.push(String((input as { n: number }).n)); return input; } }, { staleMs: 1000, owner: 'run-2' });
  assert.equal(resumed.status, 'done');
  assert.deepEqual(ran, ['2', '3'], 'reprise à l’étape 2 : la 1 n’est pas rejouée');

  // Verrou vivant : refusé ; verrou périmé : repris. Annulation : respectée.
  const j3 = createJob(lib, 'verrou', [{ kind: 'count', input: { n: 1 } }]);
  const raw3 = JSON.parse(fs.readFileSync(path.join(lib, '.arche', 'jobs', `${j3.id}.json`), 'utf8'));
  raw3.status = 'running'; raw3.lock = { owner: 'alive', since: new Date().toISOString() };
  fs.writeFileSync(path.join(lib, '.arche', 'jobs', `${j3.id}.json`), JSON.stringify(raw3));
  await assert.rejects(() => runJob(lib, j3.id, handlers, { owner: 'other' }), /tenue par alive/);
  cancelJob(lib, j3.id);
  assert.equal(readJob(lib, j3.id)!.status, 'cancelled');
  assert.equal((await runJob(lib, j3.id, handlers, { owner: 'other' })).status, 'cancelled');

  // Échec définitif après max_attempts : la tâche garde ce qui est fait.
  const j4 = createJob(lib, 'échec', [{ kind: 'count', input: { n: 1 } }, { kind: 'boom', input: {} }], { max_attempts: 2 });
  const failed = await runJob(lib, j4.id, { ...handlers, boom: async () => { throw new Error('outil absent'); } }, { sleep: async () => {} });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.cursor, 1, 'l’étape 1 reste faite');
  assert.match(failed.error ?? '', /outil absent/);
  assert.equal(listJobs(lib).length, 4);
  const pend = await runPending(lib, handlers, { sleep: async () => {} });
  assert.equal(pend.length, 0, 'plus rien en attente');
  fs.rmSync(lib, { recursive: true, force: true });
});

test('field datasets enter the inventory and the automated-farm recipe knows what it needs', () => {
  const inv = { plots: [{ id: 'A', area_m2: 5000 }], datasets: [
    { id: 'ortho-2026', kind: 'orthomosaic', path: '/data/ortho.tif', crs: 'EPSG:2154', resolution: 3, date: '2026-06-12', source: 'drone + ODM' },
    { id: 'lidar', kind: 'pointcloud', path: '/data/parcelle.laz', crs: 'EPSG:2154' },
    { id: 'serre', kind: 'camera', path: 'rtsp://192.168.1.20/stream' },
  ] };
  assert.deepEqual(validateInventory(inv), []);
  const bad = validateInventory({ datasets: [{ id: 'x', kind: 'hologram', path: '' }, { id: 'x', kind: 'dsm', path: '/a', crs: 'Lambert93' }] });
  assert.ok(bad.some(e => e.includes('kind')) && bad.some(e => e.includes('path manquant')) && bad.some(e => e.includes('EPSG')) && bad.some(e => e.includes('en double')));
  const fields = inventoryFields(inv as never);
  assert.ok(fields.has('datasets') && fields.has('datasets.orthomosaic') && fields.has('datasets.camera'));
  const cat = loadCatalog({ strict: true });
  const r = loadRecipes().find(x => x.id === 'exploitation-automatisee')!;
  assert.deepEqual(validateRecipe(r, new Set(cat.byId.keys())), []);
  const m = missingInventory(r, inv as never);
  assert.deepEqual(m.required, []);
  assert.ok(m.recommended.includes('datasets.sensor_log') && !m.recommended.includes('datasets.orthomosaic'));
  assert.ok(r.never.some(n => /jamais on ne bride|never cap/i.test(n.fr + n.en)));
  for (const id of ['opendronemap', 'pdal', 'cloudcompare', 'qgis', 'mosquitto', 'node-red', 'hermes-agent']) assert.ok(cat.byId.has(id), id);
  assert.equal(cat.byId.get('frigate')!.runtime, 'container');
  assert.equal(cat.byId.get('frigate')!.priority, 'optional');
});
