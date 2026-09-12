// Outils communs aux scripts de mise à jour : lecture/écriture YAML en préservant les commentaires,
// journal des changements, helpers HTTP.
// Shared helpers for updater scripts: comment-preserving YAML round-trip, change log, HTTP helpers.
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument, type Document } from 'yaml';
import type { Resource } from '../../src/core/types.js';

export const CATALOG_DIR = path.resolve(process.env.ARCHE_CATALOG_DIR ?? path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'catalog'));
export const RES_DIR = path.join(CATALOG_DIR, 'resources');

export interface Change { id: string; field: string; from: unknown; to: unknown; note?: string }
export const changes: Change[] = [];

export interface ResourceFile { file: string; doc: Document; items: Resource[] }

/** Charge chaque fichier de ressources comme Document YAML (pour réécrire sans perdre les commentaires). */
export function loadResourceFiles(): ResourceFile[] {
  return fs.readdirSync(RES_DIR).filter(f => f.endsWith('.yaml')).sort().map(f => {
    const file = path.join(RES_DIR, f);
    const doc = parseDocument(fs.readFileSync(file, 'utf8'));
    return { file, doc, items: doc.toJS() as Resource[] };
  });
}

/** Modifie un champ (chemin en points) d'une ressource dans son Document, et journalise. */
export function setField(rf: ResourceFile, index: number, fieldPath: string, value: unknown, note?: string) {
  const id = rf.items[index].id;
  const keys = fieldPath.split('.');
  const before = rf.doc.getIn([index, ...keys], true);
  const beforeVal = before && typeof before === 'object' && 'value' in (before as object) ? (before as { value: unknown }).value : before;
  if (JSON.stringify(beforeVal) === JSON.stringify(value)) return;
  rf.doc.setIn([index, ...keys], value);
  changes.push({ id, field: fieldPath, from: beforeVal ?? null, to: value, note });
}

/**
 * Marque la ressource comme vérifiée aujourd'hui. À appeler uniquement quand l'amont a réellement
 * répondu — une erreur réseau n'est pas une vérification. C'est ce champ qui nourrit la mesure de
 * fraîcheur (`arche catalog freshness`) ; sans lui, « souvent mis à jour » reste une intention.
 */
export function markChecked(rf: ResourceFile, index: number) {
  const before = rf.doc.getIn([index, 'checked']);
  rf.doc.setIn([index, 'checked'], today());
  if (before !== today()) rf.items[index].checked = today();
}

export function saveResourceFiles(files: ResourceFile[]) {
  for (const rf of files) fs.writeFileSync(rf.file, rf.doc.toString({ lineWidth: 0 }));
}

export function writeReport(name: string) {
  const dir = path.join(CATALOG_DIR, '..', '.catalog-reports');
  fs.mkdirSync(dir, { recursive: true });
  const md = changes.length
    ? ['| id | champ | avant | après | note |', '|---|---|---|---|---|', ...changes.map(c => `| ${c.id} | ${c.field} | ${fmt(c.from)} | ${fmt(c.to)} | ${c.note ?? ''} |`)].join('\n')
    : '_Aucun changement / no change._';
  fs.writeFileSync(path.join(dir, `${name}.md`), md + '\n');
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(changes, null, 2));
  console.log(`${name}: ${changes.length} change(s)`);
}
const fmt = (v: unknown) => v == null ? '—' : String(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 80);

export function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': 'arche-catalog-updater', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export async function head(url: string): Promise<{ ok: boolean; status: number; size?: number; lastModified?: string }> {
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(30000), headers: method === 'GET' ? { Range: 'bytes=0-0' } : {} });
      if (r.status === 405 && method === 'HEAD') continue;
      const cr = r.headers.get('content-range');
      const size = cr ? Number(cr.split('/')[1]) : (r.headers.get('content-length') ? Number(r.headers.get('content-length')) : undefined);
      return { ok: r.ok, status: r.status, size, lastModified: r.headers.get('last-modified') ?? undefined };
    } catch { if (method === 'GET') return { ok: false, status: 0 }; }
  }
  return { ok: false, status: 0 };
}

export const today = () => new Date().toISOString().slice(0, 10);
