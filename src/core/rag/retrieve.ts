// La recherche hybride au moment de la question : Xapian de kiwix-serve (lexical, déjà là dans
// chaque ZIM) + un canal `sqlite` par corpus installé (ADR 0014 : FTS5 pour le lexical, cosinus sur
// la table de vecteurs du modèle demandé), fusionnés par RRF puis diversifiés. Le texte des passages
// vient de la base (chunks.text) ; pour un résultat Xapian, du ZIM via kiwix-serve. C'est ce que le
// serveur MCP expose (ADR 0011) ; Arche ne génère rien ici, il *retrouve* et *cite*.
//
// Query-time hybrid retrieval: kiwix-serve's Xapian + one `sqlite` channel per installed corpus
// (FTS5 + cosine over the requested model's vector table), RRF-fused, then diversified. Passage
// text comes from the database; for Xapian hits, from the ZIM through kiwix-serve.

import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openCorpus, readMeta, vectorTables, QUANT, type VectorTable } from './sqlite.js';
import { Embedder, EMBED_MODELS, DEFAULT_EMBED_MODEL } from './embed.js';
import { rrf, diversify, type Ranked } from './fuse.js';
import { detectRedFlags, type RedFlagRule } from './prompt.js';

export interface KiwixHit { book: string; path: string; title: string; snippet: string; wordCount?: number }

/**
 * Lit le RSS de `/search?format=xml` de kiwix-serve : un <item> par résultat avec title, link
 * (/content/<livre>/<chemin>), description (extrait), book, wordCount. Tolérant aux variantes.
 */
export function parseKiwixSearchXml(xml: string): KiwixHit[] {
  const out: KiwixHit[] = [];
  const entities = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  // Le RSS encode le HTML de l'extrait : on décode les entités, PUIS on retire les balises, puis on redécode ce qui était doublement encodé.
  const unescape = (s: string) => entities(entities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, '')).trim();
  const field = (item: string, name: string): string => { const m = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)); return m ? unescape(m[1]!) : ''; };
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1]!;
    const link = field(item, 'link');
    let book = field(item, 'book');
    let p = link.replace(/^https?:\/\/[^/]+/, '');
    const cm = p.match(/^\/(?:content\/)?([^/]+)\/(.*)$/);
    if (cm) { if (!book) book = cm[1]!; p = cm[2]!; }
    if (!book && !p) continue;
    const wc = Number(field(item, 'wordCount'));
    out.push({ book, path: p, title: field(item, 'title'), snippet: field(item, 'description'), ...(Number.isFinite(wc) && wc > 0 ? { wordCount: wc } : {}) });
  }
  return out;
}

export interface KiwixOptions { host?: string; timeoutMs?: number; fetchImpl?: typeof fetch }
const hostOf = (o: KiwixOptions) => (o.host ?? process.env['KIWIX_HOST'] ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');

/** Recherche plein texte Xapian dans un ou plusieurs ZIM servis par kiwix-serve. */
export async function kiwixSearch(query: string, o: KiwixOptions & { books?: string[]; k?: number } = {}): Promise<KiwixHit[]> {
  const f = o.fetchImpl ?? fetch;
  const params = new URLSearchParams({ pattern: query, format: 'xml', pageLength: String(o.k ?? 20) });
  for (const b of o.books ?? []) params.append('books.name', b);
  const res = await f(`${hostOf(o)}/search?${params.toString()}`, { signal: AbortSignal.timeout(o.timeoutMs ?? 15_000) });
  if (!res.ok) throw new Error(`kiwix-serve /search : HTTP ${res.status}`);
  return parseKiwixSearchXml(await res.text());
}

/** HTML → texte lisible, sans dépendance : blocs → sauts de ligne, balises retirées, entités décodées. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/table)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/** Le texte d'un article, lu dans le ZIM via `/raw/<livre>/content/<chemin>`. */
export async function fetchArticleText(book: string, p: string, o: KiwixOptions = {}): Promise<{ title: string; text: string }> {
  const f = o.fetchImpl ?? fetch;
  const res = await f(`${hostOf(o)}/raw/${encodeURIComponent(book)}/content/${p.split('/').map(encodeURIComponent).join('/')}`, { signal: AbortSignal.timeout(o.timeoutMs ?? 15_000) });
  if (!res.ok) throw new Error(`kiwix-serve /raw : HTTP ${res.status} pour ${book}/${p}`);
  const html = await res.text();
  const title = htmlToText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '') || p.split('/').pop() || p;
  return { title, text: htmlToText(html.replace(/<title>[\s\S]*?<\/title>/i, '')) };
}

// --- Le canal sqlite : un corpus = une base (ADR 0014) --------------------------------------------

/** Les corpus installés : `<bibliothèque>/index/*.arche.sqlite`, triés. */
export function listCorpora(lib: string): string[] {
  const dir = path.join(lib, 'index');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.arche.sqlite')).sort().map(f => path.join(dir, f)) : [];
}

/** Le fichier d'un corpus installé, par `resource_id` (ce que `read_article` et `arche://article/<id>/…` reçoivent). */
export const corpusFile = (lib: string, id: string): string | null => {
  const f = path.join(lib, 'index', `${id}.arche.sqlite`);
  return /^[\w.-]+$/.test(id) && fs.existsSync(f) ? f : null;
};

/**
 * Une question en langage courant → une expression FTS5 sûre : chaque mot entre guillemets (la
 * ponctuation, `AND`, `NEAR(` ou une parenthèse de l'utilisateur ne sont jamais interprétés), reliés
 * par OR — BM25 fait le tri, les mots rares pèsent. `null` s'il ne reste rien à chercher.
 */
export function ftsQuery(text: string): string | null {
  const words = [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2))].slice(0, 32);
  return words.length ? words.map(w => `"${w}"`).join(' OR ') : null;
}

export interface ChunkHit { chunk_id: number; /** Plus grand = meilleur : −bm25 pour FTS5, cosinus pour les vecteurs. */ score: number }

/** Lexical : BM25 de FTS5, le titre de section pesant double (requête de référence de l'ADR 0014). */
export function ftsSearch(db: DatabaseSync, match: string, k: number): ChunkHit[] {
  return (db.prepare('SELECT rowid AS chunk_id, -bm25(chunks_fts, 1.0, 2.0) AS score FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts, 1.0, 2.0) LIMIT ?').all(match, k) as unknown as ChunkHit[]);
}

// Les vecteurs d'une table, lus par blocs de lignes (un aller-retour SQLite par bloc, pas par ligne)
// et gardés en mémoire par processus tant que le budget le permet : la lecture des lignes coûte plus
// que le produit scalaire, et `arche mcp` répond à des centaines de questions dans le même processus.
// Un fichier reconstruit (mtime, taille) invalide son entrée. ARCHE_VECTOR_CACHE_MB : 512 par défaut.
interface VecBlock { ids: Int32Array; vecs: Int8Array }
const BLOCK_ROWS = 4096;
const cache = new Map<string, { blocks: VecBlock[]; bytes: number }>(); let cachedBytes = 0;
const cacheBudget = () => Number(process.env['ARCHE_VECTOR_CACHE_MB'] ?? 512) * 1e6;

function* vectorBlocks(db: DatabaseSync, file: string, vt: VectorTable): Generator<VecBlock> {
  const st = fs.statSync(file);
  const prefix = `${file}\0${vt.table}\0`, key = `${prefix}${st.mtimeMs}\0${st.size}`;
  const hit = cache.get(key);
  if (hit) { yield* hit.blocks; return; }
  for (const [k, e] of cache) if (k.startsWith(prefix)) { cache.delete(k); cachedBytes -= e.bytes; }
  const bytes = vt.count * vt.dims;
  const keep: VecBlock[] | null = bytes <= cacheBudget() - cachedBytes ? [] : null;
  const page = db.prepare(`SELECT chunk_id, vec FROM "${vt.table}" WHERE chunk_id > ? ORDER BY chunk_id LIMIT ${BLOCK_ROWS}`);
  for (let last = 0; ;) {
    const rows = page.all(last) as Array<{ chunk_id: number; vec: Uint8Array }>;
    if (!rows.length) break;
    const ids = new Int32Array(rows.length), vecs = new Int8Array(rows.length * vt.dims);
    rows.forEach((r, i) => {
      if (r.vec.byteLength !== vt.dims) throw new Error(`${path.basename(file)} : vecteur ${r.chunk_id} de ${r.vec.byteLength} octets, ${vt.dims} attendus`);
      ids[i] = r.chunk_id; vecs.set(new Int8Array(r.vec.buffer, r.vec.byteOffset, vt.dims), i * vt.dims);
    });
    last = ids[rows.length - 1]!;
    const block = { ids, vecs }; keep?.push(block); yield block;
  }
  if (keep) { cache.set(key, { blocks: keep, bytes }); cachedBytes += bytes; }
}

/**
 * Dense : cosinus exhaustif entre la question (int8 normalisé) et chaque vecteur de la table, par
 * blocs, avec un tas de taille k tenu à plat. Aucun index ANN : pas de dépendance, pas
 * d'approximation, et c'est mesuré (rapport M1-3) — le routage par corpus (M1-8) borne le reste.
 */
export function vectorSearch(db: DatabaseSync, file: string, vt: VectorTable, q: Int8Array, k: number): ChunkHit[] {
  const dims = vt.dims;
  if (q.length !== dims) throw new Error(`requête en ${q.length} dimensions, ${vt.table} en ${dims}`);
  if (vt.dtype !== 'int8') throw new Error(`${vt.table} : vecteurs ${vt.dtype}, seul int8 est lu`);
  const bestScore: number[] = [], bestId: number[] = []; let floor = -Infinity;
  for (const { ids, vecs } of vectorBlocks(db, file, vt)) {
    for (let c = 0; c < ids.length; c++) {
      const b = c * dims;
      let d0 = 0, d1 = 0, d2 = 0, d3 = 0, i = 0;
      for (; i + 3 < dims; i += 4) { d0 += vecs[b + i]! * q[i]!; d1 += vecs[b + i + 1]! * q[i + 1]!; d2 += vecs[b + i + 2]! * q[i + 2]!; d3 += vecs[b + i + 3]! * q[i + 3]!; }
      for (; i < dims; i++) d0 += vecs[b + i]! * q[i]!;
      const dot = d0 + d1 + d2 + d3;
      if (bestScore.length === k && dot <= floor) continue;
      let pos = bestScore.length;
      while (pos > 0 && bestScore[pos - 1]! < dot) pos--;
      bestScore.splice(pos, 0, dot); bestId.splice(pos, 0, ids[c]!);
      if (bestScore.length > k) { bestScore.pop(); bestId.pop(); }
      floor = bestScore[bestScore.length - 1]!;
    }
  }
  return bestId.map((chunk_id, i) => ({ chunk_id, score: bestScore[i]! / (QUANT * QUANT) }));
}

/**
 * Un article entier, reconstitué depuis `chunks` : le recouvrement que le découpage a copié en tête
 * de chaque chunk est retiré (même règle que chunk.ts, en sens inverse), les titres de section
 * sont réinsérés. `null` si l'article n'est pas dans la base.
 */
export function readCorpusArticle(db: DatabaseSync, articlePath: string): { title: string; url: string | null; text: string } | null {
  const a = db.prepare('SELECT id, title, url FROM articles WHERE path = ?').get(articlePath) as { id: number; title: string; url: string | null } | undefined;
  if (!a) return null;
  const overlap = Number(readMeta(db)['chunker']?.split('/')[3] ?? 150) || 0; // meta.chunker = structure/<cible>/<max>/<recouvrement>/<min>
  const rows = db.prepare('SELECT heading, text FROM chunks WHERE article = ? ORDER BY ordinal').all(a.id) as Array<{ heading: string; text: string }>;
  let text = '', heading = a.title, prev = '';
  for (const r of rows) {
    const own = prev ? r.text.slice(Math.min(overlap, prev.length) + 2) : r.text;
    if (r.heading && r.heading !== heading) { text += `\n\n## ${r.heading}`; heading = r.heading; }
    text += (text ? '\n\n' : '') + own;
    prev = r.text;
  }
  return { title: a.title, url: a.url, text };
}

export interface Passage extends Ranked {
  n: number;
  resource_id: string;
  title: string;
  heading?: string;
  text: string;
  /** Où l'ouvrir hors ligne : `arche://article/<corpus>/<chemin>` pour un corpus, le lien kiwix-serve pour un ZIM. */
  url: string;
  assets?: string[];
  /** Ce qui l'a trouvé : Xapian, ou le canal sqlite par son lexical (fts) et/ou ses vecteurs (vec). */
  via: Array<'xapian' | 'fts' | 'vec'>;
}

export interface RetrieveOptions extends KiwixOptions {
  lib?: string;
  k?: number;
  /** Restreindre aux livres (noms kiwix) ou aux corpus (resource_id) — par exemple ceux d'une recette de projet. */
  books?: string[];
  embedder?: Embedder;
  /** Le modèle dont on lit la table de vecteurs (défaut : celui de l'embedder ; sinon bge-m3, ou à défaut le premier modèle connu que la base porte) ; aucune → FTS5 seul, et dit. */
  model?: string;
  /** Contexte de conversation pour les garde-fous (questions elliptiques). */
  context?: string[];
  lang?: 'fr' | 'en';
}

export interface RetrieveResult {
  passages: Passage[];
  flags: RedFlagRule[];
  /** Ce qui a répondu : Xapian, les corpus SQLite, ou rien — dit à l'utilisateur, jamais caché. */
  channels: { xapian: 'ok' | 'off' | 'error'; sqlite: 'ok' | 'off' | 'error'; detail?: string };
  lists: Partial<Record<'xapian' | 'fts' | 'vec', string[]>>; // les listes avant fusion (ids, dans l'ordre ; clé absente = canal muet) : ce que `arche eval` mesure canal par canal
}

/**
 * La recherche complète. Ne lève pas si un canal manque : sans kiwix-serve, les corpus SQLite
 * répondent seuls ; sans corpus, Xapian seul ; sans Ollama, FTS5 sans vecteurs — et le résultat le dit.
 */
export async function retrieve(query: string, o: RetrieveOptions = {}): Promise<RetrieveResult> {
  const k = o.k ?? 8;
  const channels: RetrieveResult['channels'] = { xapian: 'off', sqlite: 'off' };
  const details: string[] = [];
  type R = Ranked & { resource_id: string; book: string; path: string; title: string; url?: string; snippet?: string; text?: string; heading?: string; assets?: string[] };
  const lists: Array<{ name: string; items: R[]; weight?: number }> = [];

  // Canal lexical des ZIM : Xapian de kiwix-serve.
  try {
    const hits = await kiwixSearch(query, { ...o, k: k * 4 });
    channels.xapian = 'ok';
    lists.push({ name: 'xapian', items: hits.map(h => ({ id: `${h.book}/${h.path}`, resource_id: h.book, book: h.book, path: h.path, title: h.title, snippet: h.snippet })) });
  } catch (e) { channels.xapian = 'error'; details.push(`xapian : ${(e as Error).message}`); }

  // Canal sqlite : chaque corpus installé, FTS5 + cosinus sur la table du modèle demandé.
  const files = o.lib ? listCorpora(o.lib) : [];
  if (files.length) {
    const wanted = o.model ?? o.embedder?.model.id, match = ftsQuery(query);
    const fts: Array<R & { score: number }> = [], vec: Array<R & { score: number }> = [], noVec: string[] = [];
    // La question embarquée, une fois par modèle rencontré (null : Ollama ou le modèle manquent — FTS5 seul, et dit).
    const queries = new Map<string, Int8Array | null>();
    const queryFor = async (model: string): Promise<Int8Array | null> => {
      if (queries.has(model)) return queries.get(model)!;
      try { queries.set(model, await (o.embedder?.model.id === model ? o.embedder : new Embedder({ model })).embedQuery(query)); }
      catch (e) { queries.set(model, null); details.push(`vecteurs ${model} : ${(e as Error).message} — FTS5 seul`); }
      return queries.get(model)!;
    };
    let failed = 0;
    for (const file of files) {
      let db: DatabaseSync;
      try { db = openCorpus(file, { readonly: true }); } catch (e) { failed++; details.push(`${path.basename(file)} : ${(e as Error).message}`); continue; }
      try {
        const meta = readMeta(db), rid = meta['resource_id'] ?? path.basename(file, '.arche.sqlite');
        if (o.books?.length && !o.books.includes(rid)) continue;
        const row = db.prepare('SELECT locator, path, title, url, heading, text, assets FROM passages WHERE chunk_id = ?');
        const toR = (h: ChunkHit): R & { score: number } => {
          const p = row.get(h.chunk_id) as { locator: string; path: string; title: string; url: string | null; heading: string; text: string; assets: string | null };
          return { id: p.locator, resource_id: rid, book: rid, path: p.path, title: p.title, url: p.url ?? undefined, text: p.text, heading: p.heading || undefined, assets: p.assets ? JSON.parse(p.assets) as string[] : undefined, score: h.score };
        };
        if (match) for (const h of ftsSearch(db, match, k * 2)) fts.push(toR(h));
        const tables = vectorTables(db);
        const vt = wanted ? tables.find(t => t.model === wanted) : tables.find(t => t.model === DEFAULT_EMBED_MODEL) ?? tables.find(t => t.model in EMBED_MODELS);
        if (!vt) noVec.push(rid);
        else {
          const q = await queryFor(vt.model);
          if (q) try { for (const h of vectorSearch(db, file, vt, q, k * 2)) vec.push(toR(h)); } catch (e) { details.push(`${rid} : ${(e as Error).message}`); }
        }
        channels.sqlite = 'ok';
      } finally { db.close(); }
    }
    if (channels.sqlite !== 'ok' && failed) channels.sqlite = 'error';
    if (noVec.length) details.push(`sans vecteurs ${wanted ?? 'd’un modèle connu'} (FTS5 seul) : ${noVec.join(', ')}`);
    const top = (xs: Array<R & { score: number }>) => xs.sort((a, b) => b.score - a.score).slice(0, k * 4);
    lists.push({ name: 'fts', items: top(fts) }, { name: 'vec', items: top(vec) });
  }

  const fused = diversify<R>(rrf<R>(lists), k, 3);
  const passages: Passage[] = [];
  let n = 1;
  for (const { item: r, ranks } of fused) {
    let text = r.text ?? r.snippet ?? '';
    let title = r.title;
    if (!text) {
      try { const a = await fetchArticleText(r.book, r.path, o); title = title || a.title; text = a.text.slice(0, 1500); }
      catch (e) { details.push(`texte : ${(e as Error).message}`); continue; }
    }
    passages.push({
      id: r.id, resource_id: r.resource_id, n: n++, title, text, url: r.url ?? `${hostOf(o)}/content/${r.book}/${r.path}`,
      ...(r.heading ? { heading: r.heading } : {}), ...(r.assets?.length ? { assets: r.assets } : {}),
      via: (['xapian', 'fts', 'vec'] as const).filter(c => c in ranks),
    });
  }
  if (details.length) channels.detail = details.join(' ; ');
  return { passages, flags: detectRedFlags(query, o.context ?? []), channels, lists: Object.fromEntries(lists.map(l => [l.name, l.items.map(i => i.id)])) };
}
