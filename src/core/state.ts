// État local de la bibliothèque : ce qui est installé, en quelle version, vérifié quand.
// Local library state: what is installed, which version, verified when.
// Fichier : <library>/.arche/state.json — humainement lisible, versionnable, copiable avec la clé USB.
import fs from 'node:fs';
import path from 'node:path';
import { stateDir, stateFile } from './paths.js';

export interface InstalledEntry {
  id: string;
  path: string;              // relatif à la bibliothèque
  version: string | null;    // ex. "2026-08" pour un ZIM, tag pour une release, digest pour ollama
  size_bytes: number;
  checksum?: { algo: string; value: string } | null;
  installed_at: string;
  verified_at?: string | null;
  source_url?: string;
}

export interface LibraryState {
  schema: 1;
  created_at: string;
  profile?: string;
  installed: Record<string, InstalledEntry>;
  last_plan?: { at: string; selected: string[] };
}

export function loadState(lib: string): LibraryState {
  const f = stateFile(lib);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  return { schema: 1, created_at: new Date().toISOString(), installed: {} };
}

export function saveState(lib: string, s: LibraryState) {
  fs.mkdirSync(stateDir(lib), { recursive: true });
  const tmp = stateFile(lib) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, stateFile(lib));   // écriture atomique : une coupure de courant ne corrompt pas l'état
}

/** Sous-dossier de destination par type de ressource. */
export function destDirFor(type: string): string {
  return ({ zim: 'zim', 'ai-model': 'models', 'git-repo': 'git', toolchain: 'toolchains', pdf: 'pdf', software: 'software', dataset: 'data', map: 'maps' } as Record<string, string>)[type] ?? 'misc';
}

export const relPath = (lib: string, abs: string) => path.relative(lib, abs).split(path.sep).join('/');
