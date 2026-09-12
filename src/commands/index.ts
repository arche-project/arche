// `arche index …` : construire, ajouter, lister, récupérer les corpus (ADR 0013, 0014).
//   build <resource-id> [--source <fichier|dossier>]   — la base SQLite d'une ressource du catalogue (CI ou local)
//   add <fichier|dossier> [--id <nom>]                  — vos propres PDF, EPUB, Markdown → une base, texte compris
//   list                                                — ce qui est installé
//   fetch [ids…]                                        — télécharge les shards publiés des ressources installées
//   estimate <resource-id>                              — taille de la base et temps d'embedding, avant de lancer
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadCatalog } from '../core/catalog.js';
import { loadConfig } from '../core/config.js';
import { libraryDir } from '../core/paths.js';
import { loadState } from '../core/state.js';
import { findBinary } from '../core/supervisor.js';
import { getLang } from '../core/i18n.js';
import { bytes } from '../core/format.js';
import { Embedder, EMBED_MODELS, DEFAULT_EMBED_MODEL } from '../core/rag/embed.js';
import { extractSource, sourceKind } from '../core/rag/extract.js';
import { buildShard, compressZstd, estimateCorpus, type BuildResult, type CorpusMeta, type SizeEstimate } from '../core/rag/build.js';
import { openCorpus, readMeta } from '../core/rag/sqlite.js';
import { listCorpora } from '../core/rag/retrieve.js';
import { downloadFile } from '../core/downloader.js';
import { estimateStep, formatDuration } from '../core/compute.js';
import { detectHardware } from '../core/hardware.js';

interface Common { library?: string; config?: string; model?: string; ollamaHost?: string; json?: boolean; /** `--no-vectors` : FTS5 seul, sans Ollama (CI, machine sans modèle) ; vecteurs ajoutables ensuite. */ vectors?: boolean }

function libOf(o: Common): string { const cfg = loadConfig(o.config); return libraryDir(o.library ?? cfg.library); }
const indexDir = (lib: string) => path.join(lib, 'index');
const fmtBytes = (n: number) => n < 1e6 ? `${Math.round(n / 1e3)} Ko` : bytes(n);

async function embedderFor(o: Common): Promise<Embedder | undefined> {
  if (o.vectors === false) return undefined;
  const e = new Embedder({ model: o.model ?? DEFAULT_EMBED_MODEL, ...(o.ollamaHost ? { host: o.ollamaHost } : {}) });
  const c = await e.check();
  if (!c.ok) throw new Error(`embeddings : ${c.reason}`);
  return e;
}

const progress = (lang: 'fr' | 'en') => {
  let last = 0;
  return (p: { phase: string; articles: number; chunks: number; done: number }) => {
    const now = Date.now();
    if (p.phase !== 'write' && now - last < 2000) return;
    last = now;
    process.stderr.write(`\r${p.phase === 'extract' ? (lang === 'fr' ? 'extraction' : 'extracting') : p.phase === 'embed' ? 'embedding' : (lang === 'fr' ? 'écriture' : 'writing')} : ${p.articles} ${lang === 'fr' ? 'articles' : 'articles'}, ${p.chunks} chunks${p.phase === 'embed' ? ` — ${p.done}/${p.chunks}` : ''}          `);
    if (p.phase === 'write') process.stderr.write('\n');
  };
};

/** sha256 d'un fichier source (pas d'un dossier, pas au-delà de 4 Go) : la base ne vaut que pour cette version. */
const sha256Of = (src: string): string | null => fs.existsSync(src) && fs.statSync(src).isFile() && fs.statSync(src).size < 4 * 1024 ** 3 ? createHash('sha256').update(fs.readFileSync(src)).digest('hex') : null;

function report(lang: 'fr' | 'en', res: BuildResult, zst: ReturnType<typeof compressZstd> | undefined) {
  console.log(`${res.file}\n  ${res.articles} articles · ${res.chunks} chunks · ${fmtBytes(res.bytes)} · ${res.dims ? `${res.model} (${res.dims}d)` : 'FTS5'} · sha256 ${res.sha256.slice(0, 12)}…${res.skipped ? ` · ${res.skipped} ${lang === 'fr' ? 'articles vides ignorés' : 'empty articles skipped'}` : ''}${res.resumed.chunks ? ` · ${lang === 'fr' ? 'repris' : 'resumed'} (${res.resumed.chunks} chunks ${lang === 'fr' ? 'déjà écrits' : 'already written'})` : ''}`);
  if (zst) console.log(`${zst.file}\n  ${fmtBytes(zst.bytes)} · sha256 ${zst.sha256.slice(0, 12)}…`);
  else if (zst === null) console.log(lang === 'fr' ? '  (zstd absent : pas de .zst — installez zstd ou passez --no-compress)' : '  (zstd not found: no .zst — install zstd or pass --no-compress)');
}

/** La base d'une ressource du catalogue : source = son fichier installé (ZIM…) ou `--source`. Licence et langues héritées du catalogue. */
export async function indexBuild(id: string, o: Common & { source?: string; out?: string; limit?: string; compress?: boolean }) {
  const lang = getLang();
  const lib = libOf(o);
  const cat = loadCatalog({ strict: false });
  const r = cat.byId.get(id);
  if (!r) throw new Error(`ressource inconnue : ${id}`);
  let src = o.source;
  if (!src) {
    const e = loadState(lib).installed[id];
    if (!e) throw new Error(`${id} n'est pas installée — --source <fichier|dossier> ou arche download ${id}`);
    src = path.join(lib, e.path);
  }
  const zimdump = findBinary(lib, 'zimdump') ?? 'zimdump';
  const pdftotext = findBinary(lib, 'pdftotext') ?? 'pdftotext';
  const emb = await embedderFor(o);
  const out = o.out ?? path.join(indexDir(lib), `${id}.arche.sqlite`);
  const meta: CorpusMeta = { license_spdx: r.license.spdx, license_redistribution: r.license.redistribution ?? 'unclear', languages: r.languages, title: r.name[lang], source_kind: sourceKind(src) ?? 'dir', source_sha256: sha256Of(src) };
  const res = await buildShard({
    resourceId: id, embedder: emb, out, meta,
    articles: extractSource(src, { zimdump, pdftotext, onError: (f, m) => process.stderr.write(`\n${f} : ${m}\n`) }),
    onProgress: progress(lang), ...(o.limit ? { limit: Number(o.limit) } : {}),
  });
  const zst = o.compress === false ? undefined : compressZstd(out);
  if (o.json) { console.log(JSON.stringify({ ...res, ...(zst ? { zst } : {}) }, null, 2)); return; }
  report(lang, res, zst);
}

/** Vos propres documents : PDF, EPUB, Markdown, dossier → une base au même format, jamais publiée (pas de .zst). */
export async function indexAdd(src: string, o: Common & { id?: string }) {
  const lang = getLang();
  const lib = libOf(o);
  if (!fs.existsSync(src)) throw new Error(`introuvable : ${src}`);
  const kind = sourceKind(src);
  if (!kind) throw new Error(`type non géré : ${src} (pdf, epub, md, html, txt, dossier)`);
  const id = 'user-' + (o.id ?? path.basename(src).replace(/\.[^.]+$/, '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const pdftotext = findBinary(lib, 'pdftotext') ?? 'pdftotext';
  const emb = await embedderFor(o);
  const res = await buildShard({
    resourceId: id, embedder: emb, out: path.join(indexDir(lib), `${id}.arche.sqlite`),
    meta: { license_spdx: 'NOASSERTION', license_redistribution: 'forbidden', languages: ['mul'], title: path.basename(src), source_kind: kind, source_sha256: sha256Of(src) },
    articles: extractSource(src, { pdftotext, onError: (f, m) => process.stderr.write(`\n${f} : ${m}\n`) }), onProgress: progress(lang),
  });
  console.log(`${lang === 'fr' ? 'ajouté' : 'added'} : ${id} — ${res.articles} articles, ${res.chunks} chunks, ${fmtBytes(res.bytes)} → ${res.file}`);
  console.log(lang === 'fr' ? 'Le texte est dans la base (FTS5 + vecteurs) ; `search` la lit dès maintenant, et sqlite3 seul aussi.' : 'The text is inside the database (FTS5 + vectors); `search` reads it right away, and so does sqlite3 alone.');
}

export function indexList(o: Common) {
  const lang = getLang();
  const lib = libOf(o);
  const bases = listCorpora(lib);
  if (!bases.length) { console.log(lang === 'fr' ? `rien dans ${indexDir(lib)} — arche index fetch, build ou add` : `nothing in ${indexDir(lib)} — arche index fetch, build or add`); return; }
  for (const f of bases) {
    let db; try { db = openCorpus(f, { readonly: true }); } catch { db = openCorpus(f); } // une base interrompue a un journal à rejouer : lecture seule refusée
    const m = readMeta(db);
    const models = (db.prepare('SELECT model, dims FROM vectors ORDER BY model').all() as Array<{ model: string; dims: number }>).map(v => `${v.model} ${v.dims}d`).join(', ');
    db.close();
    console.log(`${(m['resource_id'] ?? path.basename(f)).padEnd(36)} ${String(m['chunks'] ?? '?').padStart(8)} chunks  ${models || 'FTS5'}  ${m['built_at']?.slice(0, 10) ?? (lang === 'fr' ? 'INCOMPLET (reprendre : index build)' : 'INCOMPLETE (resume: index build)')}  ${m['license_spdx'] ?? ''}`);
  }
}

/** Télécharge les shards publiés (bloc `index` du catalogue) des ressources installées, ou des ids donnés. */
export async function indexFetch(ids: string[], o: Common & { all?: boolean }) {
  const lang = getLang();
  const lib = libOf(o);
  const cat = loadCatalog({ strict: false });
  const state = loadState(lib);
  const targets = ids.length ? ids : Object.keys(state.installed);
  fs.mkdirSync(indexDir(lib), { recursive: true });
  let got = 0, missing = 0;
  for (const id of targets) {
    const r = cat.byId.get(id);
    if (!r?.index?.url) { missing++; if (ids.length) console.log(`${id} : ${lang === 'fr' ? 'pas de shard publié' : 'no published shard'}`); continue; }
    // M1-10 publie et installe le .zst (décompression) ; d'ici là le fichier est posé tel quel, au nom du corpus.
    const dest = path.join(indexDir(lib), `${id}.arche.sqlite${r.index.url.endsWith('.zst') ? '.zst' : ''}`);
    if (fs.existsSync(dest) && r.index.sha256 && createHash('sha256').update(fs.readFileSync(dest)).digest('hex') === r.index.sha256) { console.log(`${id} : ${lang === 'fr' ? 'déjà à jour' : 'up to date'}`); continue; }
    process.stdout.write(`${id} : ${lang === 'fr' ? 'téléchargement' : 'downloading'} ${r.index.url}\n`);
    await downloadFile(r.index.url, dest, { ...(r.index.size_bytes ? { expectedSize: r.index.size_bytes } : {}) });
    if (r.index.sha256) {
      const h = createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
      if (h !== r.index.sha256) { fs.rmSync(dest); throw new Error(`${id} : sha256 inattendu (${h.slice(0, 12)}…) — shard corrompu ou catalogue en retard`); }
    }
    got++;
  }
  console.log(`${got} ${lang === 'fr' ? 'shard(s) récupéré(s)' : 'shard(s) fetched'}${missing ? `, ${missing} ${lang === 'fr' ? 'sans shard publié (index-build.yml ne les a pas encore construits)' : 'without a published shard (index-build.yml has not built them yet)'}` : ''}`);
}

/**
 * Ce que `build` produira ici : la taille de la base (texte + FTS5 mesurés sur une base en mémoire,
 * vecteurs int8 comptés) et le temps d'embedding de la machine. Sans source lisible (ZIM non
 * installé, ou ZIM tout court : le vider pour estimer coûterait autant que construire), un ordre de
 * grandeur d'après la taille : ~350 000 chunks et ~1,1 Ko de texte par chunk par Go, FTS5 ≈ 0,6 × le texte.
 */
export async function indexEstimate(id: string, o: Common & { source?: string }) {
  const lang = getLang();
  const lib = libOf(o);
  const cat = loadCatalog({ strict: false });
  const r = cat.byId.get(id);
  const src = o.source ?? (loadState(lib).installed[id] ? path.join(lib, loadState(lib).installed[id]!.path) : undefined);
  const model = o.model ?? DEFAULT_EMBED_MODEL;
  const dims = EMBED_MODELS[model]?.dims ?? 1024;
  let est: SizeEstimate, how: 'exact' | 'sampled' | 'heuristic' = 'heuristic';
  if (src && fs.existsSync(src) && sourceKind(src) && sourceKind(src) !== 'zim') {
    est = await estimateCorpus(extractSource(src, { pdftotext: findBinary(lib, 'pdftotext') ?? 'pdftotext' }), { resourceId: id, dims });
    how = est.sampled ? 'sampled' : 'exact';
  } else {
    const sizeGb = src && fs.existsSync(src) ? fs.statSync(src).size / 1e9 : (r?.size_estimate_gb ?? 1);
    const chunks = Math.round(sizeGb * 350_000), text_bytes = chunks * 1100, sqlite_text_bytes = Math.round(text_bytes * 1.6), vectors_bytes = chunks * (dims + 12);
    est = { articles: Math.round(chunks / 8), chunks, text_bytes, sqlite_text_bytes, vectors_bytes, sqlite_bytes: sqlite_text_bytes + vectors_bytes, zst_bytes: Math.round(sqlite_text_bytes / 5 + vectors_bytes * 0.95), sampled: false };
  }
  const hw = await detectHardware(lib, { skipOnlineCheck: true });
  const e = estimateStep({ model: { id: model, size_gb: 1.2, total_b: 0.57 }, prompt_tokens: est.chunks * 300, output_tokens: 0 }, { ram_gb: hw.ram_gb, vram_gb: hw.vram_gb });
  if (o.json) { console.log(JSON.stringify({ id, how, model, dims, ...est, embed_s: e.prefill_s }, null, 2)); return; }
  const n = (x: number) => x.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');
  const basis = { fr: { exact: 'mesuré sur la source', sampled: 'mesuré sur un échantillon, extrapolé', heuristic: 'ordre de grandeur d’après la taille' }, en: { exact: 'measured on the source', sampled: 'measured on a sample, extrapolated', heuristic: 'order of magnitude from the size' } }[lang][how];
  console.log(lang === 'fr'
    ? `${id} : ~${n(est.articles)} articles, ~${n(est.chunks)} chunks (${basis})\n  base SQLite ≈ ${fmtBytes(est.sqlite_bytes)} — texte + FTS5 ${fmtBytes(est.sqlite_text_bytes)}, vecteurs ${model} int8 ${fmtBytes(est.vectors_bytes)} ; .zst ≈ ${fmtBytes(est.zst_bytes)}\n  embedding ≈ ${formatDuration(e.prefill_s)} sur cette machine (×3 dans les deux sens). Reprenable après coupure ; en CI, index-build.yml le fait pour tout le monde.`
    : `${id}: ~${n(est.articles)} articles, ~${n(est.chunks)} chunks (${basis})\n  SQLite database ≈ ${fmtBytes(est.sqlite_bytes)} — text + FTS5 ${fmtBytes(est.sqlite_text_bytes)}, ${model} int8 vectors ${fmtBytes(est.vectors_bytes)}; .zst ≈ ${fmtBytes(est.zst_bytes)}\n  embedding ≈ ${formatDuration(e.prefill_s, 'en')} on this machine (×3 either way). Resumable after an outage; in CI, index-build.yml does it for everyone.`);
}
