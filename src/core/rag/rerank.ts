// Reclassement des extraits (ADR 0007, complément) : relire les meilleurs candidats AVEC la question.
// Passage reranking: reread the top candidates WITH the question.
//
// La recherche hybride (BM25 + dense + RRF) rapproche ; elle ne lit pas. Un reclasseur est un petit
// modèle qui prend (question, extrait) et rend une pertinence — il « lit » vraiment le couple, ce
// qu'aucun embedding ne fait. Sur 30 candidats, c'est quelques centaines de millisecondes sur CPU
// et c'est le meilleur rapport qualité/coût de toute la chaîne.
//
// Deux serveurs possibles, dans cet ordre :
//   1. llama-server --reranking  → POST /v1/rerank (Qwen3-Reranker en GGUF). Scores continus.
//   2. Ollama /api/chat en repli  → question oui/non par extrait. Grossier (0 ou 1), mais mieux que rien.
// Et toujours un troisième : ne rien faire, et garder l'ordre de la fusion. Le reclasseur est un
// bonus ; son absence n'est jamais une panne.

export interface RerankCandidate {
  id: string;
  text: string;
}

export interface Reranked<T extends RerankCandidate> {
  item: T;
  score: number;
}

export interface RerankOptions {
  /** URL de llama-server (ex. http://127.0.0.1:8012). LLAMA_RERANK_HOST prime. */
  llamaHost?: string;
  /** URL d'Ollama pour le repli oui/non ; OLLAMA_HOST prime. */
  ollamaHost?: string;
  /** Modèle Ollama pour le repli (un petit modèle de chat suffit). */
  ollamaModel?: string;
  timeoutMs?: number;
  /** Ne garder que les n premiers après reclassement. */
  topN?: number;
}

/** Le corps attendu par llama-server (compatible Jina/Cohere). / Body llama-server expects. */
export function rerankRequestBody(query: string, docs: readonly string[], topN?: number): Record<string, unknown> {
  return { model: 'reranker', query, documents: docs, ...(topN ? { top_n: topN } : {}) };
}

/** Lit la réponse de /v1/rerank : `results: [{ index, relevance_score }]`. Robuste aux variantes. */
export function parseRerankResponse(json: unknown, count: number): number[] {
  const scores = new Array<number>(count).fill(Number.NEGATIVE_INFINITY);
  const results = (json as { results?: Array<{ index?: number; relevance_score?: number; score?: number }> })?.results;
  if (!Array.isArray(results)) throw new Error('réponse de reclassement sans `results`');
  for (const r of results) {
    const i = r.index; const s = r.relevance_score ?? r.score;
    if (typeof i === 'number' && i >= 0 && i < count && typeof s === 'number') scores[i] = s;
  }
  return scores;
}

/** Ordonne par score décroissant, stable pour les égalités (garde l'ordre d'entrée). */
export function orderByScore<T extends RerankCandidate>(items: readonly T[], scores: readonly number[]): Reranked<T>[] {
  return items
    .map((item, i) => ({ item, score: scores[i] ?? Number.NEGATIVE_INFINITY, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ item, score }) => ({ item, score }));
}

async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
    return (await r.json()) as T;
  } finally { clearTimeout(timer); }
}

export class Reranker {
  private readonly llamaHost: string | null;
  private readonly ollamaHost: string;
  private readonly ollamaModel: string;
  private readonly timeoutMs: number;
  private readonly topN?: number;
  /** Quel chemin a servi la dernière fois : pour l'afficher à l'utilisateur, pas pour décider. */
  lastBackend: 'llama-server' | 'ollama-yesno' | 'none' = 'none';

  constructor(o: RerankOptions = {}) {
    const llama = o.llamaHost ?? process.env['LLAMA_RERANK_HOST'] ?? null;
    this.llamaHost = llama ? llama.replace(/\/+$/, '') : null;
    this.ollamaHost = (o.ollamaHost ?? process.env['OLLAMA_HOST'] ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
    this.ollamaModel = o.ollamaModel ?? 'qwen3.5:4b';
    this.timeoutMs = o.timeoutMs ?? 30_000;
    this.topN = o.topN;
  }

  /**
   * Reclasse. Ne lance jamais : si aucun serveur ne répond, rend l'ordre d'entrée avec des scores
   * nuls et `lastBackend = 'none'`. L'appelant peut le dire à l'utilisateur ; il ne doit pas échouer.
   */
  async rerank<T extends RerankCandidate>(query: string, items: readonly T[]): Promise<Reranked<T>[]> {
    if (!items.length) return [];
    if (this.llamaHost) {
      try {
        const json = await postJson<unknown>(`${this.llamaHost}/v1/rerank`, rerankRequestBody(query, items.map(i => i.text), this.topN), this.timeoutMs);
        const scores = parseRerankResponse(json, items.length);
        this.lastBackend = 'llama-server';
        const ordered = orderByScore(items, scores);
        return this.topN ? ordered.slice(0, this.topN) : ordered;
      } catch { /* on tente le repli */ }
    }
    try {
      const scores = await this.yesNo(query, items.map(i => i.text));
      this.lastBackend = 'ollama-yesno';
      const ordered = orderByScore(items, scores);
      return this.topN ? ordered.slice(0, this.topN) : ordered;
    } catch { /* aucun serveur : on ne casse rien */ }
    this.lastBackend = 'none';
    return items.map(item => ({ item, score: 0 }));
  }

  /** Repli grossier : un oui/non par extrait via Ollama. Séquentiel et lent — réservé aux petits lots. */
  private async yesNo(query: string, docs: readonly string[]): Promise<number[]> {
    const out: number[] = [];
    for (const doc of docs.slice(0, 12)) {
      const j = await postJson<{ message?: { content?: string } }>(`${this.ollamaHost}/api/chat`, {
        model: this.ollamaModel, stream: false, options: { temperature: 0, num_predict: 3 },
        messages: [
          { role: 'system', content: 'Réponds uniquement par "oui" ou "non".' },
          { role: 'user', content: `Question : ${query}\n\nExtrait :\n${doc.slice(0, 1500)}\n\nCet extrait aide-t-il à répondre à la question ?` },
        ],
      }, this.timeoutMs);
      out.push(/^\s*(oui|yes)/i.test(j.message?.content ?? '') ? 1 : 0);
    }
    while (out.length < docs.length) out.push(0);
    return out;
  }
}
