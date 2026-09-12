// Après un build + upload : réécrit l'entrée de catalogue correspondante (source.kind arche-hosted, URL IA, taille, sha256,
// version, built_from). Appelé par zim-build.yml, puis la PR est ouverte.
// After build + upload: rewrites the matching catalog entry. Called by zim-build.yml, then the PR is opened.
//
// Usage : tsx scripts/zim/update-catalog.ts build/zim/build.json
import fs from 'node:fs';
import { loadResourceFiles, saveResourceFiles, setField, writeReport } from '../catalog/lib.js';

const buildFile = process.argv[2] ?? 'build/zim/build.json';
const b = JSON.parse(fs.readFileSync(buildFile, 'utf8')) as { recipe: string; resource: string; file: string; size_bytes: number; sha256: string; version: string; built_at: string; ia_item: string; url: string; tool: string; permission: string };
const dir = buildFile.replace(/[^/]+$/, '');
const iaUrl = fs.existsSync(dir + 'ia-url.txt') ? fs.readFileSync(dir + 'ia-url.txt', 'utf8').trim() : `https://archive.org/download/${b.ia_item}/${b.file}`;
const torrent = fs.existsSync(dir + 'ia-torrent.txt') ? fs.readFileSync(dir + 'ia-torrent.txt', 'utf8').trim() : `https://archive.org/download/${b.ia_item}/${b.ia_item}_archive.torrent`;

const files = loadResourceFiles();
let found = false;
for (const rf of files) {
  const i = rf.items.findIndex(r => r.id === b.resource);
  if (i < 0) continue;
  found = true;
  const r = rf.items[i];
  // Une ressource "manual" (site à convertir) devient un vrai ZIM téléchargeable.
  if (r.type !== 'zim') setField(rf, i, 'type', 'zim', 'now a hosted ZIM');
  setField(rf, i, 'source.kind', 'arche-hosted');
  setField(rf, i, 'source.ia_item', b.ia_item);
  setField(rf, i, 'source.url', iaUrl);
  setField(rf, i, 'source.torrent', torrent);
  if (!r.source.homepage) setField(rf, i, 'source.homepage', b.url);
  setField(rf, i, 'size_bytes', b.size_bytes);
  setField(rf, i, 'checksum.algo', 'sha256');
  setField(rf, i, 'checksum.value', b.sha256);
  setField(rf, i, 'version', b.version, 'new build');
  setField(rf, i, 'updated', b.built_at.slice(0, 10));
  setField(rf, i, 'built_from.url', b.url);
  setField(rf, i, 'built_from.tool', b.tool);
  setField(rf, i, 'built_from.recipe', b.recipe);
  setField(rf, i, 'built_from.built_at', b.built_at);
  setField(rf, i, 'built_from.permission', b.permission);
  setField(rf, i, 'update.tracker', 'arche-build');
  if (!(r.depends_on ?? []).includes('kiwix-tools')) setField(rf, i, 'depends_on', [...(r.depends_on ?? []), 'kiwix-tools']);
  setField(rf, i, 'status', 'active');
}
if (!found) { console.error(`resource ${b.resource} not found in catalog`); process.exit(1); }
saveResourceFiles(files);
writeReport(`zim-${b.recipe}`);
