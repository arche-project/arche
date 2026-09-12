// `arche catalog validate|list|show|index|freshness` et `arche knowledge verify`
import { loadCatalog } from '../core/catalog.js';
import { t, pick, getLang } from '../core/i18n.js';
import { gb } from '../core/format.js';
import { sizeGbOf } from '../core/types.js';
import { freshness } from '../core/versions.js';
import { scanKnowledge, verifyKnowledge, renderKnowledge, knowledgeSummary } from '../core/knowledge.js';
import { writeEvalDoc } from '../core/rag/eval.js';
import { loadConfig } from '../core/config.js';
import { libraryDir } from '../core/paths.js';

/** Le catalogue, puis knowledge/ (M4-1 : chaque valeur a un locator ou une grâce explicite) — sans ouvrir de shard. */
export function catalogValidate() {
  const c = loadCatalog({ strict: false }), k = scanKnowledge({ catalogIds: new Set(c.byId.keys()) });
  const issues = [...c.issues, ...k.issues.map(i => ({ file: `knowledge/${i.file}`, message: `${i.path}: ${i.message}` }))];
  if (issues.length) { console.error(t('cat.invalid', { n: issues.length })); for (const i of issues) console.error(`  ${i.file}: ${i.message}`); process.exitCode = 1; return; }
  console.log(t('cat.valid', { n: c.resources.length, b: c.bundles.length }) + ` ${knowledgeSummary(k, getLang() === 'fr').replace(/\*\*/g, '')}`);
}

/**
 * `arche knowledge verify` — calcule `verified` : ouvre les shards installés, cherche l'article et la
 * citation de chaque `source`. Code 1 si une valeur n'a pas de provenance ou si une citation ne résout
 * pas dans un shard installé ; un shard absent n'est pas un échec (il est compté). `--write README.md`
 * réécrit le bloc `<!-- knowledge -->` (N valeurs sourcées / total).
 */
export function knowledgeVerify(o: { library?: string; config?: string; json?: boolean; write?: string }) {
  const fr = getLang() === 'fr', c = loadCatalog({ strict: false });
  const r = verifyKnowledge(libraryDir(o.library ?? loadConfig(o.config).library), scanKnowledge({ catalogIds: new Set(c.byId.keys()) }));
  console.log(o.json ? JSON.stringify(r, null, 2) : renderKnowledge(r, fr));
  if (o.write) { writeEvalDoc(o.write, knowledgeSummary(r), 'knowledge'); console.error(`${o.write} : ${fr ? 'bloc réécrit' : 'block rewritten'}`); }
  if (r.issues.length || r.failed) process.exitCode = 1;
}

export function catalogList(o: { type?: string; category?: string; profile?: string; json?: boolean }) {
  const c = loadCatalog({ strict: true });
  let rs = c.resources;
  if (o.type) rs = rs.filter(r => r.type === o.type);
  if (o.category) rs = rs.filter(r => r.category === o.category);
  if (o.profile) rs = rs.filter(r => r.profiles.includes(o.profile as never));
  if (o.json) { console.log(JSON.stringify(rs, null, 2)); return; }
  for (const r of rs) console.log(`${r.id.padEnd(34)} ${r.type.padEnd(11)} ${r.category.padEnd(13)} ${gb(sizeGbOf(r)).padStart(9)}  ${r.priority.padEnd(11)} ${r.status.padEnd(10)} ${pick(r.name)}`);
  console.log(`\n${rs.length} resources, ${gb(rs.reduce((s, r) => s + sizeGbOf(r), 0))} total`);
}

export function catalogShow(id: string) {
  const c = loadCatalog({ strict: true });
  const r = c.byId.get(id);
  if (!r) { console.error(`unknown id ${id}`); process.exitCode = 1; return; }
  console.log(JSON.stringify(r, null, 2));
}

/** Index JSON plat, consommé par l'UI web et publiable (GitHub Pages) pour les outils tiers. */
export function catalogIndex() {
  const c = loadCatalog({ strict: true });
  console.log(JSON.stringify({ generatedAt: c.generatedAt, resources: c.resources, profiles: c.profiles, hardware_presets: c.hardware_presets, ai_tiers: c.ai_tiers, bundles: c.bundles }, null, 2));
}

/**
 * `arche catalog freshness` — mesure ce qui, sinon, reste une intention : « le catalogue est
 * souvent mis à jour ». Pour chaque ressource dotée d'un tracker, on compare la date de dernière
 * vérification (`checked`) à son intervalle (`check_interval_days`, 7 par défaut). Le score est la
 * part de ressources vérifiées à temps. `--min <pct>` fait échouer la commande sous le seuil : c'est
 * ce que la CI appelle, pour qu'une chaîne de mise à jour cassée ne reste pas silencieuse.
 *
 * Measures catalog freshness; `--min` turns it into a CI gate.
 */
export function catalogFreshness(o: { json?: boolean; min?: string; stale?: boolean }) {
  const c = loadCatalog({ strict: true });
  const now = new Date();
  const rows = c.resources.map(r => {
    const interval = r.update?.check_interval_days ?? 7;
    const f = freshness(r.checked, interval, r.update?.tracker, now);
    return { id: r.id, tracker: r.update?.tracker ?? 'none', interval, checked: r.checked ?? null, ...f };
  });
  const tracked = rows.filter(r => r.state !== 'exempt');
  const fresh = tracked.filter(r => r.state === 'fresh');
  const stale = tracked.filter(r => r.state === 'stale');
  const never = tracked.filter(r => r.state === 'never');
  const pct = tracked.length ? Math.round((fresh.length / tracked.length) * 100) : 100;
  const byTracker = new Map<string, { n: number; fresh: number }>();
  for (const r of tracked) {
    const e = byTracker.get(r.tracker) ?? { n: 0, fresh: 0 };
    e.n++; if (r.state === 'fresh') e.fresh++;
    byTracker.set(r.tracker, e);
  }
  const summary = { generatedAt: now.toISOString(), tracked: tracked.length, fresh: fresh.length, stale: stale.length, never: never.length, exempt: rows.length - tracked.length, freshness_pct: pct, by_tracker: Object.fromEntries(byTracker) };

  if (o.json) { console.log(JSON.stringify({ ...summary, resources: o.stale ? [...stale, ...never] : rows }, null, 2)); }
  else {
    console.log(t('cat.freshness', { pct, fresh: fresh.length, n: tracked.length, stale: stale.length, never: never.length }));
    for (const [k, v] of [...byTracker.entries()].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k.padEnd(16)} ${String(v.fresh).padStart(4)} / ${String(v.n).padEnd(4)}`);
    if (o.stale || stale.length + never.length <= 25) {
      for (const r of [...stale, ...never]) console.log(`  ${r.state === 'never' ? '∅' : '⏰'} ${r.id.padEnd(34)} ${r.tracker.padEnd(14)} ${r.checked ?? '—'}${r.ageDays != null ? ` (${r.ageDays} j > ${r.interval})` : ''}`);
    } else console.log(t('cat.freshness_more', { n: stale.length + never.length }));
  }
  const min = o.min !== undefined ? Number(o.min) : undefined;
  if (min !== undefined && pct < min) { console.error(t('cat.freshness_below', { pct, min })); process.exitCode = 1; }
}
