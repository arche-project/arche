// Fichiers non textuels du corpus : STL, SVG, DXF, G-code, images, PDF.
// Non-text corpus files: STL, SVG, DXF, G-code, images, PDF.
//
// Un STL n'a rien à embarquer. Ce qu'on indexe, c'est le texte qui l'entoure (la page qui le
// cite, son nom, son README) ET ce qu'on peut lire dedans sans aucune dépendance : un STL binaire
// se résume en 84 octets d'en-tête et 50 octets par triangle ; un SVG est du XML avec un <title>,
// une <desc> et des <text>. On en tire une description courte — « pièce imprimable, 120 × 40 × 35 mm,
// 2 340 triangles » — qui est indexée comme n'importe quel passage et qui répond à la question que
// l'utilisateur se pose vraiment : est-ce que ça rentre sur mon plateau ?
//
// An STL embeds nothing. We index the text around it plus what can be read from the file itself
// with no dependency, turned into a short description indexed like any other passage.

export type AssetKind = 'model3d' | 'vector' | 'cad' | 'gcode' | 'image' | 'document' | 'data' | 'archive';

const EXT: Record<string, AssetKind> = {
  stl: 'model3d', obj: 'model3d', '3mf': 'model3d', amf: 'model3d', step: 'cad', stp: 'cad', iges: 'cad', igs: 'cad',
  fcstd: 'cad', scad: 'cad', f3d: 'cad', kicad_pcb: 'cad', kicad_sch: 'cad', sch: 'cad', brd: 'cad',
  svg: 'vector', dxf: 'vector', ai: 'vector', eps: 'vector',
  gcode: 'gcode', nc: 'gcode', ngc: 'gcode',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', tif: 'image', tiff: 'image', bmp: 'image',
  pdf: 'document', epub: 'document', odt: 'document', docx: 'document',
  csv: 'data', json: 'data', yaml: 'data', yml: 'data', xlsx: 'data', ods: 'data',
  zip: 'archive', tar: 'archive', gz: 'archive', '7z': 'archive',
};

/** Type de fichier d'après son extension, ou null pour du texte/HTML. / Kind by extension, null for text. */
export function assetKind(path: string): AssetKind | null {
  const clean = path.split(/[?#]/)[0]!;
  const dot = clean.lastIndexOf('.');
  if (dot < 0) return null;
  return EXT[clean.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * Liens vers des fichiers non textuels dans une page (HTML ou Markdown). Ce sont eux qu'on
 * accroche au chunk qui les cite, pour que « le STL du piston » remonte avec la page qui explique
 * comment le monter — jamais l'un sans l'autre.
 */
export function extractAssetLinks(content: string): Array<{ path: string; kind: AssetKind; label: string }> {
  const out = new Map<string, { path: string; kind: AssetKind; label: string }>();
  const push = (href: string, label: string): void => {
    const kind = assetKind(href);
    if (!kind || out.has(href)) return;
    out.set(href, { path: href, kind, label: label.trim() || href.split('/').pop()! });
  };
  // HTML : <a href> et <img src alt>
  for (const m of content.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) push(m[1]!, m[2]!.replace(/<[^>]+>/g, ''));
  for (const m of content.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)) {
    const alt = /alt=["']([^"']*)["']/i.exec(m[0])?.[1] ?? '';
    push(m[1]!, alt);
  }
  // Markdown : [label](url) et ![alt](url)
  for (const m of content.matchAll(/!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) push(m[2]!, m[1]!);
  return [...out.values()];
}

// ---------------------------------------------------------------------------------------------
// STL
// ---------------------------------------------------------------------------------------------

export interface StlInfo {
  format: 'binary' | 'ascii';
  triangles: number;
  /** Boîte englobante, dans l'unité du fichier (presque toujours le millimètre). */
  bbox: { x: number; y: number; z: number };
  /** Volume signé par la formule du tétraèdre, en unités³ ; fiable seulement sur un maillage fermé. */
  volume: number;
}

/**
 * Lit un STL sans aucune bibliothèque. Un STL binaire commence par 84 octets (en-tête de 80 +
 * uint32 du nombre de triangles) puis 50 octets par triangle : normale, trois sommets, attribut.
 * Certains fichiers ASCII commencent par « solid » — mais certains binaires aussi, donc on
 * vérifie la taille avant de croire le mot.
 */
export function describeStl(buf: Buffer): StlInfo {
  const isBinary = buf.length >= 84 && buf.length === 84 + buf.readUInt32LE(80) * 50;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let volume = 0;
  let triangles = 0;
  const tri = (a: number[], b: number[], c: number[]): void => {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, a[i]!, b[i]!, c[i]!);
      max[i] = Math.max(max[i]!, a[i]!, b[i]!, c[i]!);
    }
    // Volume du tétraèdre (origine, a, b, c) : a · (b × c) / 6
    volume += (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) / 6;
    triangles++;
  };

  if (isBinary) {
    const n = buf.readUInt32LE(80);
    for (let t = 0; t < n; t++) {
      const base = 84 + t * 50 + 12; // saute la normale
      const v = (k: number): number[] => [buf.readFloatLE(base + k * 12), buf.readFloatLE(base + k * 12 + 4), buf.readFloatLE(base + k * 12 + 8)];
      tri(v(0), v(1), v(2));
    }
  } else {
    const text = buf.toString('latin1');
    const verts: number[][] = [];
    for (const m of text.matchAll(/vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g)) {
      verts.push([Number(m[1]), Number(m[2]), Number(m[3])]);
      if (verts.length === 3) { tri(verts[0]!, verts[1]!, verts[2]!); verts.length = 0; }
    }
  }
  if (!triangles) { min = [0, 0, 0]; max = [0, 0, 0]; }
  return {
    format: isBinary ? 'binary' : 'ascii',
    triangles,
    bbox: { x: max[0]! - min[0]!, y: max[1]! - min[1]!, z: max[2]! - min[2]! },
    volume: Math.abs(volume),
  };
}

// ---------------------------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------------------------

export interface SvgInfo {
  title: string;
  desc: string;
  /** Textes visibles dans le dessin — cotes, légendes, noms de pièces. */
  texts: string[];
  width: string | null;
  height: string | null;
  viewBox: string | null;
}

const strip = (s: string): string => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Lit ce qu'un SVG dit de lui-même. / Reads what an SVG says about itself. */
export function describeSvg(text: string): SvgInfo {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0] ?? '';
  const attr = (name: string): string | null => new RegExp(`\\b${name}=["']([^"']+)["']`, 'i').exec(root)?.[1] ?? null;
  const first = (tag: string): string => strip(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(text)?.[1] ?? '');
  const texts = [...text.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map(m => strip(m[1]!)).filter(Boolean);
  return { title: first('title'), desc: first('desc'), texts: [...new Set(texts)].slice(0, 50), width: attr('width'), height: attr('height'), viewBox: attr('viewBox') };
}

// ---------------------------------------------------------------------------------------------
// Description indexable
// ---------------------------------------------------------------------------------------------

const fmt = (n: number): string => (n >= 100 ? String(Math.round(n)) : n.toFixed(1));

/**
 * Texte court qui décrit un fichier pour l'index, en français et en anglais dans la même chaîne :
 * la requête peut arriver dans l'une ou l'autre langue, et un modèle multilingue rapproche les
 * deux — mais le lexical, lui, ne pardonne pas.
 */
export function assetSummary(path: string, kind: AssetKind, meta?: StlInfo | SvgInfo | null, label = ''): string {
  const name = path.split('/').pop() ?? path;
  const head = label && label !== name ? `${label} (${name})` : name;
  if (kind === 'model3d' && meta && 'triangles' in meta) {
    const { x, y, z } = meta.bbox;
    return `${head} — fichier 3D imprimable / printable 3D model (STL). Dimensions ${fmt(x)} × ${fmt(y)} × ${fmt(z)} mm, ${meta.triangles} triangles` +
      (meta.volume > 0 ? `, volume ≈ ${fmt(meta.volume / 1000)} cm³` : '') + '.';
  }
  if (kind === 'vector' && meta && 'texts' in meta) {
    const parts = [meta.title, meta.desc, ...meta.texts].filter(Boolean).join(' · ');
    const size = meta.width && meta.height ? ` ${meta.width} × ${meta.height}` : '';
    return `${head} — dessin vectoriel / vector drawing (découpe laser, gabarit, plan)${size}.${parts ? ' ' + parts : ''}`;
  }
  const generic: Record<AssetKind, string> = {
    model3d: 'fichier 3D imprimable / printable 3D model',
    cad: 'fichier CAO modifiable / editable CAD file',
    vector: 'dessin vectoriel / vector drawing',
    gcode: 'programme machine G-code / machine program',
    image: 'image, photo ou schéma / picture or diagram',
    document: 'document / document',
    data: 'données / data file',
    archive: 'archive de fichiers / file archive',
  };
  return `${head} — ${generic[kind]}.`;
}
