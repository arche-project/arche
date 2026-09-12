// Les types de projet : une recette YAML par type dans knowledge/projects/ (ADR 0010).
// Project types: one YAML recipe per type in knowledge/projects/ (ADR 0010).
//
// Une recette dit ce qu'il faut dans l'inventaire, quel corpus lire d'abord, quels solveurs et
// générateurs s'appliquent, quels livrables sortent et par qui (solveur, assistant, humain), où sont
// les portes humaines, et ce que l'assistant ne fait jamais. Le code vérifie la cohérence de la
// recette avec le catalogue et les calculateurs ; il ne la « comprend » pas — c'est le prompt qui
// la lit.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { knowledgeDir } from '../paths.js';
import type { I18n } from '../types.js';
import { GENERATORS } from '../rag/diagrams.js';
import { CALCULATORS } from '../rag/figures.js';
import { inventoryFields, type Inventory } from './inventory.js';

export type DeliverableBy = 'solver' | 'assistant' | 'human';

export interface Deliverable { id: string; title: I18n; format: string[]; by: DeliverableBy }

export interface ProjectRecipe {
  id: string;
  name: I18n;
  scenario: I18n;
  /** `solver` : un solveur en code existe ; `recipe` : la démarche est écrite, le solveur pas encore. */
  status: 'solver' | 'recipe';
  inventory: { required: string[]; recommended?: string[] };
  corpus: string[];
  solvers: string[];
  generators: string[];
  deliverables: Deliverable[];
  gates: I18n[];
  never: I18n[];
  limits: I18n;
}

/** Solveurs en code, hors calculateurs : les recettes peuvent les citer. */
export const PROJECT_SOLVERS = ['garden_plan', 'bom_substitute'] as const;

export const projectsDir = () => path.join(knowledgeDir(), 'projects');

export function loadRecipes(dir = projectsDir()): ProjectRecipe[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).sort()
    .map(f => parse(fs.readFileSync(path.join(dir, f), 'utf8')) as ProjectRecipe);
}

export function getRecipe(id: string, dir = projectsDir()): ProjectRecipe | undefined {
  return loadRecipes(dir).find(r => r.id === id);
}

const isI18n = (x: unknown): x is I18n => !!x && typeof x === 'object' && typeof (x as I18n).fr === 'string' && typeof (x as I18n).en === 'string';

/**
 * Vérifie une recette contre ce qui existe vraiment : ressources du catalogue, calculateurs,
 * générateurs, solveurs. Rend la liste des problèmes ; vide = cohérente.
 */
export function validateRecipe(r: ProjectRecipe, catalogIds: Set<string>): string[] {
  const p: string[] = [];
  const at = `projet ${r?.id ?? '?'}`;
  if (!r.id || !/^[a-z0-9-]+$/.test(r.id)) p.push(`${at} : id manquant ou invalide`);
  for (const k of ['name', 'scenario', 'limits'] as const) if (!isI18n(r[k])) p.push(`${at} : ${k} doit être bilingue {fr, en}`);
  if (!['solver', 'recipe'].includes(r.status)) p.push(`${at} : status = solver | recipe`);
  if (!r.inventory?.required?.length) p.push(`${at} : inventory.required vide`);
  for (const id of r.corpus ?? []) if (!catalogIds.has(id)) p.push(`${at} : corpus « ${id} » absent du catalogue`);
  if (!r.corpus?.length) p.push(`${at} : corpus vide`);
  const calcNames = new Set<string>([...Object.keys(CALCULATORS), ...PROJECT_SOLVERS]);
  for (const s of r.solvers ?? []) if (!calcNames.has(s)) p.push(`${at} : solveur « ${s} » inconnu`);
  for (const g of r.generators ?? []) if (!(g in GENERATORS)) p.push(`${at} : générateur « ${g} » inconnu`);
  const seen = new Set<string>();
  for (const d of r.deliverables ?? []) {
    if (!d.id || seen.has(d.id)) p.push(`${at} : livrable sans id ou en double`);
    seen.add(d.id);
    if (!isI18n(d.title)) p.push(`${at} : livrable ${d.id} : titre bilingue attendu`);
    if (!['solver', 'assistant', 'human'].includes(d.by)) p.push(`${at} : livrable ${d.id} : by = solver | assistant | human`);
    if (!d.format?.length) p.push(`${at} : livrable ${d.id} : format vide`);
  }
  if (!r.deliverables?.length) p.push(`${at} : aucun livrable`);
  if (r.status === 'solver' && !(r.deliverables ?? []).some(d => d.by === 'solver')) p.push(`${at} : status solver mais aucun livrable produit par un solveur`);
  if (!r.gates?.length) p.push(`${at} : aucune porte humaine — un projet physique en a toujours au moins une`);
  for (const g of [...(r.gates ?? []), ...(r.never ?? [])]) if (!isI18n(g)) p.push(`${at} : portes et interdits doivent être bilingues`);
  return p;
}

/** Ce qui manque dans un inventaire pour ce type de projet (champs requis absents). */
export function missingInventory(r: ProjectRecipe, inv: Inventory): { required: string[]; recommended: string[] } {
  const have = inventoryFields(inv);
  const has = (f: string) => have.has(f);
  return {
    required: r.inventory.required.filter(f => !has(f)),
    recommended: (r.inventory.recommended ?? []).filter(f => !has(f)),
  };
}

/** Le texte injecté dans le prompt de l'assistant quand un projet de ce type est ouvert. */
export function recipePrompt(r: ProjectRecipe, lang: 'fr' | 'en'): string {
  const L = (x: I18n) => x[lang];
  const lines = [
    lang === 'fr' ? `Projet ouvert : ${L(r.name)}.` : `Open project: ${L(r.name)}.`,
    lang === 'fr' ? 'Lis d’abord ces ressources : ' + r.corpus.join(', ') + '.' : 'Read these resources first: ' + r.corpus.join(', ') + '.',
    lang === 'fr' ? `Solveurs disponibles : ${r.solvers.join(', ') || 'aucun'}. Générateurs : ${r.generators.join(', ') || 'aucun'}.`
      : `Available solvers: ${r.solvers.join(', ') || 'none'}. Generators: ${r.generators.join(', ') || 'none'}.`,
    lang === 'fr' ? 'Livrables attendus :' : 'Expected deliverables:',
    ...r.deliverables.map(d => `- ${d.id} (${d.by}) : ${L(d.title)} [${d.format.join(', ')}]`),
    lang === 'fr' ? 'Portes humaines — le plan s’arrête là où elles ne sont pas franchies :' : 'Human gates — the plan stops where they are not passed:',
    ...r.gates.map(g => `- ${L(g)}`),
    lang === 'fr' ? 'Jamais :' : 'Never:',
    ...r.never.map(g => `- ${L(g)}`),
    (lang === 'fr' ? 'Limites : ' : 'Limits: ') + L(r.limits),
  ];
  return lines.join('\n');
}
