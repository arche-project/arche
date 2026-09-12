// Met en évidence, entre deux états du catalogue, les champs qui décident de CE QU'ON TÉLÉCHARGE
// ET D'OÙ : source.*, checksum.*, size_bytes, license.*, index.{url,sha256,size_bytes}. Un robot
// peut proposer ces changements (catalog-update, zim-build, index-build), jamais les fusionner :
// audit erreur 7, ticket M2-3. Le résultat pose l'étiquette `catalog-sensitive` sur la PR et
// s'affiche en tête de son corps, pour la relecture à deux de CONTRIBUTING.md.
// Highlights the catalog fields that decide what is downloaded and from where. Proposed by robots,
// merged by humans only (audit error 7, M2-3). Drives the `catalog-sensitive` PR label.
//
// Usage : tsx scripts/catalog/sensitive-diff.ts [--base <git-ref|dir>] [--head <dir>]
//                                               [--reports <dir>] [--pr-body <file>]
//   --base     référence git (défaut : HEAD) ou répertoire de fichiers YAML de ressources
//   --head     répertoire de ressources à comparer (défaut : catalog/resources du dépôt)
//   --reports  où écrire sensitive.md / sensitive.json (défaut : .catalog-reports)
//   --pr-body  fichier Markdown dans lequel insérer la section, juste après son titre
// Sortie : `sensitive=true|false` et `count=N` dans $GITHUB_OUTPUT, la section dans
// $GITHUB_STEP_SUMMARY quand ces variables existent. Code de sortie 0 : signaler, pas bloquer.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { CATALOG_DIR, RES_DIR } from './lib.js';

/** Une ressource telle que lue dans un fichier YAML : on ne regarde que `id` et les champs à plat. */
export interface RawResource { id: string; [k: string]: unknown }

export interface SensitiveChange { id: string; field: string; from: unknown; to: unknown }
export interface SensitiveReport {
  /** Champs sensibles modifiés sur une ressource présente des deux côtés. */
  changed: SensitiveChange[];
  /** Ressources ajoutées : une URL et un hachage nouveaux à relire. */
  added: string[];
  /** Ressources retirées : signalé, mais rien de nouveau n'entre dans la base. */
  removed: string[];
  /** Champs non sensibles modifiés (version, checked, status…) : compte seulement, pour contexte. */
  other: number;
  /** Vrai s'il y a au moins un champ sensible modifié ou une ressource ajoutée. */
  sensitive: boolean;
}

/**
 * Préfixes des champs sensibles. `source` en entier (kind, url, mirrors, torrent, magnet, ia_item…
 * tout ce qui dit d'où vient le fichier), `checksum` en entier, `license` en entier (une licence qui
 * change change ce qu'un utilisateur a le droit de copier), `size_bytes` (une chute de taille est un
 * build cassé ou un fichier substitué), et les trois champs de téléchargement du bloc `index`.
 */
export const SENSITIVE_PREFIXES: readonly string[] = ['source.', 'checksum.', 'license.', 'size_bytes', 'index.url', 'index.sha256', 'index.size_bytes'];

export function isSensitiveField(field: string): boolean {
  return SENSITIVE_PREFIXES.some(p => p.endsWith('.') ? field.startsWith(p) : field === p);
}

/** Aplatit une ressource en chemins pointés ; les tableaux sont une feuille (JSON), les null/undefined disparaissent. */
export function flatten(obj: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (obj == null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v == null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) for (const [kk, vv] of flatten(v, prefix + k + '.')) out.set(kk, vv);
    else out.set(prefix + k, JSON.stringify(v));
  }
  return out;
}

/** Compare deux listes de ressources (par `id`, l'ordre ne compte pas). */
export function diffCatalogs(before: readonly RawResource[], after: readonly RawResource[]): SensitiveReport {
  const B = new Map(before.map(r => [r.id, r] as const));
  const A = new Map(after.map(r => [r.id, r] as const));
  const report: SensitiveReport = { changed: [], added: [], removed: [], other: 0, sensitive: false };
  for (const id of B.keys()) if (!A.has(id)) report.removed.push(id);
  for (const [id, a] of A) {
    const b = B.get(id);
    if (!b) { report.added.push(id); continue; }
    const fb = flatten(b), fa = flatten(a);
    for (const field of new Set([...fb.keys(), ...fa.keys()])) {
      const from = fb.get(field), to = fa.get(field);
      if (from === to) continue;
      if (isSensitiveField(field)) report.changed.push({ id, field, from: from === undefined ? null : JSON.parse(from), to: to === undefined ? null : JSON.parse(to) });
      else report.other++;
    }
  }
  report.changed.sort((x, y) => x.id.localeCompare(y.id) || x.field.localeCompare(y.field));
  report.added.sort(); report.removed.sort();
  report.sensitive = report.changed.length > 0 || report.added.length > 0;
  return report;
}

const cell = (v: unknown) => v == null ? '—' : '`' + String(typeof v === 'object' ? JSON.stringify(v) : v).replace(/`/g, "'").slice(0, 120) + '`';

/** La section Markdown mise en tête de la PR (FR + EN, comme le reste des rapports). */
export function renderMarkdown(r: SensitiveReport): string {
  const lines = ['### 🔒 Champs sensibles / sensitive fields (`catalog-sensitive`)', ''];
  if (!r.sensitive) {
    lines.push(`_Aucun champ sensible modifié / no sensitive field changed_ (url, checksum, size, licence, index).${r.removed.length ? ` Ressources retirées / removed: ${r.removed.map(i => '`' + i + '`').join(', ')}.` : ''}`);
  } else {
    lines.push(
      '**Un robot propose, un humain fusionne** : ces champs décident de ce qui est téléchargé et d\'où. Relecture à deux (CONTRIBUTING.md) — ouvrir l\'URL sur la source officielle, recalculer ou recouper le hachage.',
      '**Robots propose, humans merge**: these fields decide what is downloaded and from where. Two-person review (CONTRIBUTING.md) — open the URL at the official source, recompute or cross-check the hash.',
      '');
    if (r.changed.length) {
      lines.push('| id | champ / field | avant / before | après / after |', '|---|---|---|---|');
      for (const c of r.changed) lines.push(`| \`${c.id}\` | \`${c.field}\` | ${cell(c.from)} | ${cell(c.to)} |`);
      lines.push('');
    }
    if (r.added.length) lines.push(`Ressources ajoutées / added (URL et hachage à relire) : ${r.added.map(i => '`' + i + '`').join(', ')}.`, '');
    if (r.removed.length) lines.push(`Ressources retirées / removed : ${r.removed.map(i => '`' + i + '`').join(', ')}.`, '');
  }
  if (r.other) lines.push(`_${r.other} autre(s) champ(s) modifié(s) / other field(s) changed (version, checked, status…) — voir les sections des vérificateurs._`, '');
  return lines.join('\n');
}

/** Insère la section juste après la première ligne du corps de PR (son titre). */
export function insertIntoPrBody(body: string, section: string): string {
  const [title, ...rest] = body.split('\n');
  return [title, '', section, ...rest].join('\n');
}

function readDir(dir: string): RawResource[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).sort().flatMap(f => (parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RawResource[] | null) ?? []);
}

function readGitRef(ref: string, root: string): RawResource[] {
  const rel = path.relative(root, RES_DIR).split(path.sep).join('/');
  const list = execFileSync('git', ['ls-tree', '--name-only', ref, rel + '/'], { cwd: root, encoding: 'utf8' });
  return list.split('\n').filter(f => f.endsWith('.yaml')).sort()
    .flatMap(f => (parse(execFileSync('git', ['show', `${ref}:${f}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })) as RawResource[] | null) ?? []);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

export function main() {
  const root = path.resolve(CATALOG_DIR, '..');
  const base = arg('--base') ?? 'HEAD';
  const head = arg('--head');
  const reports = path.resolve(arg('--reports') ?? path.join(root, '.catalog-reports'));
  const before = fs.existsSync(base) && fs.statSync(base).isDirectory() ? readDir(base) : readGitRef(base, root);
  const after = readDir(head ? path.resolve(head) : RES_DIR);
  const report = diffCatalogs(before, after);
  const md = renderMarkdown(report);
  fs.mkdirSync(reports, { recursive: true });
  fs.writeFileSync(path.join(reports, 'sensitive.md'), md + '\n');
  fs.writeFileSync(path.join(reports, 'sensitive.json'), JSON.stringify(report, null, 2) + '\n');
  const prBody = arg('--pr-body');
  if (prBody && fs.existsSync(prBody)) fs.writeFileSync(prBody, insertIntoPrBody(fs.readFileSync(prBody, 'utf8'), md));
  const count = report.changed.length + report.added.length;
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `sensitive=${report.sensitive}\ncount=${count}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  console.log(`sensitive: ${report.sensitive} (${report.changed.length} champ(s), +${report.added.length} / −${report.removed.length} ressource(s), ${report.other} autre(s))`);
  console.log(md);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
