// Wikimedia Commons : lire ce qu'un fichier dit de lui-même (licence, auteur, URL, hash).
// Wikimedia Commons: read what a file says about itself (licence, author, URL, hash).
//
// Commons est la plus grande réserve d'images libres du monde et la seule où CHAQUE fichier porte
// une licence lisible par machine. C'est pour ça qu'on glane là d'abord. Les fonctions ici sont
// pures (JSON en entrée) ; le script scripts/visuals/commons.ts fait les requêtes.

export interface CommonsFile {
  title: string;          // "File:Amanita phalloides 1.JPG"
  url: string;            // upload.wikimedia.org/…
  descriptionUrl: string; // page Commons
  sha1?: string;
  width?: number;
  height?: number;
  mime?: string;
  /** Licence normalisée (CC-BY-SA-4.0, CC0, PD…) ou la chaîne brute si inconnue. */
  license: string;
  /** Vrai si redistribuable dans une bibliothèque libre (pas de NC, pas de ND, pas de « fair use »). */
  free: boolean;
  author?: string;
  description?: string;
  /** Catégories « depicts » ou catégories du fichier, utiles pour deviner la vue. */
  categories: string[];
}

/** Normalise les libellés de licence que Commons expose dans extmetadata. */
export function normalizeLicense(short: string | undefined, long?: string): { license: string; free: boolean } {
  const s = (short ?? long ?? '').trim();
  if (!s) return { license: 'unknown', free: false };
  const u = s.toUpperCase().replace(/\s+/g, ' ');
  if (/^(CC0|CC ZERO|CC0 1\.0)/.test(u)) return { license: 'CC0', free: true };
  if (/PUBLIC DOMAIN|^PD\b|PD-/.test(u)) return { license: 'PD', free: true };
  const cc = /CC[ -]?BY(?:[ -]?(NC))?(?:[ -]?(SA))?(?:[ -]?(ND))?(?:[ -]?([0-9]\.[0-9]))?/.exec(u);
  if (cc) {
    const nc = Boolean(cc[1]); const sa = Boolean(cc[2]); const nd = Boolean(cc[3]); const ver = cc[4];
    const lic = `CC-BY${nc ? '-NC' : ''}${sa ? '-SA' : ''}${nd ? '-ND' : ''}${ver ? `-${ver}` : ''}`;
    return { license: lic, free: !nc && !nd };
  }
  if (/GFDL/.test(u)) return { license: 'GFDL', free: true };
  if (/FAIR USE|NON-FREE|COPYRIGHTED/.test(u)) return { license: s, free: false };
  return { license: s, free: false };
}

/**
 * Lit la réponse de `action=query&prop=imageinfo&iiprop=url|sha1|size|mime|extmetadata` (+ categories).
 * Un fichier sans URL ou sans métadonnées est ignoré, pas inventé.
 */
export function parseImageInfo(json: unknown): CommonsFile[] {
  const pages = (json as { query?: { pages?: Record<string, unknown> | unknown[] } })?.query?.pages;
  if (!pages) return [];
  const list = Array.isArray(pages) ? pages : Object.values(pages);
  const out: CommonsFile[] = [];
  for (const p of list as Array<Record<string, unknown>>) {
    const title = String(p['title'] ?? '');
    const ii = (p['imageinfo'] as Array<Record<string, unknown>> | undefined)?.[0];
    if (!title.startsWith('File:') || !ii?.['url']) continue;
    const ext = (ii['extmetadata'] as Record<string, { value?: string }> | undefined) ?? {};
    const { license, free } = normalizeLicense(ext['LicenseShortName']?.value, ext['License']?.value);
    const strip = (s?: string): string | undefined => s?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || undefined;
    out.push({
      title,
      url: String(ii['url']),
      descriptionUrl: String(ii['descriptionurl'] ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`),
      sha1: typeof ii['sha1'] === 'string' ? ii['sha1'] : undefined,
      width: typeof ii['width'] === 'number' ? ii['width'] : undefined,
      height: typeof ii['height'] === 'number' ? ii['height'] : undefined,
      mime: typeof ii['mime'] === 'string' ? ii['mime'] : undefined,
      license, free,
      author: strip(ext['Artist']?.value),
      description: strip(ext['ImageDescription']?.value),
      categories: ((p['categories'] as Array<{ title: string }> | undefined) ?? []).map(c => c.title.replace(/^Category:/, '')),
    });
  }
  return out;
}

/**
 * Devine la vue d'un fichier à partir de son titre, sa description et ses catégories.
 * Heuristique volontairement simple : elle PROPOSE, un humain valide (status: candidate → verified).
 */
export function guessView(kind: string, f: CommonsFile): string | null {
  const hay = `${f.title} ${f.description ?? ''} ${f.categories.join(' ')}`.toLowerCase();
  const rules: Record<string, Array<[RegExp, string]>> = {
    fungus: [
      [/spore print|sporée|sporata/, 'spore_print'], [/microscop|spores? \d|\bbasidi|cystid/, 'micrograph'],
      [/gills?|lamell|pores?|hymen/, 'hymenium'], [/volva|base|ring|annulus|anneau|stipe|stem/, 'stem_base'],
      [/section|cut|coupe|sliced/, 'cross_section'], [/\bcap\b|pileus|chapeau/, 'cap'], [/young|juvenile|button|old|mature|series/, 'age_series'],
      [/in situ|habitat|forest|wood|grass|meadow/, 'habit'],
    ],
    plant: [
      [/pollen|microscop|epiderm|stoma/, 'micrograph'], [/seedling|plantule|cotyledon/, 'seedling'],
      [/seed|fruit|berry|berries|capsule|pod/, 'fruit_seed'], [/flower|fleur|inflorescence|blossom/, 'flower'],
      [/leaf|leaves|feuille|foliage/, 'leaf'], [/bark|stem|trunk|tige|écorce/, 'stem_bark'], [/root|bulb|rhizome|tuber/, 'root'],
      [/section|coupe|cross/, 'cross_section'], [/illustration|plate|planche|botanical drawing|köhler|thomé/, 'plate'],
      [/distribution|range|map/, 'range_map'], [/habit|habitus|whole plant|tree|shrub/, 'habit'],
    ],
  };
  for (const [re, view] of rules[kind] ?? []) if (re.test(hay)) return view;
  return null;
}
