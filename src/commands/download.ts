// `arche download` : exécute le plan (ou une liste d'ids). Reprise automatique, résumé final.
import { loadCatalog } from '../core/catalog.js';
import { install } from '../core/downloader.js';
import { loadState, saveState } from '../core/state.js';
import { t, pick } from '../core/i18n.js';
import { pct, gb } from '../core/format.js';
import { buildPlan, printPlan, type PlanCliOpts } from './plan.js';
import type { Resource, Plan } from '../core/types.js';

export interface DownloadOpts extends PlanCliOpts { yes?: boolean; only?: string; parallel?: string }

export async function downloadCommand(o: DownloadOpts, prebuilt?: { p: Plan; lib: string }) {
  const catalog = loadCatalog({ strict: true });
  const { p, lib } = prebuilt ?? await buildPlan(o);
  let targets: Resource[];
  if (o.only) targets = o.only.split(',').map(id => catalog.byId.get(id.trim())).filter((r): r is Resource => !!r);
  else { if (!prebuilt) printPlan(p); targets = p.items.filter(i => i.selected).map(i => i.resource); }

  if (!o.yes) {
    const { confirm, closePrompts } = await import('../core/prompts.js');
    const ok = await confirm({ message: t('wizard.q.confirm'), default: true });
    closePrompts();
    if (!ok) return;
  }

  const state = loadState(lib);
  state.profile = p.profile;
  state.last_plan = { at: new Date().toISOString(), selected: targets.map(r => r.id) };
  saveState(lib, state);

  // ordre : logiciels d'abord (kiwix, ollama), puis petits fichiers, puis gros — on a vite quelque chose d'utilisable.
  const order = (r: Resource) => (r.type === 'software' ? 0 : 1) * 1e6 + (r.size_bytes ?? (r.size_estimate_gb ?? 0) * 1e9) / 1e9;
  targets.sort((a, b) => order(a) - order(b));

  const parallel = Math.max(1, Number(o.parallel ?? 2));
  const summary = { done: [] as string[], skipped: [] as string[], manual: [] as string[], failed: [] as string[] };
  let lastLine = '';
  const log = (id: string, s: string) => { const line = `${id}: ${s}`; if (line !== lastLine) { process.stdout.write(`\r${line.padEnd(100)}`); lastLine = line; } };

  const queue = [...targets];
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const name = pick(r.name);
      try {
        await install(r, lib, ev => {
          switch (ev.phase) {
            case 'resolve': log(r!.id, '…'); break;
            case 'download': log(r!.id, ev.done != null ? `${pct(ev.done, ev.total)} ${ev.total ? gb(ev.total / 1e9) : ''}` : (ev.message ?? '')); break;
            case 'verify': log(r!.id, `sha ${ev.done != null ? pct(ev.done, ev.total) : ''}`); break;
            case 'done': console.log(`\n${t('dl.done', { name })}`); summary.done.push(r!.id); break;
            case 'skip': console.log(`\n${t('dl.skip', { name })}`); summary.skipped.push(r!.id); break;
            case 'manual': console.log(`\n${t('dl.manual', { name, url: ev.message ?? '' })}`); summary.manual.push(r!.id); break;
            case 'error': console.log(`\n${t('dl.error', { name, err: ev.message ?? '' })}`); break;
          }
        });
      } catch { summary.failed.push(r.id); }
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));

  console.log(`\n\nOK ${summary.done.length} · skip ${summary.skipped.length} · manual ${summary.manual.length} · failed ${summary.failed.length}`);
  if (summary.failed.length) { console.log('  failed: ' + summary.failed.join(', ')); process.exitCode = 1; }
  if (summary.manual.length) console.log('  manual: ' + summary.manual.join(', ') + '  → docs/fr/guide-expert.md');
  console.log('\n' + t('wizard.done'));
}
