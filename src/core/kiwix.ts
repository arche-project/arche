// Résolution des ZIM via le catalogue OPDS de Kiwix (en ligne) : nom stable → URL datée, taille, checksum, date.
// ZIM resolution through the Kiwix OPDS catalog (online): stable name → dated URL, size, date.
// Doc : https://wiki.kiwix.org/wiki/OPDS  —  https://library.kiwix.org/catalog/v2/entries?name=<kiwix_name>

export interface KiwixEntry {
  name: string;
  title: string;
  updated: string;      // ISO
  url: string;          // lien direct .zim (le serveur redirige vers un miroir)
  size_bytes: number;
  version: string;      // "2026-08" extrait du nom de fichier
  flavour?: string;
}

const OPDS = process.env.ARCHE_KIWIX_OPDS ?? 'https://library.kiwix.org/catalog/v2/entries';

function attr(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`${name}="([^"]*)"`));
  return m?.[1];
}
function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`));
  return m?.[1];
}

/** Parse un flux OPDS Atom minimal sans dépendance XML. */
export function parseOpds(xml: string): KiwixEntry[] {
  const out: KiwixEntry[] = [];
  for (const e of xml.split('<entry>').slice(1)) {
    const name = tag(e, 'name'); const title = tag(e, 'title'); const updated = tag(e, 'updated');
    const linkXml = e.split('<link').find(l => l.includes('opds-spec.org/acquisition/open-access'));
    if (!name || !linkXml) continue;
    let url = attr(linkXml, 'href') ?? '';
    url = url.replace(/\.meta4$/, '');                  // OPDS renvoie parfois le metalink
    const size = Number(attr(linkXml, 'length') ?? 0);
    const version = url.match(/_(\d{4}-\d{2})\.zim$/)?.[1] ?? (updated ?? '').slice(0, 7);
    out.push({ name, title: title ?? name, updated: updated ?? '', url, size_bytes: size, version, flavour: tag(e, 'flavour') });
  }
  return out;
}

export async function resolveKiwix(kiwixName: string): Promise<KiwixEntry | null> {
  const r = await fetch(`${OPDS}?name=${encodeURIComponent(kiwixName)}&count=5`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`OPDS ${r.status}`);
  const entries = parseOpds(await r.text()).filter(e => e.name === kiwixName);
  entries.sort((a, b) => b.updated.localeCompare(a.updated));
  return entries[0] ?? null;
}

/** Liste tout le catalogue (paginé). Utilisé par l'updater. */
export async function listAllKiwix(opts: { lang?: string; pageSize?: number } = {}): Promise<KiwixEntry[]> {
  const all: KiwixEntry[] = [];
  const count = opts.pageSize ?? 500;
  for (let start = 0; ; start += count) {
    const q = new URLSearchParams({ start: String(start), count: String(count) });
    if (opts.lang) q.set('lang', opts.lang);
    const r = await fetch(`${OPDS}?${q}`, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`OPDS ${r.status}`);
    const page = parseOpds(await r.text());
    all.push(...page);
    if (page.length < count) break;
  }
  return all;
}
