// Fichier de configuration déclaratif (mode expert) : arche.yaml
// Declarative config file (expert mode): arche.yaml
import fs from 'node:fs';
import { parse } from 'yaml';
import type { PlanOptions, Priority, ProfileId } from './types.js';

export interface ArcheConfig {
  library: string;                 // dossier de la bibliothèque
  profile: ProfileId;
  languages: string[];
  bundles: string[];
  include: string[];
  exclude: string[];
  disk_budget_gb?: number;
  priorities?: Priority[];
  lang?: 'fr' | 'en';
  serve?: { port?: number; kiwix_port?: number; bind?: string };
  ollama?: { host?: string };
}

export const DEFAULT_CONFIG: ArcheConfig = {
  library: './library', profile: 'novice', languages: ['fr', 'en'], bundles: ['core'], include: [], exclude: [],
  serve: { port: 8765, kiwix_port: 8080, bind: '127.0.0.1' },
};

export function loadConfig(file?: string): ArcheConfig {
  if (!file || !fs.existsSync(file)) return { ...DEFAULT_CONFIG };
  const raw = parse(fs.readFileSync(file, 'utf8')) ?? {};
  return { ...DEFAULT_CONFIG, ...raw, serve: { ...DEFAULT_CONFIG.serve, ...(raw.serve ?? {}) } };
}

export function toPlanOptions(c: ArcheConfig): PlanOptions {
  return { profile: c.profile, languages: c.languages, bundles: c.bundles, include: c.include, exclude: c.exclude, diskBudgetGb: c.disk_budget_gb, allowPriorities: c.priorities };
}
