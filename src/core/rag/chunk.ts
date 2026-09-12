// Découpage du texte en chunks récupérables.
// Text chunking for retrieval.
//
// Principe (ADR 0007, contenant changé par l'ADR 0014) : on découpe sur la structure, chaque chunk
// porte son *locator* (article, offset, longueur en octets) ET son texte, écrits ensemble dans la
// base SQLite du corpus (build.ts) avec un index FTS5 pour le lexical.
//
// Principle (ADR 0007, container changed by ADR 0014): split along structure; each chunk carries its
// locator and its text, both written to the corpus' SQLite database (FTS5 for the lexical channel).

/** Un chunk tel qu'il sort du découpage, avant embedding. / A chunk as produced by the splitter. */
export interface RawChunk {
  /** Chemin de l'article dans la ressource (ex. "A/Pompe_à_corde"). */
  path: string;
  /** Titre de l'article, repris dans les citations. */
  title: string;
  /** Fil d'Ariane des titres de section au-dessus du chunk. */
  heading: string;
  /** Décalage en octets UTF-8 depuis le début du texte de l'article. */
  offset: number;
  /** Longueur en octets UTF-8. */
  length: number;
  /** Texte du chunk, présent uniquement à la construction. */
  text: string;
  /** Fichiers non textuels cités dans ce chunk (chemins), voir assets.ts. */
  assets?: string[];
}

export interface ChunkOptions {
  /** Cible en caractères. 1 200 ≈ 300–400 tokens : assez pour un mode opératoire complet. */
  target?: number;
  /** Taille maximale absolue ; au-delà on coupe durement. */
  max?: number;
  /** Recouvrement en caractères entre deux chunks consécutifs, pour ne pas trancher une procédure. */
  overlap?: number;
  /** En dessous, un fragment est fusionné avec le précédent plutôt que gardé seul. */
  min?: number;
}

const DEFAULTS: Required<ChunkOptions> = { target: 1200, max: 2000, overlap: 150, min: 200 };

const utf8 = (s: string): number => Buffer.byteLength(s, 'utf8');

/** Titre markdown (#…) ou ligne courte suivie d'une ligne vide, traitée comme une section. */
function headingOf(line: string): string | null {
  const md = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
  if (md) return md[2]!.trim();
  const setext = /^([A-ZÀ-Þ0-9][^.!?]{2,80})$/.exec(line.trim());
  return setext ? setext[1]!.trim() : null;
}

/**
 * Découpe le texte d'un article en respectant sa structure : on ne coupe jamais au milieu d'un
 * paragraphe si on peut couper entre deux, et chaque chunk retient le titre de section au-dessus
 * de lui — ce qui vaut, en pratique, plus que n'importe quel réglage de taille.
 *
 * Splits an article's text along its structure; each chunk carries the heading trail above it.
 */
export function chunkArticle(
  path: string,
  title: string,
  text: string,
  opts: ChunkOptions = {},
): RawChunk[] {
  const o = { ...DEFAULTS, ...opts };
  if (!text.trim()) return [];

  // 1. Segmenter en blocs (paragraphes), en suivant les titres au passage.
  interface Block { text: string; offset: number; heading: string }
  const blocks: Block[] = [];
  let heading = '';
  let cursor = 0; // offset en octets
  for (const para of text.split(/\n{2,}/)) {
    const bytes = utf8(para);
    const lines = para.split('\n');
    const h = lines.length <= 2 ? headingOf(lines[0]!) : null;
    if (h && bytes < 200) {
      heading = h;
      cursor += bytes + 2;
      continue; // un titre seul n'est pas un chunk
    }
    if (para.trim()) blocks.push({ text: para, offset: cursor, heading });
    cursor += bytes + 2;
  }

  // 2. Agréger les blocs jusqu'à la cible, sans franchir un changement de section si évitable.
  const out: RawChunk[] = [];
  let buf: Block[] = [];
  let bufLen = 0;

  const flush = (): void => {
    if (!buf.length) return;
    const first = buf[0]!;
    const joined = buf.map(b => b.text).join('\n\n');
    const last = buf[buf.length - 1]!;
    const end = last.offset + utf8(last.text);
    out.push({
      path, title,
      heading: first.heading,
      offset: first.offset,
      length: end - first.offset,
      text: joined,
    });
    buf = [];
    bufLen = 0;
  };

  for (const b of blocks) {
    // Un bloc plus gros que le maximum est coupé durement, sur une phrase quand c'est possible.
    if (b.text.length > o.max) {
      flush();
      for (const piece of hardSplit(b, o)) out.push({ path, title, ...piece });
      continue;
    }
    const sectionChanged = buf.length > 0 && b.heading !== buf[0]!.heading;
    if (buf.length && (bufLen + b.text.length > o.target || sectionChanged)) flush();
    buf.push(b);
    bufLen += b.text.length + 2;
  }
  flush();

  // 3. Fusionner les miettes, puis appliquer le recouvrement.
  const merged: RawChunk[] = [];
  for (const c of out) {
    const prev = merged[merged.length - 1];
    // On ne fusionne jamais par-dessus un changement de section : le titre est le contexte le plus
    // utile d'un chunk, et le perdre pour économiser quelques octets est un mauvais échange.
    if (prev && c.text.length < o.min && prev.text.length + c.text.length <= o.max
        && prev.path === c.path && prev.heading === c.heading) {
      prev.text += '\n\n' + c.text;
      prev.length = c.offset + c.length - prev.offset;
    } else merged.push(c);
  }
  if (o.overlap > 0) {
    for (let i = 1; i < merged.length; i++) {
      const prev = merged[i - 1]!;
      const tail = prev.text.slice(Math.max(0, prev.text.length - o.overlap));
      merged[i]!.text = tail + '\n\n' + merged[i]!.text; // le locator ne bouge pas : il pointe le vrai contenu
    }
  }
  return merged;
}

function hardSplit(
  b: { text: string; offset: number; heading: string },
  o: Required<ChunkOptions>,
): Array<Omit<RawChunk, 'path' | 'title'>> {
  const pieces: Array<Omit<RawChunk, 'path' | 'title'>> = [];
  const sentences = b.text.split(/(?<=[.!?…])\s+/);
  let cur = '';
  let off = b.offset;
  const push = (): void => {
    if (!cur) return;
    pieces.push({ heading: b.heading, offset: off, length: utf8(cur), text: cur });
    off += utf8(cur) + 1;
    cur = '';
  };
  for (const s of sentences) {
    if (cur && cur.length + s.length > o.target) push();
    // Une phrase seule plus longue que le maximum : on tranche au caractère, tant pis.
    if (s.length > o.max) {
      push();
      for (let i = 0; i < s.length; i += o.target) {
        cur = s.slice(i, i + o.target);
        push();
      }
      continue;
    }
    cur = cur ? cur + ' ' + s : s;
  }
  push();
  return pieces;
}

/**
 * Accroche à chaque chunk les fichiers qu'il cite. Le texte du chunk est le texte *nettoyé* ; les
 * liens ont pu en disparaître. On relit donc le contenu brut de l'article, on repère chaque lien
 * vers un fichier, et on l'attribue au chunk dont la fenêtre d'octets contient sa position — ou au
 * premier chunk si l'article est trop court pour trancher. Un fichier cité mais jamais retrouvé
 * dans une fenêtre est accroché au chunk le plus proche : mieux vaut un lien un peu décalé qu'un
 * STL orphelin.
 *
 * Attaches to each chunk the files it links to, by byte position in the raw article.
 */
export function attachAssets(
  chunks: RawChunk[],
  raw: string,
  links: ReadonlyArray<{ path: string }>,
): RawChunk[] {
  if (!chunks.length || !links.length) return chunks;
  for (const link of links) {
    const idx = raw.indexOf(link.path);
    const at = idx < 0 ? 0 : Buffer.byteLength(raw.slice(0, idx), 'utf8');
    let target = chunks[0]!;
    let best = Infinity;
    for (const c of chunks) {
      const d = at < c.offset ? c.offset - at : at > c.offset + c.length ? at - (c.offset + c.length) : 0;
      if (d < best) { best = d; target = c; if (d === 0) break; }
    }
    (target.assets ??= []).push(link.path);
  }
  for (const c of chunks) if (c.assets) c.assets = [...new Set(c.assets)];
  return chunks;
}
