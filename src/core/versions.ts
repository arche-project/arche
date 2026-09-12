// Politique « dernière version stable ».
// "Latest stable" policy.
//
// Le catalogue ne vaut que par sa fraîcheur — mais « la plus récente » n'est pas « la plus récente
// stable ». Un tag v2.0.0-rc.1, une wheel 3.1.0b2, un « rolling » ROS ne sont pas ce qu'on veut mettre
// sur le disque de quelqu'un qui n'aura pas de réseau pour corriger. Cette politique est écrite une
// fois ici et partagée par tous les vérificateurs, pour qu'aucun n'ait sa propre idée de « stable ».
//
// "Latest" is not "latest stable". Written once, shared by every checker.

export interface ParsedVersion {
  raw: string;
  /** Composantes numériques, complétées à trois. */
  nums: number[];
  /** Présence d'un marqueur de prérelease (rc, beta, alpha, dev, a1, b2…). */
  prerelease: boolean;
  /** Marqueur LTS explicite dans le tag (rare, mais existe : node « lts », ubuntu « LTS »). */
  lts: boolean;
}

// Marqueurs de prérelease, toutes conventions confondues : semver (-rc.1, -beta), PEP 440 (1.0a1,
// 1.0b2, 1.0rc1, 1.0.dev3), et les mots que les projets collent à la main (nightly, snapshot,
// preview, canary, unstable, rolling, testing, sid).
const PRERELEASE = /(?:^|[-._+ ])(?:rc|beta|alpha|dev|pre|preview|nightly|snapshot|canary|unstable|rolling|testing|sid|experimental)(?:[-._]?\d+)?(?![a-z])|^\d+(?:\.\d+)*(?:a|b|c|rc)\d+/i;
const LTS = /\blts\b/i;

/** Analyse un tag ou une chaîne de version. Retourne null si aucun nombre n'est lisible. */
export function parseVersion(raw: string): ParsedVersion | null {
  const s = raw.trim();
  // Retire un préfixe usuel : v1.2, release-1.2, humble-1.2, 2024.05 est gardé tel quel.
  const m = /(\d+(?:\.\d+)*)/.exec(s);
  if (!m) return null;
  const nums = m[1]!.split('.').map(Number);
  while (nums.length < 3) nums.push(0);
  return { raw: s, nums, prerelease: PRERELEASE.test(s), lts: LTS.test(s) };
}

/** Compare deux versions analysées : négatif si a < b. */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  const n = Math.max(a.nums.length, b.nums.length);
  for (let i = 0; i < n; i++) {
    const d = (a.nums[i] ?? 0) - (b.nums[i] ?? 0);
    if (d) return d;
  }
  // À numéros égaux, une version finale passe devant sa prérelease.
  return Number(b.prerelease) - Number(a.prerelease);
}

export type Stability = 'stable' | 'lts' | 'any';

/**
 * Choisit la « dernière version stable » dans une liste de tags.
 *   stable : la plus haute sans marqueur de prérelease (défaut)
 *   lts    : la plus haute marquée LTS ; à défaut, se rabat sur stable et le signale
 *   any    : la plus haute, prérelease comprise (réservé aux ressources qui le demandent)
 *
 * Picks the latest stable tag from a list.
 */
export function latestStable(
  tags: readonly string[],
  stability: Stability = 'stable',
  isLts?: (tag: string) => boolean,
): { tag: string; fallback?: 'no-lts-found' | 'only-prereleases' } | null {
  const parsed = tags.map(parseVersion).filter((p): p is ParsedVersion => p !== null);
  if (!parsed.length) return null;
  const sorted = [...parsed].sort((a, b) => compareVersions(b, a));

  if (stability === 'any') return { tag: sorted[0]!.raw };

  const stable = sorted.filter(p => !p.prerelease);
  if (stability === 'lts') {
    const lts = stable.filter(p => p.lts || (isLts?.(p.raw) ?? false));
    if (lts.length) return { tag: lts[0]!.raw };
    if (stable.length) return { tag: stable[0]!.raw, fallback: 'no-lts-found' };
  }
  if (stable.length) return { tag: stable[0]!.raw };
  // Il n'existe que des prérelease : on rend la plus haute, mais on le dit — c'est au relecteur
  // de décider si ce projet mérite d'être distribué dans cet état.
  return { tag: sorted[0]!.raw, fallback: 'only-prereleases' };
}

/** Vrai si `candidate` est strictement plus récente que `current`. Tolère un current absent. */
export function isNewer(candidate: string, current: string | null | undefined): boolean {
  const c = parseVersion(candidate);
  if (!c) return false;
  const cur = current ? parseVersion(current) : null;
  return !cur || compareVersions(c, cur) > 0;
}

/**
 * Fraîcheur d'une ressource : a-t-elle été vérifiée dans son intervalle ?
 *   fresh   : vérifiée il y a moins de `intervalDays`
 *   stale   : vérifiée, mais depuis plus longtemps que l'intervalle
 *   never   : jamais vérifiée
 *   exempt  : tracker `none`, rien à vérifier automatiquement
 */
export type Freshness = 'fresh' | 'stale' | 'never' | 'exempt';

export function freshness(
  checked: string | null | undefined,
  intervalDays: number,
  tracker: string | undefined,
  now = new Date(),
): { state: Freshness; ageDays: number | null } {
  if (!tracker || tracker === 'none') return { state: 'exempt', ageDays: null };
  if (!checked) return { state: 'never', ageDays: null };
  const t = Date.parse(checked);
  if (Number.isNaN(t)) return { state: 'never', ageDays: null };
  const ageDays = Math.floor((now.getTime() - t) / 86_400_000);
  return { state: ageDays <= intervalDays ? 'fresh' : 'stale', ageDays };
}
