// Manifestes visuels : un concept, ses vues requises, les fichiers qui les couvrent — et la mesure.
// Visual manifests: a concept, its required views, the files covering them — and the metric.
//
// Le problème « il faut des milliers d'images » se résout comme la fraîcheur : par une liste finie
// (knowledge/views.yaml), une déclaration par concept (catalog/visuals/**/*.yaml), et un chiffre.
// Deux règles dures, vérifiées ici :
//   1. une vue diagnostique n'admet que photo, micrographie ou planche réelle — jamais `generated` ;
//   2. tout fichier porte licence, auteur et source — sans ça il n'entre pas.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { knowledgeDir, catalogDir } from './paths.js';
import type { I18n } from './types.js';

export type Provenance = 'photo' | 'micrograph' | 'plate' | 'drawing' | 'render' | 'generated';

export interface ViewSpec { label: I18n; required: boolean; diagnostic: boolean }
export interface ViewsTaxonomy {
  version: number;
  kinds: Record<string, { label: I18n; views: Record<string, ViewSpec> }>;
  provenance: Record<Provenance, { label: I18n; diagnostic_ok: boolean }>;
}

export interface VisualFile {
  /** Titre Commons (`File:…`) ou nom de fichier local. */
  file: string;
  url?: string | null;
  source: string;
  license: string;
  author?: string;
  sha256?: string | null;
  provenance: Provenance;
  caption?: I18n;
  /** Résolution de l'URL/sha256 faite par `arche visuals fetch`. */
  status?: 'candidate' | 'verified' | 'rejected';
}

export interface VisualManifest {
  id: string;
  kind: string;
  names: I18n;
  latin?: string;
  wikidata?: string;
  commons_category?: string;
  /** Concepts à montrer côte à côte (sosies). */
  lookalikes?: string[];
  views: Record<string, { search?: string[]; files: VisualFile[] }>;
  notes?: I18n;
}

let taxonomy: ViewsTaxonomy | null = null;
export function loadViews(): ViewsTaxonomy {
  if (taxonomy) return taxonomy;
  taxonomy = parse(fs.readFileSync(path.join(knowledgeDir(), 'views.yaml'), 'utf8')) as ViewsTaxonomy;
  return taxonomy;
}

export const visualsDir = (): string => path.join(catalogDir(), 'visuals');

export function loadManifests(dir = visualsDir()): Array<{ file: string; manifest: VisualManifest }> {
  if (!fs.existsSync(dir)) return [];
  const out: Array<{ file: string; manifest: VisualManifest }> = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith('.yaml')) out.push({ file: p, manifest: parse(fs.readFileSync(p, 'utf8')) as VisualManifest });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

const FREE_LICENSES = /^(CC0|CC-BY(-SA)?(-[0-9.]+)?|PD|Public Domain|GFDL|MIT|Apache-2\.0)$/i;

/** Problèmes d'un manifeste : structure, règles de provenance, licence. */
export function manifestIssues(m: VisualManifest, tax: ViewsTaxonomy = loadViews()): string[] {
  const out: string[] = [];
  if (!m.id || !/^[a-z0-9][a-z0-9-]+$/.test(m.id)) out.push('id manquant ou invalide');
  const kind = tax.kinds[m.kind];
  if (!kind) { out.push(`kind inconnu : ${m.kind} (${Object.keys(tax.kinds).join(', ')})`); return out; }
  if (!m.names?.fr || !m.names?.en) out.push('names.fr et names.en requis');
  for (const [view, v] of Object.entries(m.views ?? {})) {
    const spec = kind.views[view];
    if (!spec) { out.push(`vue inconnue pour ${m.kind} : ${view}`); continue; }
    for (const f of v.files ?? []) {
      if (!f.file) out.push(`${view}: fichier sans nom`);
      if (!f.source) out.push(`${view}/${f.file}: source manquante (page d'origine)`);
      if (!f.license) out.push(`${view}/${f.file}: licence manquante`);
      else if (!FREE_LICENSES.test(f.license)) out.push(`${view}/${f.file}: licence ${f.license} non redistribuable (NC/ND/inconnue)`);
      const prov = tax.provenance[f.provenance];
      if (!prov) out.push(`${view}/${f.file}: provenance inconnue ${String(f.provenance)}`);
      else if (spec.diagnostic && !prov.diagnostic_ok) out.push(`${view}/${f.file}: vue DIAGNOSTIQUE avec provenance ${f.provenance} — interdit (on n'identifie pas une amanite sur un dessin)`);
    }
  }
  return out;
}

export interface Coverage {
  id: string;
  kind: string;
  requiredTotal: number;
  requiredCovered: number;
  /** Vues requises sans aucun fichier vérifié. */
  missing: string[];
  /** Vues requises couvertes uniquement par des candidats non vérifiés. */
  pendingOnly: string[];
  files: number;
  verified: number;
}

/** Couverture d'un concept : vues requises couvertes par au moins un fichier vérifié. */
export function coverageOf(m: VisualManifest, tax: ViewsTaxonomy = loadViews()): Coverage {
  const kind = tax.kinds[m.kind];
  const required = kind ? Object.entries(kind.views).filter(([, v]) => v.required).map(([k]) => k) : [];
  const missing: string[] = []; const pendingOnly: string[] = [];
  let files = 0; let verified = 0;
  for (const v of Object.values(m.views ?? {})) for (const f of v.files ?? []) { files++; if ((f.status ?? 'candidate') === 'verified') verified++; }
  for (const view of required) {
    const fl = m.views?.[view]?.files ?? [];
    const ok = fl.filter(f => (f.status ?? 'candidate') === 'verified' && f.status !== 'rejected');
    if (ok.length) continue;
    if (fl.some(f => f.status !== 'rejected')) pendingOnly.push(view); else missing.push(view);
  }
  return { id: m.id, kind: m.kind, requiredTotal: required.length, requiredCovered: required.length - missing.length - pendingOnly.length, missing, pendingOnly, files, verified };
}

/** Résumé global, par domaine. */
export function summarize(covs: readonly Coverage[]): { concepts: number; required: number; covered: number; pct: number; byKind: Record<string, { concepts: number; required: number; covered: number }> } {
  const byKind: Record<string, { concepts: number; required: number; covered: number }> = {};
  let required = 0; let covered = 0;
  for (const c of covs) {
    required += c.requiredTotal; covered += c.requiredCovered;
    const k = byKind[c.kind] ?? { concepts: 0, required: 0, covered: 0 };
    k.concepts++; k.required += c.requiredTotal; k.covered += c.requiredCovered; byKind[c.kind] = k;
  }
  return { concepts: covs.length, required, covered, pct: required ? Math.round((covered / required) * 100) : 100, byKind };
}
