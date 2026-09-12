// `arche mirror plan <recette>` : combien de paquets, quelle taille, quelles URLs — avant de télécharger.
// How many packages, what size, which URLs — before downloading anything.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parse } from 'yaml';
import { indexUrl, parseIndex, planMirror, validateRecipe, type MirrorRecipe } from '../core/mirror/recipe.js';
import type { PkgIndex } from '../core/mirror/packages.js';
import { t } from '../core/i18n.js';

/** Lit un index distant : `Packages` (texte, éventuellement .gz/.xz côté serveur) ou `APKINDEX.tar.gz`. */
async function fetchIndex(recipe: MirrorRecipe, component: string, arch: string): Promise<string> {
  const url = indexUrl(recipe, component, arch);
  const tryUrls = recipe.type === 'apt' ? [url, `${url}.gz`] : [url];
  let lastErr = '';
  for (const u of tryUrls) {
    const r = await fetch(u, { signal: AbortSignal.timeout(60_000), headers: { 'User-Agent': 'arche-mirror' } });
    if (!r.ok) { lastErr = `HTTP ${r.status} ${u}`; continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (u.endsWith('.gz')) return gunzipSync(buf).toString('utf8');
    if (recipe.type === 'apk') return extractApkIndex(gunzipSync(buf));
    return buf.toString('utf8');
  }
  throw new Error(lastErr || `index introuvable pour ${component}/${arch}`);
}

/** APKINDEX.tar.gz est un tar : on extrait le membre `APKINDEX` sans dépendance (en-têtes de 512 octets). */
export function extractApkIndex(tar: Buffer): string {
  let off = 0;
  while (off + 512 <= tar.length) {
    const name = tar.toString('utf8', off, off + 100).replace(/\0.*$/, '');
    const sizeStr = tar.toString('utf8', off + 124, off + 136).replace(/\0.*$/, '').trim();
    if (!name) break;
    const size = parseInt(sizeStr, 8) || 0;
    const start = off + 512;
    if (name === 'APKINDEX' || name.endsWith('/APKINDEX')) return tar.toString('utf8', start, start + size);
    off = start + Math.ceil(size / 512) * 512;
  }
  throw new Error('APKINDEX absent de l’archive');
}

export async function mirrorPlan(file: string, o: { arch?: string; urls?: string; json?: boolean }) {
  const recipe = parse(fs.readFileSync(file, 'utf8')) as MirrorRecipe;
  const errors = validateRecipe(recipe);
  if (errors.length) { for (const e of errors) console.error(`  ${e}`); process.exitCode = 1; return; }
  const arch = o.arch ?? recipe.architectures[0]!;
  if (!recipe.architectures.includes(arch)) { console.error(t('mirror.bad_arch', { arch, list: recipe.architectures.join(', ') })); process.exitCode = 1; return; }

  const indexes: Record<string, PkgIndex> = {};
  for (const c of recipe.components) {
    process.stdout.write(t('mirror.fetching', { component: c, arch }) + '\n');
    indexes[c] = parseIndex(recipe, await fetchIndex(recipe, c, arch));
  }
  const plan = planMirror(recipe, arch, indexes);
  const gb = plan.result.totalBytes / 1e9;
  if (o.json) { console.log(JSON.stringify({ ...plan, result: { ...plan.result, packages: plan.result.packages.map(p => p.name) } }, null, 2)); }
  else {
    console.log(t('mirror.summary', { n: plan.result.packages.length, roots: recipe.packages.length, gb: gb.toFixed(2), arch }));
    if (recipe.size_estimate_gb && gb > recipe.size_estimate_gb * 2) console.log(t('mirror.bloat', { est: recipe.size_estimate_gb, gb: gb.toFixed(1) }));
    for (const u of plan.result.unresolved) console.log(`  ⚠ ${u.from} → ${u.dep}`);
    if (plan.result.unresolved.length) console.log(t('mirror.unresolved', { n: plan.result.unresolved.length }));
  }
  if (o.urls) {
    fs.mkdirSync(path.dirname(path.resolve(o.urls)), { recursive: true });
    fs.writeFileSync(o.urls, plan.downloads.map(d => `${d.url}${d.sha256 ? `  sha256:${d.sha256}` : ''}`).join('\n') + '\n');
    console.log(t('mirror.urls_written', { file: o.urls, n: plan.downloads.length }));
  }
}
