// Résolution des chemins : dépôt (catalogue, locales, UI) vs bibliothèque (téléchargements, état).
// Path resolution: repo (catalog, locales, UI) vs library (downloads, state).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Racine du dépôt (contient catalog/, locales/). Fonctionne depuis src/ (tsx) et dist/ (build). */
export function repoRoot(): string {
  let dir = here;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'catalog', 'profiles.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const catalogDir = () => process.env.ARCHE_CATALOG_DIR ?? path.join(repoRoot(), 'catalog');
export const localesDir = () => path.join(repoRoot(), 'locales');
/** Chiffres de dimensionnement et jeux d'évaluation (ADR 0007). */
export const knowledgeDir = () => process.env.ARCHE_KNOWLEDGE_DIR ?? path.join(repoRoot(), 'knowledge');
export const webStaticDir = () => path.join(here, '..', 'web', 'static');

/** Dossier de la bibliothèque : ARCHE_HOME > --library > ./library */
export function libraryDir(override?: string): string {
  const d = override ?? process.env.ARCHE_HOME ?? path.join(process.cwd(), 'library');
  return path.resolve(d);
}
export const stateDir = (lib: string) => path.join(lib, '.arche');
export const stateFile = (lib: string) => path.join(stateDir(lib), 'state.json');
