// Logique de recommandation : profil + matériel + budget disque → sélection pré-cochée, avec une raison par ligne.
// Recommendation logic: profile + hardware + disk budget → pre-checked selection, one reason per line.
//
// Règles, dans l'ordre :
//  1. Filtre dur : profil, OS/arch, RAM/VRAM requises, statut (deprecated/missing jamais proposés), langue.
//  2. Palier IA : le plus grand palier satisfait par la RAM (ou VRAM si GPU) → ses modèles deviennent "recommended".
//  3. Les "essential" sont cochés quoi qu'il arrive (même si ça dépasse : on prévient).
//  4. Les "recommended" sont cochés par ordre de taille croissante tant que le budget tient (petits d'abord :
//     on préfère 20 petites ressources utiles à une seule énorme).
//  5. Substitutions : si wikipedia-fr-maxi tient dans le budget restant, il remplace wikipedia-fr-nopic.
//  6. Les "optional" ne sont jamais cochés par défaut (sauf profil bunker qui les autorise).
//  7. Dépendances : cocher une ressource coche ses depends_on.
import type { Catalog, Hardware, Plan, PlanItem, PlanOptions, Priority, Resource } from './types.js';
import { sizeGbOf } from './types.js';
import { withDependencies } from './catalog.js';

const SUBSTITUTIONS: Array<[string, string]> = [
  ['wikipedia-fr-nopic', 'wikipedia-fr-maxi'],
  ['wikipedia-en-nopic', 'wikipedia-en-maxi'],
];

export function pickAiTier(catalog: Catalog, hw: Hardware): string | null {
  let best: string | null = null;
  for (const t of catalog.ai_tiers) {
    const okRam = hw.ram_gb >= t.min_ram_gb;
    const okVram = t.min_vram_gb != null && hw.vram_gb >= t.min_vram_gb;
    if (okRam || okVram) best = t.id;
  }
  return best;
}

function hardFilter(r: Resource, profile: PlanOptions['profile'], hw: Hardware, langs: string[]): string | null {
  if (r.status === 'deprecated' || r.status === 'missing') return 'status';
  // Un ZIM qu'Arche doit construire mais n'a pas encore construit n'est pas téléchargeable : on
  // ne le propose pas, plutôt que d'échouer au téléchargement (trouvé en préparant le MVP).
  if (r.source.kind === 'arche-hosted' && !r.built_from?.built_at) return 'not_built';
  if (!r.profiles.includes(profile)) return 'profile';
  const req = r.requires ?? {};
  if (req.os && !req.os.includes(hw.os)) return 'os';
  if (req.arch && !req.arch.includes(hw.arch)) return 'arch';
  if (req.gpu === 'required' && hw.vram_gb === 0) return 'gpu';
  // ADR 0012 : pour un modèle, la RAM qui manque n'est jamais un filtre dur — il tournera lentement
  // (mmap depuis le disque) et l'estimateur dira combien. Pour un logiciel, ça reste bloquant.
  if (req.ram_gb && hw.ram_gb < req.ram_gb && !(req.vram_gb && hw.vram_gb >= req.vram_gb)) return r.type === 'ai-model' ? null : 'ram';
  // langue : on garde 'mul' et tout ce qui intersecte les langues demandées ; l'anglais reste visible mais non coché si non demandé
  if (!r.languages.includes('mul') && !r.languages.some(l => langs.includes(l))) return 'lang';
  return null;
}

/** Un modèle demandé au-delà de la RAM (et de la VRAM) : autorisé, mais lent — le temps s'adapte, pas les capacités (ADR 0012). */
export function isSlowOnThisMachine(r: Resource, hw: Hardware): boolean {
  const req = r.requires ?? {};
  if (r.type !== 'ai-model' || !req.ram_gb) return false;
  return hw.ram_gb < req.ram_gb && !(req.vram_gb && hw.vram_gb >= req.vram_gb);
}

export function plan(catalog: Catalog, hw: Hardware, opts: PlanOptions): Plan {
  const profile = catalog.profiles.find(p => p.id === opts.profile);
  if (!profile) throw new Error(`unknown profile ${opts.profile}`);
  const langs = opts.languages ?? ['fr', 'en'];
  const allowed = new Set<Priority>(opts.allowPriorities ?? profile.default_priorities);
  const budget = opts.diskBudgetGb ?? hw.disk_free_gb * profile.disk_budget_ratio;
  const warnings: string[] = [];

  const aiTier = pickAiTier(catalog, hw);
  const tierModels = new Set(aiTier ? catalog.ai_tiers.find(t => t.id === aiTier)!.models : []);
  const defaultModel = aiTier ? catalog.ai_tiers.find(t => t.id === aiTier)!.models[0] : null;

  // ressources explicitement demandées via bundles
  const viaBundle = new Map<string, string>();
  for (const bid of opts.bundles ?? []) {
    const b = catalog.bundles.find(x => x.id === bid);
    if (!b) { warnings.push(`unknown bundle ${bid}`); continue; }
    for (const id of b.resources) viaBundle.set(id, bid);
    if (b.dynamic === 'ai_tier') for (const id of tierModels) viaBundle.set(id, bid);
  }

  const items = new Map<string, PlanItem>();
  for (const r of catalog.resources) {
    const hidden = (profile.hide_types ?? []).includes(r.type) || (profile.hide_categories ?? []).includes(r.category);
    const why = hardFilter(r, opts.profile, hw, langs);
    if (why && why !== 'lang') continue;           // filtré dur : n'apparaît pas
    if (hidden && !viaBundle.has(r.id) && !(opts.include ?? []).includes(r.id)) continue;
    // ai-model : seulement le palier détecté (les autres restent visibles en mode expert via include)
    if (r.type === 'ai-model' && !tierModels.has(r.id) && !(opts.include ?? []).includes(r.id)) continue;
    items.set(r.id, { resource: r, sizeGb: sizeGbOf(r), selected: false, reason: why === 'lang' ? 'reason.lang_not_requested' : 'reason.unselected', viaBundle: viaBundle.get(r.id) });
  }

  const select = (id: string, reason: string) => {
    const it = items.get(id); if (!it) return;
    if (!it.selected) { it.selected = true; it.reason = reason; }
    for (const dep of withDependencies(catalog, [id])) {
      const d = items.get(dep); if (d && !d.selected) { d.selected = true; d.reason = `reason.dependency:${id}`; }
    }
  };
  const total = () => [...items.values()].filter(i => i.selected).reduce((s, i) => s + i.sizeGb, 0);

  // 1. explicites
  for (const id of opts.include ?? []) { const r = catalog.byId.get(id); select(id, r && isSlowOnThisMachine(r, hw) ? 'reason.explicit_slow' : 'reason.explicit'); }
  for (const [id, b] of viaBundle) if (items.has(id)) select(id, `reason.bundle:${b}`);
  // 2. essentiels
  for (const it of items.values()) if (it.resource.priority === 'essential' && it.reason !== 'reason.lang_not_requested') select(it.resource.id, 'reason.essential');
  // 3. modèle IA par défaut
  if (defaultModel && items.has(defaultModel) && allowed.has('recommended')) select(defaultModel, `reason.ai_tier:${aiTier}`);
  // 4. recommandés, petits d'abord
  if (allowed.has('recommended')) {
    const upgrades = new Set(SUBSTITUTIONS.map(([, big]) => big));
    const cands = [...items.values()].filter(i => !i.selected && i.resource.priority === 'recommended' && i.reason !== 'reason.lang_not_requested' && !upgrades.has(i.resource.id)).sort((a, b) => a.sizeGb - b.sizeGb);
    for (const c of cands) {
      if (total() + c.sizeGb <= budget) select(c.resource.id, 'reason.recommended_fits');
      else c.reason = 'reason.recommended_no_room';
    }
  }
  // 5. substitutions (nopic → maxi) si la place reste ; sinon la version "maxi" reste proposée non cochée
  for (const [small, big] of SUBSTITUTIONS) {
    const s = items.get(small), b = items.get(big);
    if (!b || b.selected || !allowed.has('recommended') || b.reason === 'reason.lang_not_requested') continue;
    const delta = b.sizeGb - (s?.selected ? s.sizeGb : 0);
    if (total() + delta <= budget) {
      if (s?.selected) { s.selected = false; s.reason = `reason.replaced_by:${big}`; }
      select(big, s ? `reason.upgrade_from:${small}` : 'reason.recommended_fits');
    } else b.reason = 'reason.recommended_no_room';
  }
  // 6. optionnels (profil bunker seulement, s'il reste de la place)
  if (allowed.has('optional')) {
    const cands = [...items.values()].filter(i => !i.selected && i.resource.priority === 'optional' && i.reason !== 'reason.lang_not_requested' && i.sizeGb < 30).sort((a, b) => a.sizeGb - b.sizeGb);
    for (const c of cands) if (total() + c.sizeGb <= budget) select(c.resource.id, 'reason.optional_fits');
  }
  // exclusions finales
  for (const id of opts.exclude ?? []) { const it = items.get(id); if (it) { it.selected = false; it.reason = 'reason.excluded'; } }

  const totalGb = total();
  if (totalGb > budget) warnings.push(`over_budget:${(totalGb - budget).toFixed(1)}`);
  if (!hw.online) warnings.push('offline');
  for (const it of items.values()) if (it.selected && it.resource.status === 'unverified') { warnings.push('unverified_sizes'); break; }
  if (!aiTier) warnings.push('no_ai_tier');

  const ordered = [...items.values()].sort((a, b) => Number(b.selected) - Number(a.selected) || a.resource.category.localeCompare(b.resource.category) || a.sizeGb - b.sizeGb);
  return { profile: opts.profile, items: ordered, totalSelectedGb: totalGb, budgetGb: budget, aiTier, warnings };
}
