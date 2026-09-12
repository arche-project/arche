// Résolution des ZIM via le catalogue OPDS de Kiwix (en ligne) : nom stable → URL datée, taille, checksum, date.
// ZIM resolution through the Kiwix OPDS catalog (online): stable name → dated URL, size, date.
// Doc : https://wiki.kiwix.org/wiki/OPDS  —  https://opds.library.kiwix.org/catalog/v2/entries?name=<name>

// updated : ISO · url : lien direct .zim (le serveur redirige vers un miroir) · version : "2026-08" extrait du nom de fichier
export interface KiwixEntry { name: string; title: string; updated: string; url: string; size_bytes: number; version: string; flavour?: string }
const OPDS = process.env.ARCHE_KIWIX_OPDS ?? 'https://opds.library.kiwix.org/catalog/v2/entries';   // library.kiwix.org → 301 ici

// Depuis 2026 Kiwix publie `<name>wikipedia_fr_all</name>` + `<flavour>maxi</flavour>` ; notre `kiwix_name` garde
// la forme longue `wikipedia_fr_all_maxi`, on accepte les deux. Sans ça, 25 ZIM passaient à `missing` (12 sept. 2026).
// Since 2026 Kiwix moved the flavour out of `name`; `kiwix_name` keeps the long form, both are accepted.
export const kiwixNames = (e: Pick<KiwixEntry, 'name' | 'flavour'>): string[] => e.flavour ? [`${e.name}_${e.flavour}`, e.name] : [e.name];
export const matchesKiwixName = (e: Pick<KiwixEntry, 'name' | 'flavour'>, kiwixName: string): boolean => kiwixNames(e).includes(kiwixName);
/** Forme courte interrogeable par `?name=` : le nom sans suffixe de saveur connu. */
export function kiwixBaseName(kiwixName: string): { name: string; flavour?: string } {
  const m = kiwixName.match(/^(.*)_(maxi|mini|nopic|novid|nodet)$/);
  return m ? { name: m[1], flavour: m[2] } : { name: kiwixName };
}

const attr = (xml: string, name: string) => xml.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`))?.[1];

/** Parse un flux OPDS Atom minimal sans dépendance XML. */
export function parseOpds(xml: string): KiwixEntry[] {
  const out: KiwixEntry[] = [];
  for (const e of xml.split('<entry>').slice(1)) {
    const name = tag(e, 'name'); const title = tag(e, 'title'); const updated = tag(e, 'updated');
    const linkXml = e.split('<link').find(l => l.includes('opds-spec.org/acquisition/open-access'));
    if (!name || !linkXml) continue;
    const url = (attr(linkXml, 'href') ?? '').replace(/\.meta4$/, '');   // OPDS renvoie parfois le metalink
    const version = url.match(/_(\d{4}-\d{2})\.zim$/)?.[1] ?? (updated ?? '').slice(0, 7);
    out.push({ name, title: title ?? name, updated: updated ?? '', url, size_bytes: Number(attr(linkXml, 'length') ?? 0), version, flavour: tag(e, 'flavour') });
  }
  return out;
}

async function opds(query: string, timeout: number): Promise<KiwixEntry[]> {
  const r = await fetch(`${OPDS}?${query}`, { signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`OPDS ${r.status}`);
  return parseOpds(await r.text());
}

export async function resolveKiwix(kiwixName: string): Promise<KiwixEntry | null> {
  const { name } = kiwixBaseName(kiwixName);   // forme courte d'abord (flux 2026), longue ensuite (ancien flux)
  for (const q of name === kiwixName ? [kiwixName] : [name, kiwixName]) {
    const entries = (await opds(`name=${encodeURIComponent(q)}&count=10`, 20000)).filter(e => matchesKiwixName(e, kiwixName));
    entries.sort((a, b) => b.updated.localeCompare(a.updated));
    if (entries[0]) return entries[0];
  }
  return null;
}

/** Liste tout le catalogue (paginé). Utilisé par l'updater. */
export async function listAllKiwix(opts: { lang?: string; pageSize?: number } = {}): Promise<KiwixEntry[]> {
  const all: KiwixEntry[] = [];
  const count = opts.pageSize ?? 500;
  for (let start = 0; ; start += count) {
    const q = new URLSearchParams({ start: String(start), count: String(count) });
    if (opts.lang) q.set('lang', opts.lang);
    const page = await opds(String(q), 60000);
    all.push(...page);
    if (page.length < count) break;
  }
  return all;
}
