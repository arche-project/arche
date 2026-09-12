// `arche export` / `arche import` : le cas "machine déjà hors-ligne".
// Une machine connectée prépare un bundle sur clé USB (bibliothèque + état + catalogue + Arche lui-même) ;
// une machine hors-ligne l'importe sans réseau. Aucune archive : on copie des fichiers, donc reprise et
// vérification restent possibles avec `arche verify`.
import fs from 'node:fs';
import path from 'node:path';
import { libraryDir, repoRoot } from '../core/paths.js';
import { loadState, saveState } from '../core/state.js';

const copyDir = (src: string, dst: string, filter?: (p: string) => boolean) => {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (filter && !filter(s)) continue;
    if (e.isDirectory()) copyDir(s, d, filter);
    else if (!fs.existsSync(d) || fs.statSync(d).size !== fs.statSync(s).size) fs.copyFileSync(s, d);
  }
};

export async function exportCommand(o: { library?: string; to: string }) {
  const lib = libraryDir(o.library);
  const to = path.resolve(o.to);
  console.log(`export ${lib} → ${to}`);
  copyDir(lib, path.join(to, 'library'), p => !p.endsWith('.part'));
  // Arche lui-même : dépôt (sans node_modules) + build, pour que la machine cible puisse tourner sans npm.
  const root = repoRoot();
  copyDir(root, path.join(to, 'arche'), p => !/node_modules|\.git$|\.git\/|library/.test(p));
  fs.writeFileSync(path.join(to, 'README-USB.txt'), [
    'ARCHE — bundle hors-ligne / offline bundle',
    '',
    'FR: 1) Copier le dossier "library" où vous voulez (disque interne ou garder sur cette clé).',
    '    2) Dans "arche", lancer:  node dist/cli.js import --from <chemin de cette clé> --library <destination>',
    '       ou simplement:        node dist/cli.js serve --library <chemin>/library',
    '    Sans Node.js installé: utiliser l\'exécutable arche(.exe) s\'il est présent dans arche/build/.',
    '',
    'EN: 1) Copy the "library" folder where you want it (internal disk, or keep it on this drive).',
    '    2) In "arche", run:  node dist/cli.js import --from <this drive> --library <destination>',
    '       or simply:        node dist/cli.js serve --library <path>/library',
    '    Without Node.js: use the arche(.exe) executable if present in arche/build/.',
  ].join('\n'));
  console.log('done');
}

export async function importCommand(o: { from: string; library?: string }) {
  const from = path.resolve(o.from);
  const lib = libraryDir(o.library);
  const src = fs.existsSync(path.join(from, 'library')) ? path.join(from, 'library') : from;
  console.log(`import ${src} → ${lib}`);
  copyDir(src, lib);
  const state = loadState(lib);
  state.last_plan = { at: new Date().toISOString(), selected: Object.keys(state.installed) };
  saveState(lib, state);
  console.log(`done: ${Object.keys(state.installed).length} resources. Run: arche verify --library ${lib}`);
}
