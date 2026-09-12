// Après build + upload d'un shard : remplit le bloc `index` de la ressource dans le catalogue
// (URL IA, sha256, taille, modèle, dims, chunks, built_at). Appelé par index-build.yml, puis PR.
// After building + uploading a shard: fills the resource's `index` block in the catalog.
//
// Usage : tsx scripts/index/update-catalog.ts build/index/build.json
import fs from 'node:fs';
import { loadResourceFiles, saveResourceFiles, setField, writeReport } from '../catalog/lib.js';

const buildFile = process.argv[2] ?? 'build/index/build.json';
const b = JSON.parse(fs.readFileSync(buildFile, 'utf8')) as { resource: string; file: string; size_bytes: number; sha256: string; model: string; dims: number; chunks: number; built_at: string; ia_item: string; lexical: boolean };
const dir = buildFile.replace(/[^/]+$/, '');
const url = fs.existsSync(dir + 'ia-url.txt') ? fs.readFileSync(dir + 'ia-url.txt', 'utf8').trim() : `https://archive.org/download/${b.ia_item}/${b.file}`;

const files = loadResourceFiles();
let found = false;
for (const rf of files) {
  const i = rf.items.findIndex(r => r.id === b.resource);
  if (i < 0) continue;
  found = true;
  setField(rf, i, 'index.url', url, 'new shard');
  setField(rf, i, 'index.sha256', b.sha256);
  setField(rf, i, 'index.size_bytes', b.size_bytes);
  setField(rf, i, 'index.model', b.model);
  setField(rf, i, 'index.dims', b.dims);
  setField(rf, i, 'index.chunks', b.chunks);
  setField(rf, i, 'index.built_at', b.built_at);
  setField(rf, i, 'index.lexical', b.lexical);
}
if (!found) { console.error(`resource ${b.resource} not found in catalog`); process.exit(2); }
saveResourceFiles(files);
writeReport(`index-${b.resource}`);
console.log(`catalog updated: ${b.resource} → ${url} (${b.chunks} chunks, ${b.model})`);
