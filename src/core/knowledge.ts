// Provenance ou rien (audit, décision 2 ; M4-1) : chaque valeur numérique de knowledge/*.yaml porte
// `source: {resource, path, quote}` — ou, en période de grâce, `unsourced: true`, explicite et compté.
// Une déclaration couvre les valeurs du bloc qui la porte, sauf déclaration plus proche. `verified`
// n'est jamais écrit : `arche knowledge verify` le calcule en ouvrant les shards installés (le locator
// existe, la citation y figure). eval.yaml a son propre schéma et ses propres locators (M1-6).
// Provenance or nothing: every number in knowledge/ carries a locator (or an explicit, counted grace
// marker); `verified` is computed against installed shards, never hand-written.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { knowledgeDir } from './paths.js';
import { corpusFile, readCorpusArticle } from './rag/retrieve.js';
import { openCorpus } from './rag/sqlite.js';

export interface KnowledgeSource { resource: string; path: string; quote: string; where?: string }
export interface KnowledgeValue { file: string; path: string; value: number; /** Le bloc qui déclare la provenance (vide : aucune). */ by: string; source?: KnowledgeSource; unsourced: boolean }
export interface KnowledgeIssue { file: string; path: string; message: string }
/** Une source déclarée, et ce que les shards en disent : verified (article et citation trouvés), mismatch (citation absente), no-article, no-shard (corpus non installé). */
export interface SourceCheck extends KnowledgeSource { file: string; at: string; values: number; state: 'verified' | 'mismatch' | 'no-article' | 'no-shard' | 'unchecked' }
/** `unsourced` = sous une grâce explicite ; une valeur sans rien est un problème (`issues`), pas une grâce. */
export interface KnowledgeReport { values: number; sourced: number; unsourced: number; files: Record<string, { values: number; sourced: number; unsourced: number }>; issues: KnowledgeIssue[]; sources: SourceCheck[]; verified: number; failed: number; unresolved: number }

/** Clés de tête qui ne sont pas des faits : version, dates, défauts de calcul, bibliographie, alias. */
const META = new Set(['version', 'updated', 'climate', 'uncertainty', 'defaults', 'sources', 'aliases']), PROV = new Set(['source', 'unsourced', 'verified']), MIN_QUOTE = 12;
export const knowledgeFiles = (dir = knowledgeDir()): string[] => fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f) && f !== 'eval.yaml').sort().map(f => path.join(dir, f));

function walk(node: unknown, file: string, at: string, scope: Pick<KnowledgeValue, 'by' | 'source' | 'unsourced'> | null, out: { values: KnowledgeValue[]; issues: KnowledgeIssue[] }): void {
  if (typeof node === 'number') {
    out.values.push({ file, path: at, value: node, by: '', unsourced: false, ...scope });
    if (!scope) out.issues.push({ file, path: at, message: 'valeur sans provenance : ajoutez `source: {resource, path, quote}` ou `unsourced: true` sur la valeur ou sur un bloc qui la contient' });
    return;
  }
  if (Array.isArray(node)) { node.forEach((x, i) => walk(x, file, `${at}[${i}]`, scope, out)); return; }
  if (!node || typeof node !== 'object') return;
  const o = node as Record<string, unknown>, issue = (message: string) => out.issues.push({ file, path: at || '(racine)', message });
  if ('verified' in o) issue('`verified` est calculé par `arche knowledge verify`, jamais écrit à la main');
  let s = scope;
  if ('source' in o || 'unsourced' in o) {
    const src = o['source'] as KnowledgeSource | undefined;
    if (!at) issue('la provenance se déclare sur une valeur ou un bloc, pas à la racine du fichier');
    else if ('source' in o && 'unsourced' in o) issue('`source` et `unsourced` s’excluent');
    else if ('unsourced' in o && o['unsourced'] !== true) issue('`unsourced` vaut `true` ou n’est pas là');
    else if (src && (typeof src !== 'object' || typeof src.resource !== 'string' || typeof src.path !== 'string' || typeof src.quote !== 'string' || src.quote.trim().length < MIN_QUOTE))
      issue(`\`source\` = { resource: <id du catalogue>, path: <article dans le shard>, quote: <citation, ≥ ${MIN_QUOTE} caractères> }`);
    s = { by: at, ...(src && typeof src === 'object' ? { source: src } : {}), unsourced: o['unsourced'] === true };
  }
  for (const [k, v] of Object.entries(o)) if (!PROV.has(k) && !(!at && META.has(k))) walk(v, file, at ? `${at}.${k}` : k, s, out);
}

/** Lit les fichiers de connaissance et applique la règle ; `catalogIds` ajoute « la ressource existe ». Aucun shard ouvert ici. */
export function scanKnowledge(o: { dir?: string; catalogIds?: Set<string> } = {}): KnowledgeReport {
  const out = { values: [] as KnowledgeValue[], issues: [] as KnowledgeIssue[] }, files: KnowledgeReport['files'] = {}, sources = new Map<string, SourceCheck>();
  for (const f of knowledgeFiles(o.dir)) {
    const name = path.basename(f), before = out.values.length;
    walk(parse(fs.readFileSync(f, 'utf8')), name, '', null, out);
    const vs = out.values.slice(before);
    files[name] = { values: vs.length, sourced: vs.filter(v => v.source).length, unsourced: vs.filter(v => v.unsourced).length };
    for (const v of vs) if (v.source) {
      const key = `${name}:${v.by}`, prev = sources.get(key);
      if (prev) { prev.values++; continue; }
      sources.set(key, { ...v.source, file: name, at: v.by, values: 1, state: 'unchecked' });
      if (o.catalogIds && !o.catalogIds.has(v.source.resource)) out.issues.push({ file: name, path: v.by, message: `source.resource ${v.source.resource} n’est pas dans le catalogue` });
    }
  }
  const sum = (k: 'values' | 'sourced' | 'unsourced') => Object.values(files).reduce((n, f) => n + f[k], 0);
  return { values: sum('values'), sourced: sum('sourced'), unsourced: sum('unsourced'), files, issues: out.issues, sources: [...sources.values()], verified: 0, failed: 0, unresolved: 0 };
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Calcule `verified` : pour chaque source, le shard installé (`<lib>/index/<resource>.arche.sqlite`), l'article, la citation (casse, accents et espaces ignorés). */
export function verifyKnowledge(lib: string, report = scanKnowledge()): KnowledgeReport {
  const cache = new Map<string, Map<string, string | null>>();
  for (const s of report.sources) {
    const file = corpusFile(lib, s.resource);
    if (!file) { s.state = 'no-shard'; continue; }
    const articles = cache.get(file) ?? new Map<string, string | null>(); cache.set(file, articles);
    if (!articles.has(s.path)) { const db = openCorpus(file, { readonly: true }); try { articles.set(s.path, readCorpusArticle(db, s.path)?.text ?? null); } finally { db.close(); } }
    const text = articles.get(s.path);
    s.state = text === null ? 'no-article' : norm(text!).includes(norm(s.quote)) ? 'verified' : 'mismatch';
  }
  const n = (...states: SourceCheck['state'][]) => report.sources.filter(s => states.includes(s.state)).length;
  return Object.assign(report, { verified: n('verified'), failed: n('mismatch', 'no-article'), unresolved: n('no-shard') });
}

/** La ligne du README (bloc `<!-- knowledge -->`) : N valeurs sourcées / total. */
export const knowledgeSummary = (r: KnowledgeReport, fr = true): string =>
  fr ? `\`knowledge/\` : **${r.sourced} valeurs sourcées / ${r.values}** (${r.unsourced} en période de grâce \`unsourced: true\`)`
    : `\`knowledge/\`: **${r.sourced} sourced values / ${r.values}** (${r.unsourced} under the \`unsourced: true\` grace period)`;

/** Le rapport lisible de `arche knowledge verify`. */
export function renderKnowledge(r: KnowledgeReport, fr = true): string {
  const lines = [knowledgeSummary(r, fr).replace(/\*\*/g, '')];
  for (const [f, v] of Object.entries(r.files)) lines.push(`  ${f.padEnd(14)} ${String(v.values).padStart(4)} ${fr ? 'valeurs' : 'values'} · ${v.sourced} ${fr ? 'sourcées' : 'sourced'} · ${v.unsourced} unsourced`);
  lines.push(fr ? `sources : ${r.sources.length} déclarées · ${r.verified} vérifiées · ${r.failed} fausses · ${r.unresolved} sans shard installé` : `sources: ${r.sources.length} declared · ${r.verified} verified · ${r.failed} failed · ${r.unresolved} without an installed shard`);
  for (const s of r.sources) if (s.state !== 'verified') lines.push(`  ${s.state === 'no-shard' ? '∅' : s.state === 'unchecked' ? '?' : '✗'} ${s.file}:${s.at} → ${s.resource}/${s.path} (${s.state})`);
  for (const i of r.issues) lines.push(`  ✗ ${i.file}:${i.path} — ${i.message}`);
  return lines.join('\n');
}
