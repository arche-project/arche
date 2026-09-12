import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../src/core/catalog.js';
import { plan, pickAiTier } from '../src/core/recommend.js';
import type { Hardware } from '../src/core/types.js';

const catalog = loadCatalog({ strict: true });
const hw = (over: Partial<Hardware> = {}): Hardware => ({ os: 'linux', arch: 'x64', ram_gb: 16, vram_gb: 0, disk_free_gb: 1000, tools: {}, online: true, ...over });

test('catalog is valid and non-trivial', () => {
  assert.equal(catalog.issues.length, 0);
  assert.ok(catalog.resources.length > 50);
  assert.ok(catalog.bundles.some(b => b.id === 'core'));
});

test('ai tier follows RAM then VRAM', () => {
  assert.equal(pickAiTier(catalog, hw({ ram_gb: 4 })), 'tiny');
  assert.equal(pickAiTier(catalog, hw({ ram_gb: 8 })), 'small');
  assert.equal(pickAiTier(catalog, hw({ ram_gb: 16 })), 'medium');
  assert.equal(pickAiTier(catalog, hw({ ram_gb: 16, vram_gb: 24 })), 'xlarge');
  assert.equal(pickAiTier(catalog, hw({ ram_gb: 2 })), null);
});

test('essentials are always selected, even over budget', () => {
  const p = plan(catalog, hw({ disk_free_gb: 5 }), { profile: 'novice', languages: ['fr'] });
  const ids = p.items.filter(i => i.selected).map(i => i.resource.id);
  assert.ok(ids.includes('wikipedia-fr-nopic'));
  assert.ok(ids.includes('kiwix-tools'), 'dependency kiwix-tools pulled in');
  assert.ok(p.warnings.some(w => w.startsWith('over_budget')));
});

test('nopic is upgraded to maxi when there is room, never both', () => {
  const big = plan(catalog, hw(), { profile: 'novice', languages: ['fr'], diskBudgetGb: 400 });
  const sel = new Set(big.items.filter(i => i.selected).map(i => i.resource.id));
  assert.ok(sel.has('wikipedia-fr-maxi')); assert.ok(!sel.has('wikipedia-fr-nopic'));
  const small = plan(catalog, hw(), { profile: 'novice', languages: ['fr'], diskBudgetGb: 60 });
  const sel2 = new Set(small.items.filter(i => i.selected).map(i => i.resource.id));
  assert.ok(sel2.has('wikipedia-fr-nopic')); assert.ok(!sel2.has('wikipedia-fr-maxi'));
});

test('lowtech profile hides AI and git, keeps printables', () => {
  const p = plan(catalog, hw(), { profile: 'lowtech', languages: ['fr'] });
  assert.ok(!p.items.some(i => i.resource.type === 'ai-model'));
  assert.ok(p.items.some(i => i.resource.id === 'pdf-ou-il-ny-a-pas-de-docteur' && i.selected));
});

test('missing resources never appear', () => {
  const p = plan(catalog, hw(), { profile: 'bunker' });
  assert.ok(!p.items.some(i => i.resource.status === 'missing'));
});

test('exclude wins over everything', () => {
  const p = plan(catalog, hw(), { profile: 'novice', exclude: ['wikipedia-fr-nopic', 'wikipedia-fr-maxi'] });
  assert.ok(!p.items.some(i => i.selected && ['wikipedia-fr-nopic', 'wikipedia-fr-maxi'].includes(i.resource.id)));
});

test('only the detected AI tier models are proposed', () => {
  const p = plan(catalog, hw({ ram_gb: 8 }), { profile: 'bunker', bundles: ['ai'] });
  const models = p.items.filter(i => i.resource.type === 'ai-model').map(i => i.resource.id);
  assert.ok(models.includes('ollama-qwen3-5-4b'), 'le palier small propose Qwen3.5 4B (multimodal) depuis 2026-09');
  assert.ok(!models.includes('ollama-qwen3-32b'));
});
