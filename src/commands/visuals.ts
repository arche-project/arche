// `arche visuals coverage|validate` : la somme « monstrueuse » de visuels, ramenée à un chiffre et à des règles.
// The "monstrous" pile of visuals, reduced to a number and to rules.
import { loadManifests, loadViews, manifestIssues, coverageOf, summarize } from '../core/visuals.js';
import { t } from '../core/i18n.js';

export function visualsValidate() {
  const tax = loadViews();
  let n = 0;
  for (const { file, manifest } of loadManifests()) {
    for (const m of manifestIssues(manifest, tax)) { console.error(`  ${file}: ${m}`); n++; }
  }
  if (n) { console.error(t('visuals.invalid', { n })); process.exitCode = 1; } else console.log(t('visuals.valid'));
}

export function visualsCoverage(o: { json?: boolean; min?: string }) {
  const tax = loadViews();
  const covs = loadManifests().map(({ manifest }) => coverageOf(manifest, tax));
  const s = summarize(covs);
  if (o.json) { console.log(JSON.stringify({ ...s, concepts_detail: covs }, null, 2)); }
  else {
    console.log(t('visuals.coverage', { pct: s.pct, covered: s.covered, required: s.required, concepts: s.concepts }));
    for (const [k, v] of Object.entries(s.byKind)) console.log(`  ${k.padEnd(14)} ${String(v.concepts).padStart(4)} concept(s)  ${String(v.covered).padStart(4)} / ${v.required}`);
    for (const c of covs) {
      if (!c.missing.length && !c.pendingOnly.length) continue;
      console.log(`  ${c.id.padEnd(30)} ${c.requiredCovered}/${c.requiredTotal}` +
        (c.missing.length ? `  ∅ ${c.missing.join(', ')}` : '') +
        (c.pendingOnly.length ? `  ⏳ ${c.pendingOnly.join(', ')}` : ''));
    }
  }
  const min = o.min !== undefined ? Number(o.min) : undefined;
  if (min !== undefined && s.pct < min) { console.error(t('visuals.below', { pct: s.pct, min })); process.exitCode = 1; }
}
