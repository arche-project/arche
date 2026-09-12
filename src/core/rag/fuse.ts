// Fusion par rang réciproque (RRF) de plusieurs listes de résultats.
// Reciprocal Rank Fusion of several result lists.
//
// RRF ne compare jamais les scores entre eux — il ne regarde que les rangs. C'est exactement ce
// qu'il faut ici : un cosinus (0–1) et un score BM25 (non borné) ne sont pas commensurables, et
// toute tentative de les normaliser introduit un réglage qui vieillit mal. RRF n'a qu'une constante,
// et elle n'a presque pas d'effet.
//
// RRF compares ranks, never scores — which is what we need when fusing cosine with BM25.

/** Constante d'amortissement standard ; 60 est la valeur de l'article d'origine. */
export const RRF_K = 60;

export interface Ranked {
  id: string;
}

export interface FusedHit<T extends Ranked> {
  item: T;
  score: number;
  /** Rang dans chaque liste d'entrée, 1-indexé ; absent = non trouvé par cette liste. */
  ranks: Record<string, number>;
}

export interface FuseList<T extends Ranked> {
  name: string;
  items: readonly T[];
  /** Poids de la liste ; 1 par défaut. Utile pour donner plus de voix au lexical sur un corpus technique. */
  weight?: number;
}

/**
 * Fusionne des listes ordonnées. Les éléments sont identifiés par `id` : deux listes qui pointent
 * le même chunk doivent produire le même identifiant, sinon la fusion ne fusionne rien.
 */
export function rrf<T extends Ranked>(lists: readonly FuseList<T>[], k = RRF_K): FusedHit<T>[] {
  const acc = new Map<string, FusedHit<T>>();
  for (const list of lists) {
    const w = list.weight ?? 1;
    list.items.forEach((item, i) => {
      const rank = i + 1;
      let entry = acc.get(item.id);
      if (!entry) {
        entry = { item, score: 0, ranks: {} };
        acc.set(item.id, entry);
      }
      entry.score += w / (k + rank);
      entry.ranks[list.name] = rank;
    });
  }
  return [...acc.values()].sort((a, b) => b.score - a.score);
}

/**
 * Diversification : au plus `perSource` extraits provenant de la même ressource, pour ne pas
 * remplir tout le contexte du modèle avec un seul document. On perd un peu de précision brute et on
 * gagne beaucoup en robustesse — un corpus d'autonomie répond rarement bien depuis une seule source.
 *
 * Caps how many passages come from any single resource, so one document cannot fill the context.
 */
export function diversify<T extends Ranked & { resource_id: string }>(
  hits: readonly FusedHit<T>[],
  limit: number,
  perSource = 3,
): FusedHit<T>[] {
  const seen = new Map<string, number>();
  const out: FusedHit<T>[] = [];
  const deferred: FusedHit<T>[] = [];
  for (const h of hits) {
    const n = seen.get(h.item.resource_id) ?? 0;
    if (n >= perSource) { deferred.push(h); continue; }
    seen.set(h.item.resource_id, n + 1);
    out.push(h);
    if (out.length === limit) return out;
  }
  // S'il reste de la place, on la rend aux sources sur-représentées plutôt que de renvoyer moins.
  for (const h of deferred) {
    if (out.length === limit) break;
    out.push(h);
  }
  return out;
}
