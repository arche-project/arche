// Suit les modèles IA : Ollama (existence du tag, taille, digest) et Hugging Face (existence du fichier, taille, sha256).
// Tracks AI models: Ollama (tag existence, size, digest) and Hugging Face (file existence, size, sha256).
//
// Ollama n'a pas d'API publique documentée pour la bibliothèque ; on utilise l'endpoint du registre
// (registry.ollama.ai/v2/library/<model>/manifests/<tag>) qui sert les manifests OCI. Si ça casse, le script
// se rabat sur un HEAD de la page https://ollama.com/library/<model>:<tag>.
// De plus, il liste les nouveaux modèles populaires (page library?sort=newest) dans le rapport, pour arbitrage humain.
import { loadResourceFiles, saveResourceFiles, setField, writeReport, head, markChecked, today } from './lib.js';

const dry = process.argv.includes('--dry-run');

interface Manifest { layers: Array<{ mediaType: string; size: number; digest: string }>; config?: { digest: string } }

async function ollamaManifest(model: string): Promise<{ size: number; digest: string } | null> {
  const [name, tag = 'latest'] = model.split(':');
  const ns = name.includes('/') ? name : `library/${name}`;
  const r = await fetch(`https://registry.ollama.ai/v2/${ns}/manifests/${tag}`, { headers: { Accept: 'application/vnd.docker.distribution.manifest.v2+json' }, signal: AbortSignal.timeout(30000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`registry ${r.status}`);
  const m = await r.json() as Manifest;
  const size = m.layers.reduce((s, l) => s + l.size, 0);
  const weights = m.layers.find(l => l.mediaType.includes('image.model'));
  return { size, digest: (weights?.digest ?? r.headers.get('docker-content-digest') ?? '').slice(0, 19) };
}

async function hfFile(repo: string, file: string): Promise<{ size: number; sha256?: string } | null> {
  // L'API "paths-info" renvoie la taille et le LFS oid (= sha256) sans télécharger.
  const r = await fetch(`https://huggingface.co/api/models/${repo}/paths-info/main`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: [file] }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) return null;
  const [info] = await r.json() as Array<{ path: string; size: number; lfs?: { oid: string } }>;
  return info ? { size: info.size, sha256: info.lfs?.oid } : null;
}

async function newOllamaModels(): Promise<string[]> {
  try {
    const r = await fetch('https://ollama.com/library?sort=newest', { signal: AbortSignal.timeout(30000) });
    const html = await r.text();
    return [...html.matchAll(/href="\/library\/([a-z0-9._-]+)"/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 15);
  } catch { return []; }
}

async function main() {
  const files = loadResourceFiles();
  const known = new Set<string>();
  for (const rf of files) {
    for (let i = 0; i < rf.items.length; i++) {
      const r = rf.items[i];
      try {
        if (r.source.kind === 'ollama' && r.source.ollama_model) {
          known.add(r.source.ollama_model.split(':')[0]);
          let m: { size: number; digest: string } | null = null;
          try { m = await ollamaManifest(r.source.ollama_model); }
          catch { const h = await head(`https://ollama.com/library/${r.source.ollama_model}`); m = h.ok ? { size: r.size_bytes ?? 0, digest: r.version ?? '' } : null; }
          if (!m) { if (r.status !== 'missing') setField(rf, i, 'status', 'missing', `tag absent du registre le ${today()}`); continue; }
          if (m.size) setField(rf, i, 'size_bytes', m.size);
          if (m.digest) setField(rf, i, 'version', m.digest, m.digest !== r.version ? 'nouveaux poids' : undefined);
          setField(rf, i, 'updated', today());
          if (r.status === 'unverified') setField(rf, i, 'status', 'active');
          markChecked(rf, i);
        } else if (r.source.kind === 'huggingface' && r.source.hf_repo && r.source.hf_file) {
          const f = await hfFile(r.source.hf_repo, r.source.hf_file);
          if (!f) { if (r.status !== 'missing') setField(rf, i, 'status', 'missing', 'fichier HF introuvable'); continue; }
          setField(rf, i, 'size_bytes', f.size);
          if (f.sha256) { setField(rf, i, 'checksum.algo', 'sha256'); setField(rf, i, 'checksum.value', f.sha256); }
          setField(rf, i, 'updated', today());
          if (r.status === 'unverified') setField(rf, i, 'status', 'active');
          markChecked(rf, i);
        }
      } catch (e) { console.warn(`${r.id}: ${(e as Error).message}`); }
    }
  }
  if (!dry) saveResourceFiles(files);
  const fresh = (await newOllamaModels()).filter(m => !known.has(m));
  if (fresh.length) console.log('\nNouveaux modèles Ollama non catalogués (à arbitrer) / new uncatalogued Ollama models:\n  ' + fresh.join(', '));
  writeReport('models');
}
main().catch(e => { console.error(e); process.exit(1); });
