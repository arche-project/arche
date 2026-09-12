// Glanage Wikimedia Commons pour un manifeste visuel : propose des fichiers par vue, avec licence.
// Harvest Wikimedia Commons for a visual manifest: propose files per view, with licence.
//
// Usage : tsx scripts/visuals/commons.ts catalog/visuals/fungus/amanita-phalloides.yaml [--limit 40] [--write]
//
// Ce script PROPOSE (status: candidate). Un humain regarde les images et passe les bonnes en
// `verified` — parce qu'une photo mal étiquetée d'un champignon mortel est pire que pas de photo.
// Sans --write, il affiche seulement ce qu'il ajouterait.

import fs from 'node:fs';
import { parseDocument } from 'yaml';
import { parseImageInfo, guessView, type CommonsFile } from './commons-lib.js';
import { loadViews, type VisualManifest } from '../../src/core/visuals.js';

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error('usage: commons.ts <manifest.yaml> [--limit n] [--write]'); process.exit(2); }
const limit = Number(rest[rest.indexOf('--limit') + 1] || 40);
const write = rest.includes('--write');
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'arche-visuals (https://github.com/arche-project/arche)' };

async function api(params: Record<string, string>): Promise<unknown> {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', ...params })) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Commons HTTP ${r.status}`);
  return r.json();
}

/** Fichiers d'une catégorie Commons (sans récursion : les sous-catégories sont souvent hors sujet). */
async function categoryFiles(category: string, max: number): Promise<string[]> {
  const titles: string[] = [];
  let cont: string | undefined;
  while (titles.length < max) {
    const j = await api({ action: 'query', list: 'categorymembers', cmtitle: `Category:${category}`, cmtype: 'file', cmlimit: '50', ...(cont ? { cmcontinue: cont } : {}) }) as { query?: { categorymembers?: Array<{ title: string }> }; continue?: { cmcontinue?: string } };
    titles.push(...(j.query?.categorymembers ?? []).map(m => m.title));
    cont = j.continue?.cmcontinue;
    if (!cont) break;
  }
  return titles.slice(0, max);
}

async function imageInfo(titles: string[]): Promise<CommonsFile[]> {
  const out: CommonsFile[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const j = await api({ action: 'query', prop: 'imageinfo|categories', iiprop: 'url|sha1|size|mime|extmetadata', iiextmetadatafilter: 'LicenseShortName|License|Artist|ImageDescription', clshow: '!hidden', cllimit: '20', titles: titles.slice(i, i + 50).join('|') });
    out.push(...parseImageInfo(j));
  }
  return out;
}

async function main(): Promise<void> {
  const doc = parseDocument(fs.readFileSync(file, 'utf8'));
  const m = doc.toJS() as VisualManifest;
  const tax = loadViews();
  if (!m.commons_category) { console.error('manifest sans commons_category : rien à glaner'); process.exit(1); }
  const titles = await categoryFiles(m.commons_category, limit);
  const files = await imageInfo(titles);
  const existing = new Set(Object.values(m.views ?? {}).flatMap(v => (v.files ?? []).map(f => f.file)));
  let added = 0; let skippedLicense = 0; let unplaced = 0;
  const additions: Array<{ view: string; entry: Record<string, unknown> }> = [];
  for (const f of files) {
    if (existing.has(f.title)) continue;
    if (!f.free) { skippedLicense++; continue; }
    if (f.mime && !/^image\/(jpeg|png|webp|svg)/.test(f.mime)) continue;
    const view = guessView(m.kind, f);
    if (!view || !tax.kinds[m.kind]?.views[view]) { unplaced++; continue; }
    additions.push({ view, entry: {
      file: f.title, url: f.url, source: f.descriptionUrl, license: f.license, author: f.author ?? null,
      sha256: null, provenance: /illustration|plate|drawing/i.test(f.description ?? '') ? 'plate' : 'photo',
      status: 'candidate', caption: { fr: f.description ?? '', en: f.description ?? '' },
    } });
    added++;
  }
  console.log(`${m.id} : ${files.length} fichiers lus, ${added} candidats placés, ${skippedLicense} refusés (licence non libre), ${unplaced} sans vue devinée`);
  for (const a of additions) console.log(`  ${a.view.padEnd(14)} ${String(a.entry['license']).padEnd(14)} ${a.entry['file']}`);
  if (!write) { console.log('\n(--write pour les ajouter au manifeste en status: candidate)'); return; }
  for (const a of additions) {
    const p = ['views', a.view];
    if (!doc.hasIn(p)) doc.setIn(p, { files: [] });
    const arr = doc.getIn([...p, 'files']) as { add(v: unknown): void } | undefined;
    if (arr && 'add' in arr) arr.add(a.entry); else doc.setIn([...p, 'files'], [a.entry]);
  }
  fs.writeFileSync(file, doc.toString({ lineWidth: 0 }));
  console.log(`écrit : ${file} — relire les images et passer les bonnes en status: verified`);
}
main().catch(e => { console.error(e); process.exit(1); });
