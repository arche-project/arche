// Recettes de miroir : le mécanisme qui rend n'importe quelle distribution ajoutable.
// Mirror recipes: the mechanism that makes any distribution addable.
//
// On ne peut pas mettre tous les paquets du monde dans un dépôt. On peut en revanche décrire, en
// trente lignes de YAML, COMMENT copier la partie utile de n'importe quel dépôt de paquets : son
// type, son URL, sa branche, ses architectures, et la liste courte des paquets racine dont on
// calcule la fermeture (packages.ts). Arche fournit le mécanisme et trois recettes de référence
// (Debian, Ubuntu, Alpine) ; la communauté ajoute les siennes, et le tracker de fraîcheur les suit
// comme n'importe quelle ressource.
//
// Arche ships the mechanism and three reference recipes; the community adds its own.

import { parseDebianPackages, parseApkIndex, closure, type PkgIndex, type ClosureResult } from './packages.js';

export type RepoType = 'apt' | 'apk';

export interface MirrorRecipe {
  id: string;
  /** Ressource du catalogue que ce miroir alimente (ex. apt-mirror-debian). */
  resource: string;
  type: RepoType;
  /** URL de base du dépôt, sans slash final. */
  base_url: string;
  /** apt : nom de la distribution (`bookworm`, `noble`) ; apk : branche (`v3.20`, `latest-stable`). */
  suite: string;
  /** apt : composants (`main`, `contrib`…) ; apk : dépôts (`main`, `community`). */
  components: string[];
  architectures: string[];
  /** Paquets racine : la fermeture est calculée automatiquement. */
  packages: string[];
  /** apt : suivre aussi les Recommends. */
  recommends?: boolean;
  /** Ordre de grandeur attendu, pour détecter une recette qui a explosé. */
  size_estimate_gb?: number;
  note?: { fr: string; en: string };
}

/** URL du fichier d'index pour une architecture et un composant. / Index URL for an arch and a component. */
export function indexUrl(r: MirrorRecipe, component: string, arch: string): string {
  if (r.type === 'apt') return `${r.base_url}/dists/${r.suite}/${component}/binary-${arch}/Packages`;
  return `${r.base_url}/${r.suite}/${component}/${arch}/APKINDEX.tar.gz`;
}

/** URL de téléchargement d'un paquet. / Download URL of a package. */
export function packageUrl(r: MirrorRecipe, component: string, arch: string, filename: string): string {
  if (r.type === 'apt') return `${r.base_url}/${filename}`; // Filename: est relatif à la racine du dépôt
  return `${r.base_url}/${r.suite}/${component}/${arch}/${filename}`;
}

/** Analyse l'index selon le type. / Parses the index according to the type. */
export function parseIndex(r: MirrorRecipe, text: string): PkgIndex {
  return r.type === 'apt' ? parseDebianPackages(text) : parseApkIndex(text);
}

/** Fusionne les index de plusieurs composants (main + community) en un seul, le premier gagnant. */
export function mergeIndexes(indexes: readonly PkgIndex[]): PkgIndex {
  const out: PkgIndex = { format: indexes[0]?.format ?? 'deb', byName: new Map(), providers: new Map() };
  for (const idx of indexes) {
    for (const [n, p] of idx.byName) if (!out.byName.has(n)) out.byName.set(n, p);
    for (const [v, ps] of idx.providers) out.providers.set(v, [...(out.providers.get(v) ?? []), ...ps]);
  }
  return out;
}

export interface MirrorPlan {
  recipe: string;
  arch: string;
  result: ClosureResult;
  /** Liste plate des téléchargements : URL et taille. */
  downloads: Array<{ url: string; size: number; sha256?: string }>;
}

/**
 * Plan de miroir pour une architecture : fermeture sur les index fusionnés, puis URLs.
 * Pure : les index sont passés déjà lus, pour rester testable sans réseau.
 */
export function planMirror(r: MirrorRecipe, arch: string, indexesByComponent: Record<string, PkgIndex>): MirrorPlan {
  const idx = mergeIndexes(Object.values(indexesByComponent));
  const result = closure(idx, r.packages, { recommends: r.recommends });
  // Pour apk, retrouver le composant d'origine de chaque paquet (main ou community).
  const componentOf = (name: string): string => {
    for (const [c, i] of Object.entries(indexesByComponent)) if (i.byName.has(name)) return c;
    return r.components[0]!;
  };
  const downloads = result.packages.map(p => ({ url: packageUrl(r, componentOf(p.name), arch, p.filename), size: p.size, sha256: p.sha256 }));
  return { recipe: r.id, arch, result, downloads };
}

/** Validation minimale d'une recette lue depuis YAML. / Minimal validation of a YAML recipe. */
export function validateRecipe(r: Partial<MirrorRecipe>): string[] {
  const e: string[] = [];
  if (!r.id) e.push('id manquant');
  if (!r.resource) e.push('resource manquant (ressource du catalogue alimentée)');
  if (r.type !== 'apt' && r.type !== 'apk') e.push(`type inconnu : ${String(r.type)} (apt | apk)`);
  if (!r.base_url || !/^https?:\/\//.test(r.base_url)) e.push('base_url invalide');
  if (r.base_url?.endsWith('/')) e.push('base_url ne doit pas finir par /');
  if (!r.suite) e.push('suite manquante');
  if (!r.components?.length) e.push('components vide');
  if (!r.architectures?.length) e.push('architectures vide');
  if (!r.packages?.length) e.push('packages vide : un miroir sans paquets racine ne sert à rien');
  return e;
}
