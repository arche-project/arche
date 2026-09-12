// Extraire le texte des sources — ZIM, PDF, EPUB, Markdown, HTML, dossiers — pour l'indexer.
// Extract text from sources — ZIM, PDF, EPUB, Markdown, HTML, folders — for indexing.
//
// C'est le premier maillon de la chaîne « des centaines de RAG hébergés sur Internet Archive »
// (ADR 0013) et de « l'utilisateur ajoute ses propres PDF et ebooks ». Chaque source devient un
// flux d'articles {chemin, titre, texte, fichiers liés} ; le découpage (chunk.ts) et l'embedding
// (build.ts) ne savent pas d'où vient le texte. Aucune dépendance : zimdump et pdftotext sont des
// binaires de la bibliothèque, l'EPUB est un zip qu'on lit à la main.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inflateRawSync } from 'node:zlib';
import { htmlToText } from './retrieve.js';
import { extractAssetLinks } from './assets.js';

const run = promisify(execFile);

export interface Article {
  /** Chemin stable dans la ressource : `A/Pompe_à_corde`, `p12`, `chapitre-3.xhtml`. */
  path: string;
  title: string;
  text: string;
  /** Fichiers non textuels liés (STL, SVG, images…), chemins dans la ressource. */
  assets?: string[];
}

export type SourceKind = 'zim' | 'pdf' | 'epub' | 'markdown' | 'html' | 'text' | 'dir';

/** Devine le type d'une source à son extension (ou dossier). */
export function sourceKind(p: string): SourceKind | null {
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return 'dir';
  const ext = path.extname(p).toLowerCase();
  return ext === '.zim' ? 'zim' : ext === '.pdf' ? 'pdf' : ext === '.epub' ? 'epub' : ['.md', '.markdown'].includes(ext) ? 'markdown' : ['.html', '.htm', '.xhtml'].includes(ext) ? 'html' : ['.txt', '.rst', '.adoc'].includes(ext) ? 'text' : null;
}

/** Titre d'un HTML, ou premier titre, ou nom de fichier. */
function htmlTitle(html: string, fallback: string): string {
  const t = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '';
  return htmlToText(t) || fallback;
}

/** Un fichier HTML → article : texte propre + fichiers liés. */
export function articleFromHtml(relPath: string, html: string): Article {
  const assets = extractAssetLinks(html).map(a => a.path);
  const title = htmlTitle(html, path.basename(relPath, path.extname(relPath)).replace(/_/g, ' '));
  const body = html.replace(/<title>[\s\S]*?<\/title>/i, '').replace(/<nav[\s\S]*?<\/nav>/gi, '').replace(/<footer[\s\S]*?<\/footer>/gi, '');
  return { path: relPath, title, text: htmlToText(body), ...(assets.length ? { assets } : {}) };
}

/** Un Markdown → article : le premier titre `#` devient le titre, les liens vers des fichiers deviennent des assets. */
export function articleFromMarkdown(relPath: string, md: string): Article {
  const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? path.basename(relPath, path.extname(relPath)).replace(/[-_]/g, ' ');
  const assets = extractAssetLinks(md).map(a => a.path);
  return { path: relPath, title, text: md, ...(assets.length ? { assets } : {}) };
}

// ---------------------------------------------------------------------------------------------
// ZIM : zimdump dump --dir <out> <fichier.zim>, puis on parcourt les HTML.
// ---------------------------------------------------------------------------------------------

export interface ZimOptions { zimdump?: string; workDir?: string; keepDump?: boolean; onProgress?: (n: number) => void }

/**
 * Les articles d'un ZIM. Passe par `zimdump dump` (zim-tools, binaire statique — ADR 0008) : tout le
 * contenu est écrit dans un dossier de travail, on lit les HTML, on efface. Sur un ZIM de 13 Go
 * (Wikipédia FR sans images) ça demande autant d'espace disque temporaire : le dire avant.
 */
export async function* extractZim(zimPath: string, o: ZimOptions = {}): AsyncGenerator<Article> {
  const zimdump = o.zimdump ?? 'zimdump';
  const work = o.workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'arche-zim-'));
  const out = path.join(work, path.basename(zimPath, '.zim'));
  fs.mkdirSync(out, { recursive: true });
  try {
    await run(zimdump, ['dump', `--dir=${out}`, zimPath], { maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    throw new Error(`zimdump a échoué sur ${zimPath} : ${String((e as Error).message).split('\n')[0]} — zim-tools est-il installé (ressource « zim-tools ») ?`);
  }
  let n = 0;
  try {
    for await (const a of extractDir(out, { root: out })) { n++; o.onProgress?.(n); yield a; }
  } finally {
    if (!o.keepDump) fs.rmSync(out, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// PDF : pdftotext (poppler / xpdf), une page = un article, pour citer « p. 12 ».
// ---------------------------------------------------------------------------------------------

export interface PdfOptions { pdftotext?: string; title?: string }

/** Découpe la sortie de pdftotext (pages séparées par un saut de page \f) en articles `p<N>`. */
export function articlesFromPdfText(raw: string, bookTitle: string): Article[] {
  const pages = raw.split('\f');
  const out: Article[] = [];
  pages.forEach((p, i) => {
    const text = p.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 40) return; // page blanche, image seule, séparateur
    out.push({ path: `p${i + 1}`, title: `${bookTitle} — p. ${i + 1}`, text });
  });
  return out;
}

export async function extractPdf(pdfPath: string, o: PdfOptions = {}): Promise<Article[]> {
  const bin = o.pdftotext ?? 'pdftotext';
  let raw: string;
  try {
    const r = await run(bin, ['-enc', 'UTF-8', '-layout', pdfPath, '-'], { maxBuffer: 512 * 1024 * 1024 });
    raw = r.stdout;
  } catch (e) {
    throw new Error(`pdftotext a échoué sur ${pdfPath} : ${String((e as Error).message).split('\n')[0]} — poppler/xpdf est-il installé (ressource « poppler-utils ») ?`);
  }
  const title = o.title ?? path.basename(pdfPath, '.pdf').replace(/[-_]/g, ' ');
  const arts = articlesFromPdfText(raw, title);
  if (!arts.length) throw new Error(`${pdfPath} : aucun texte extrait — PDF scanné sans couche texte ; passer par l'OCR (deepseek-ocr, paddleocr-vl) d'abord`);
  return arts;
}

// ---------------------------------------------------------------------------------------------
// EPUB : un zip ; on lit le répertoire central, on gonfle les XHTML, on suit l'ordre du spine OPF.
// ---------------------------------------------------------------------------------------------

interface ZipEntry { name: string; method: number; compSize: number; size: number; offset: number }

/** Lit le répertoire central d'un zip (fin de fichier) — assez pour un EPUB, sans dépendance. */
export function listZip(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip : fin de répertoire central introuvable');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('zip : entrée de répertoire invalide');
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const size = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    entries.push({ name, method, compSize, size, offset: local });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function readZipEntry(buf: Buffer, e: ZipEntry): Buffer {
  if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new Error(`zip : en-tête local invalide pour ${e.name}`);
  const nameLen = buf.readUInt16LE(e.offset + 26), extraLen = buf.readUInt16LE(e.offset + 28);
  const start = e.offset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + e.compSize);
  if (e.method === 0) return Buffer.from(data);
  if (e.method === 8) return inflateRawSync(data);
  throw new Error(`zip : méthode de compression ${e.method} non gérée (${e.name})`);
}

/** Les articles d'un EPUB, dans l'ordre de lecture (spine) quand l'OPF est lisible, sinon par nom. */
export function extractEpub(epubPath: string): Article[] {
  const buf = fs.readFileSync(epubPath);
  const entries = listZip(buf);
  const byName = new Map(entries.map(e => [e.name, e]));
  const text = (name: string) => readZipEntry(buf, byName.get(name)!).toString('utf8');
  let order: string[] = [];
  let bookTitle = path.basename(epubPath, '.epub');
  const container = byName.has('META-INF/container.xml') ? text('META-INF/container.xml') : '';
  const opfPath = container.match(/full-path="([^"]+)"/)?.[1];
  if (opfPath && byName.has(opfPath)) {
    const opf = text(opfPath);
    const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    bookTitle = htmlToText(opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1] ?? '') || bookTitle;
    const items = new Map<string, string>();
    for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
      const id = m[0].match(/\bid="([^"]+)"/)?.[1]; const href = m[0].match(/\bhref="([^"]+)"/)?.[1];
      if (id && href) items.set(id, base + decodeURIComponent(href));
    }
    for (const m of opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/gi)) { const h = items.get(m[1]!); if (h && byName.has(h)) order.push(h); }
  }
  if (!order.length) order = entries.map(e => e.name).filter(n => /\.(x?html?)$/i.test(n)).sort();
  const out: Article[] = [];
  for (const name of order) {
    if (!/\.(x?html?)$/i.test(name)) continue;
    const a = articleFromHtml(name, text(name));
    if (a.text.length < 40) continue;
    out.push({ ...a, title: a.title === path.basename(name, path.extname(name)) ? `${bookTitle} — ${a.title}` : a.title });
  }
  if (!out.length) throw new Error(`${epubPath} : aucun chapitre lisible`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Dossiers et fichiers simples.
// ---------------------------------------------------------------------------------------------

export interface DirOptions { root?: string; pdftotext?: string; /** Un fichier illisible ne fait pas échouer la bibliothèque : on le signale et on continue. */ onError?: (file: string, message: string) => void }

/** Tous les documents d'un dossier (récursif) : md, txt, html, pdf, epub. Les chemins sont relatifs à `root`. */
export async function* extractDir(dir: string, o: DirOptions = {}): AsyncGenerator<Article> {
  const root = o.root ?? dir;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch { continue; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      const rel = path.relative(root, p).split(path.sep).join('/');
      const kind = sourceKind(p);
      try {
        if (kind === 'html') yield articleFromHtml(rel, fs.readFileSync(p, 'utf8'));
        else if (kind === 'markdown') yield articleFromMarkdown(rel, fs.readFileSync(p, 'utf8'));
        else if (kind === 'text') yield { path: rel, title: path.basename(rel, path.extname(rel)), text: fs.readFileSync(p, 'utf8') };
        else if (kind === 'pdf') for (const a of await extractPdf(p, { pdftotext: o.pdftotext })) yield { ...a, path: `${rel}#${a.path}` };
        else if (kind === 'epub') for (const a of extractEpub(p)) yield { ...a, path: `${rel}#${a.path}` };
      } catch (err) {
        o.onError?.(rel, (err as Error).message);
      }
    }
  }
}

/** Point d'entrée : une source (fichier ou dossier) → ses articles. */
export async function* extractSource(src: string, o: ZimOptions & PdfOptions & DirOptions = {}): AsyncGenerator<Article> {
  const kind = sourceKind(src);
  if (!kind) throw new Error(`source non reconnue : ${src} (zim, pdf, epub, md, html, txt ou dossier)`);
  if (kind === 'zim') { yield* extractZim(src, o); return; }
  if (kind === 'dir') { yield* extractDir(src, o); return; }
  if (kind === 'pdf') { for (const a of await extractPdf(src, o)) yield a; return; }
  if (kind === 'epub') { for (const a of extractEpub(src)) yield a; return; }
  const rel = path.basename(src);
  const raw = fs.readFileSync(src, 'utf8');
  yield kind === 'html' ? articleFromHtml(rel, raw) : kind === 'markdown' ? articleFromMarkdown(rel, raw) : { path: rel, title: path.basename(rel, path.extname(rel)), text: raw };
}
