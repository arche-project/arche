// Chargement et validation du catalogue YAML.
// Loading and validating the YAML catalog.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { validate as validateSchema, type SchemaError } from './schema.js';
import { catalogDir } from './paths.js';
import type { Catalog, Resource, Bundle, Profile, HardwarePreset, AiTier } from './types.js';

export interface ValidationIssue { file: string; message: string }

function readYaml<T>(file: string): T {
  return parse(fs.readFileSync(file, 'utf8')) as T;
}

function makeValidator(schemaFile: string) {
  const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  return (data: unknown): SchemaError[] => validateSchema(schema, data);
}

/** Charge tout le catalogue. Lance une erreur listant les problèmes si `strict`. */
export function loadCatalog(opts: { dir?: string; strict?: boolean } = {}): Catalog & { issues: ValidationIssue[] } {
  const dir = opts.dir ?? catalogDir();
  const issues: ValidationIssue[] = [];

  const validateResource = makeValidator(path.join(dir, 'schema', 'resource.schema.json'));
  const validateProfiles = makeValidator(path.join(dir, 'schema', 'profile.schema.json'));

  const resources: Resource[] = [];
  const resDir = path.join(dir, 'resources');
  for (const f of fs.readdirSync(resDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).sort()) {
    const file = path.join(resDir, f);
    const list = readYaml<Resource[]>(file) ?? [];
    if (!Array.isArray(list)) { issues.push({ file, message: 'top level must be a list' }); continue; }
    list.forEach((r, i) => {
      for (const e of validateResource(r)) issues.push({ file, message: `#${i} (${(r as Resource)?.id ?? '?'}) ${e.path} ${e.message}` });
      resources.push(r);
    });
  }

  const byId = new Map<string, Resource>();
  for (const r of resources) {
    if (byId.has(r.id)) issues.push({ file: resDir, message: `duplicate id ${r.id}` });
    byId.set(r.id, r);
  }
  for (const r of resources) for (const dep of r.depends_on ?? []) {
    if (!byId.has(dep)) issues.push({ file: resDir, message: `${r.id} depends on unknown ${dep}` });
  }
  for (const r of resources) for (const m of runtimeIssues(r)) issues.push({ file: resDir, message: `${r.id}: ${m}` });

  const profilesFile = path.join(dir, 'profiles.yaml');
  const p = readYaml<{ profiles: Profile[]; hardware_presets: HardwarePreset[]; ai_tiers: AiTier[] }>(profilesFile);
  for (const e of validateProfiles(p)) issues.push({ file: profilesFile, message: `${e.path} ${e.message}` });
  for (const t of p.ai_tiers) for (const m of t.models) if (!byId.has(m)) issues.push({ file: profilesFile, message: `ai tier ${t.id} references unknown ${m}` });

  const bundlesFile = path.join(dir, 'bundles.yaml');
  const bundles = fs.existsSync(bundlesFile) ? readYaml<Bundle[]>(bundlesFile) : [];
  for (const b of bundles) for (const id of b.resources) if (!byId.has(id)) issues.push({ file: bundlesFile, message: `bundle ${b.id} references unknown ${id}` });

  if (opts.strict && issues.length) {
    throw new Error('Catalog validation failed:\n' + issues.map(i => `  ${path.relative(dir, i.file)}: ${i.message}`).join('\n'));
  }

  return { resources, byId, profiles: p.profiles, hardware_presets: p.hardware_presets, ai_tiers: p.ai_tiers, bundles, generatedAt: new Date().toISOString(), issues };
}

/** Fermeture transitive des dépendances. */
export function withDependencies(catalog: Catalog, ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    const r = catalog.byId.get(id);
    if (!r) continue;
    out.add(id);
    for (const d of r.depends_on ?? []) stack.push(d);
  }
  return out;
}

/**
 * Règles de l'ADR 0008, vérifiées et non seulement écrites : un logiciel déclare sur quoi il
 * tourne, et un conteneur n'est jamais dans le chemin recommandé — ni `essential`, ni
 * `recommended`, ni visible du profil `novice`. Exigé pour `software` et `toolchain` ; les autres
 * types (ZIM, PDF, modèles…) n'ont pas de runtime.
 *
 * ADR 0008 rules, enforced here rather than merely documented.
 */
export function runtimeIssues(r: Resource): string[] {
  const out: string[] = [];
  const needs = r.type === 'software' || r.type === 'toolchain';
  if (needs && !r.runtime) out.push('runtime manquant (ADR 0008) : static-binary, node, python, jvm, container, source, firmware ou none');
  if (r.runtime === 'container') {
    if (r.priority !== 'optional') out.push(`runtime container ne peut pas être ${r.priority} (ADR 0008) — un démon n'est jamais dans le chemin recommandé`);
    if (r.profiles.includes('novice')) out.push('runtime container ne peut pas figurer dans le profil novice (ADR 0008)');
  }
  if (r.runtime === 'container' && !(r.requires?.tools ?? []).some(t => /docker|podman|skopeo/.test(t))) {
    out.push('runtime container doit déclarer l’outil requis dans requires.tools (docker, podman ou skopeo)');
  }
  return out;
}
