// `arche plan` : calcule et affiche la sélection sans rien télécharger.
import { loadCatalog } from '../core/catalog.js';
import { detectHardware } from '../core/hardware.js';
import { plan } from '../core/recommend.js';
import { loadConfig, toPlanOptions } from '../core/config.js';
import { libraryDir } from '../core/paths.js';
import { t, reason, pick } from '../core/i18n.js';
import { gb } from '../core/format.js';
import type { Plan, PlanOptions } from '../core/types.js';

export interface PlanCliOpts { config?: string; library?: string; profile?: string; bundles?: string; include?: string; exclude?: string; budget?: string; json?: boolean; offline?: boolean }

export async function buildPlan(o: PlanCliOpts): Promise<{ p: Plan; lib: string }> {
  const cfg = loadConfig(o.config);
  const lib = libraryDir(o.library ?? cfg.library);
  const catalog = loadCatalog({ strict: true });
  const hw = await detectHardware(lib, { skipOnlineCheck: o.offline });
  const opts: PlanOptions = toPlanOptions(cfg);
  if (o.profile) opts.profile = o.profile as PlanOptions['profile'];
  if (o.bundles) opts.bundles = o.bundles.split(',').map(s => s.trim()).filter(Boolean);
  if (o.include) opts.include = [...(opts.include ?? []), ...o.include.split(',')];
  if (o.exclude) opts.exclude = [...(opts.exclude ?? []), ...o.exclude.split(',')];
  if (o.budget) opts.diskBudgetGb = Number(o.budget);
  return { p: plan(catalog, hw, opts), lib };
}

export function printPlan(p: Plan) {
  const sel = p.items.filter(i => i.selected);
  console.log(t('wizard.summary', { count: sel.length, size: p.totalSelectedGb.toFixed(1), budget: p.budgetGb.toFixed(0) }));
  console.log('');
  let cat = '';
  for (const it of sel) {
    if (it.resource.category !== cat) { cat = it.resource.category; console.log(`## ${cat}`); }
    console.log(`  [x] ${it.resource.id.padEnd(32)} ${gb(it.sizeGb).padStart(9)}  ${pick(it.resource.name)} — ${reason(it.reason)}`);
  }
  const rest = p.items.filter(i => !i.selected);
  if (rest.length) {
    console.log(`\n## ${t('reason.unselected')} (${rest.length})`);
    for (const it of rest) console.log(`  [ ] ${it.resource.id.padEnd(32)} ${gb(it.sizeGb).padStart(9)}  ${pick(it.resource.name)} — ${reason(it.reason)}`);
  }
  if (p.warnings.length) { console.log(''); for (const w of p.warnings) { const [k, a] = w.split(':'); console.log('! ' + t(`warn.${k}`, { arg: a ?? '' })); } }
}

export async function planCommand(o: PlanCliOpts) {
  const { p } = await buildPlan(o);
  if (o.json) { console.log(JSON.stringify({ ...p, items: p.items.map(i => ({ id: i.resource.id, selected: i.selected, sizeGb: i.sizeGb, reason: i.reason })) }, null, 2)); return; }
  printPlan(p);
}
