// Client d'embeddings : Ollama en HTTP, rien d'autre (ADR 0002).
// Embeddings client: Ollama over HTTP, nothing else.

import { quantize } from './sqlite.js';

/** Modèles d'embedding retenus. Un index est lié au modèle qui l'a produit (ADR 0007). */
export interface EmbedModel {
  id: string;
  dims: number;
  /** RAM approximative nécessaire pour le faire tourner, en Go. */
  ram_gb: number;
  multilingual: boolean;
  note: { fr: string; en: string };
}

export const EMBED_MODELS: Record<string, EmbedModel> = {
  'bge-m3': {
    id: 'bge-m3', dims: 1024, ram_gb: 2.5, multilingual: true,
    note: {
      fr: 'Référence Arche. Multilingue, très bon en français, gère les textes longs. ~2,5 Go de RAM.',
      en: 'Arche reference. Multilingual, strong in French, handles long passages. ~2.5 GB RAM.',
    },
  },
  'granite-embedding:278m': {
    id: 'granite-embedding:278m', dims: 768, ram_gb: 1.2, multilingual: true,
    note: {
      fr: 'Compromis. Apache-2.0, multilingue, deux fois plus léger que bge-m3.',
      en: 'Middle ground. Apache-2.0, multilingual, half the weight of bge-m3.',
    },
  },
  'qwen3-embedding:0.6b': {
    id: 'qwen3-embedding:0.6b', dims: 1024, ram_gb: 1, multilingual: true,
    note: {
      fr: 'Candidat de remplacement de bge-m3 : 100+ langues, 639 Mo, dimensions ajustables. À mesurer sur knowledge/eval.yaml avant tout changement de référence (ADR 0007).',
      en: 'Candidate replacement for bge-m3: 100+ languages, 639 MB, adjustable dimensions. Measure on knowledge/eval.yaml before any reference change (ADR 0007).',
    },
  },
  'qwen3-embedding:4b': {
    id: 'qwen3-embedding:4b', dims: 2560, ram_gb: 3.5, multilingual: true,
    note: {
      fr: 'Haut de gamme pour construire les shards en CI ; index 2,5× plus gros que bge-m3 à dimensions pleines.',
      en: 'High end for building shards in CI; index 2.5× larger than bge-m3 at full dimensions.',
    },
  },
  'multilingual-e5-small': {
    id: 'multilingual-e5-small', dims: 384, ram_gb: 0.5, multilingual: true,
    note: {
      fr: 'Repli basse mémoire : tourne sur un Raspberry Pi. Index 2,7× plus petit, rappel un peu moindre.',
      en: 'Low-memory fallback: runs on a Raspberry Pi. 2.7× smaller index, slightly lower recall.',
    },
  },
};

export const DEFAULT_EMBED_MODEL = 'bge-m3';

/** Choisit le modèle d'embedding selon la RAM disponible. / Picks the embedding model for the RAM available. */
export function pickEmbedModel(ramGb: number): EmbedModel {
  if (ramGb >= 8) return EMBED_MODELS['bge-m3']!;
  if (ramGb >= 4) return EMBED_MODELS['granite-embedding:278m']!;
  return EMBED_MODELS['multilingual-e5-small']!;
}

export interface EmbedderOptions {
  model?: string;
  /** URL de base d'Ollama ; la variable OLLAMA_HOST prime si elle est posée. */
  host?: string;
  /** Taille de lot. Au-delà de 32, Ollama gagne peu et la mémoire monte vite. */
  batch?: number;
  timeoutMs?: number;
}

export class Embedder {
  readonly model: EmbedModel;
  private readonly host: string;
  private readonly batch: number;
  private readonly timeoutMs: number;

  constructor(opts: EmbedderOptions = {}) {
    const id = opts.model ?? DEFAULT_EMBED_MODEL;
    const known = EMBED_MODELS[id];
    if (!known) {
      throw new Error(
        `modèle d'embedding inconnu : ${id}. Connus : ${Object.keys(EMBED_MODELS).join(', ')}. ` +
        `Un index construit avec un autre modèle ne sera fusionnable avec aucun index publié.`,
      );
    }
    this.model = known;
    this.host = (opts.host ?? process.env['OLLAMA_HOST'] ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
    this.batch = opts.batch ?? 16;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  /** Vérifie qu'Ollama répond et que le modèle est présent. / Checks Ollama is up and has the model. */
  async check(): Promise<{ ok: boolean; reason?: string }> {
    try {
      const res = await this.fetchJson<{ models?: Array<{ name: string }> }>('/api/tags', undefined, 'GET');
      const names = (res.models ?? []).map(m => m.name);
      const has = names.some(n => n === this.model.id || n.startsWith(this.model.id + ':'));
      if (!has) return { ok: false, reason: `modèle absent — lancez : ollama pull ${this.model.id}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `Ollama injoignable sur ${this.host} (${(e as Error).message})` };
    }
  }

  /** Embarque des textes, par lots. / Embeds texts in batches. */
  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += this.batch) {
      const slice = texts.slice(i, i + this.batch);
      const res = await this.fetchJson<{ embeddings?: number[][]; embedding?: number[] }>('/api/embed', {
        model: this.model.id,
        input: slice,
      });
      const vecs = res.embeddings ?? (res.embedding ? [res.embedding] : []);
      if (vecs.length !== slice.length) throw new Error(`Ollama a renvoyé ${vecs.length} vecteurs pour ${slice.length} textes`);
      for (const v of vecs) {
        if (v.length !== this.model.dims) {
          throw new Error(`${this.model.id} a renvoyé ${v.length} dimensions, ${this.model.dims} attendues`);
        }
        out.push(Float32Array.from(v));
      }
    }
    return out;
  }

  /**
   * Embarque une requête et la quantifie en int8, prête pour le cosinus sur une table de vecteurs (retrieve.ts).
   * Les modèles E5 exigent un préfixe « query: » / « passage: » ; on l'applique ici pour que
   * l'appelant n'ait pas à connaître cette bizarrerie.
   */
  async embedQuery(text: string): Promise<Int8Array> {
    const prefixed = this.model.id.includes('e5') ? `query: ${text}` : text;
    const [v] = await this.embed([prefixed]);
    const q = new Int8Array(this.model.dims);
    quantize(v!, q, 0);
    return q;
  }

  /** Idem pour un passage indexé. / Same, for an indexed passage. */
  passageText(text: string): string {
    return this.model.id.includes('e5') ? `passage: ${text}` : text;
  }

  private async fetchJson<T>(path: string, body?: unknown, method: 'GET' | 'POST' = 'POST'): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.host + path, {
        method,
        signal: ctrl.signal,
        ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
