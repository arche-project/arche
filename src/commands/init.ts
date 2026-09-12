// `arche init` : le wizard interactif (parcours néophyte). Aucune notion technique n'est exposée.
// Interactive wizard (beginner path). No technical concept is exposed.
import path from 'node:path';
import { select, checkbox, input, confirm, closePrompts } from '../core/prompts.js';
import { loadCatalog } from '../core/catalog.js';
import { detectHardware } from '../core/hardware.js';
import { plan } from '../core/recommend.js';
import { t, pick, getLang } from '../core/i18n.js';
import { libraryDir } from '../core/paths.js';
import { printPlan } from './plan.js';
import { downloadCommand } from './download.js';
import type { ProfileId } from '../core/types.js';

export async function initCommand(o: { library?: string }) {
  const catalog = loadCatalog({ strict: true });
  console.log('\n' + t('wizard.welcome') + '\n');

  const profile = await select<ProfileId>({
    message: t('wizard.q.profile'),
    choices: catalog.profiles.map(p => ({ value: p.id, name: pick(p.name), description: pick(p.tagline) })),
    default: 'novice',
  });

  const preset = await select({
    message: t('wizard.q.target'),
    choices: [...catalog.hardware_presets.map(h => ({ value: h.id, name: pick(h.name), description: pick(h.description) })), { value: 'detect', name: getLang() === 'fr' ? 'Cet ordinateur (détection automatique)' : 'This computer (auto-detect)' }],
    default: 'detect',
  });

  const langs = await checkbox({
    message: t('wizard.q.langs'),
    choices: [{ value: 'fr', name: 'Français', checked: true }, { value: 'en', name: 'English', checked: true }, { value: 'es', name: 'Español' }, { value: 'de', name: 'Deutsch' }, { value: 'ja', name: '日本語' }],
  });

  const libInput = await input({ message: t('wizard.q.library'), default: o.library ?? libraryDir() });
  const lib = path.resolve(libInput);

  const hw = await detectHardware(lib);
  if (preset !== 'detect') {
    const h = catalog.hardware_presets.find(p => p.id === preset)!;
    Object.assign(hw, { ram_gb: h.assumed.ram_gb ?? hw.ram_gb, vram_gb: h.assumed.vram_gb ?? hw.vram_gb, disk_free_gb: Math.min(hw.disk_free_gb || Infinity, h.assumed.disk_gb ?? hw.disk_free_gb) });
    if (h.assumed.arch) hw.arch = h.assumed.arch as never;
    if (h.assumed.os) hw.os = h.assumed.os as never;
  }
  console.log(t('wizard.detected', { os: hw.os, arch: hw.arch, ram: hw.ram_gb, vram: hw.vram_gb, disk: hw.disk_free_gb.toFixed(0) }));

  const visibleBundles = catalog.bundles.filter(b => profile === 'bunker' || !['dev', 'robotics-lab', 'everything-big'].includes(b.id));
  const bundles = await checkbox({
    message: t('wizard.q.bundles'),
    choices: visibleBundles.map(b => ({ value: b.id, name: pick(b.name), description: pick(b.description), checked: b.id === 'core' || (profile === 'novice' && ['health', 'homestead', 'ai'].includes(b.id)) })),
  });

  const p = plan(catalog, hw, { profile, languages: langs.length ? langs : ['fr', 'en'], bundles });
  console.log('');
  printPlan(p);

  if (!hw.online) { console.log('\n' + t('warn.offline')); closePrompts(); return; }
  const go = await confirm({ message: t('wizard.q.confirm'), default: true });
  closePrompts();
  if (go) await downloadCommand({ library: lib, yes: true }, { p, lib });
}
