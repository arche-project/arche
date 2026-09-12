// Un faux Embedder pour les tests : vecteurs déterministes par hachage de mots, 64 dimensions —
// assez pour exercer la chaîne extraire → découper → écrire → embarquer sans Ollama.
// A fake Embedder for tests: deterministic word-hash vectors, 64 dims, no Ollama needed.
import { Embedder } from '../../src/core/rag/embed.js';

export const FAKE_DIMS = 64;

export function fakeVector(text: string): Float32Array {
  const v = new Float32Array(FAKE_DIMS);
  for (const w of text.toLowerCase().split(/\W+/).filter(Boolean)) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % FAKE_DIMS] += 1; }
  const n = Math.hypot(...v) || 1; return v.map(x => x / n);
}

export interface FakeEmbedder extends Embedder { calls: number }

/** `delayMs` : pause par lot, pour qu'un test puisse tuer le processus au milieu de l'embedding. */
export function fakeEmbedder(o: { delayMs?: number; failAfter?: number } = {}): FakeEmbedder {
  const e = Object.create(Embedder.prototype) as FakeEmbedder;
  Object.defineProperty(e, 'model', { value: { id: 'fake-64', dims: FAKE_DIMS, ram_gb: 0, multilingual: true, note: { fr: '', en: '' } } });
  e.calls = 0;
  (e as { embed: (t: string[]) => Promise<Float32Array[]> }).embed = async (texts: string[]) => {
    if (o.failAfter !== undefined && e.calls >= o.failAfter) throw new Error('coupure simulée');
    e.calls++;
    if (o.delayMs) await new Promise(r => setTimeout(r, o.delayMs));
    return texts.map(fakeVector);
  };
  (e as { passageText: (t: string) => string }).passageText = (t: string) => t;
  (e as { check: () => Promise<{ ok: boolean }> }).check = async () => ({ ok: true });
  return e;
}
