// Analyseurs purs des réponses de registres — sans réseau, donc testables.
// Pure parsers for registry responses — no network, hence testable.

/** Une distribution ROS telle que la décrit `index-v4.yaml` de ros/rosdistro. */
export interface RosDistro { name: string; status: string; type: string }

/**
 * Lit `index-v4.yaml` sans analyseur YAML complet : on ne veut que le nom de chaque distribution,
 * son `distribution_status` et son `distribution_type`. Le fichier est stable depuis des années et
 * indenté de deux espaces ; si sa forme change, le tracker rend une liste vide et la PR le montre.
 */
export function parseRosdistroIndex(text: string): RosDistro[] {
  const out: RosDistro[] = [];
  let cur: RosDistro | null = null;
  let inDistributions = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trimEnd();
    if (/^distributions:\s*$/.test(line)) { inDistributions = true; continue; }
    if (inDistributions && /^\S/.test(line)) inDistributions = false; // autre clé de premier niveau
    if (!inDistributions) continue;
    const head = /^  ([a-z][a-z0-9_-]*):\s*$/.exec(line);
    if (head) { cur = { name: head[1]!, status: '', type: '' }; out.push(cur); continue; }
    const st = /^\s{4}distribution_status:\s*(\S+)/.exec(line);
    if (st && cur) cur.status = st[1]!;
    const ty = /^\s{4}distribution_type:\s*(\S+)/.exec(line);
    if (ty && cur) cur.type = ty[1]!;
  }
  return out;
}

// index-v4.yaml ne marque pas les LTS. REP-2000 : une distribution LTS sort les années paires
// (Humble 2022, Jazzy 2024, 2026…), les impaires sont courtes (Iron 2023, Kilted 2025). On garde une
// liste explicite — courte, commentée, facile à corriger — plutôt qu'une heuristique sur les noms.
export const ROS2_LTS: ReadonlySet<string> = new Set(['humble', 'jazzy', 'lyrical']);

/** Dernière LTS ROS 2 active. Les noms ROS sont alphabétiques dans le temps, donc triables. */
export function latestActiveRos2Lts(distros: readonly RosDistro[]): string | null {
  const active = distros.filter(d => d.type === 'ros2' && d.name !== 'rolling' && d.status === 'active');
  const lts = active.filter(d => ROS2_LTS.has(d.name)).map(d => d.name).sort();
  return lts.at(-1) ?? null;
}

/** Lit le fichier `Release` d'une distribution Debian. */
export function parseDebianRelease(text: string): { codename: string; version: string; date?: string } | null {
  const codename = /^Codename:\s*(\S+)/m.exec(text)?.[1];
  const version = /^Version:\s*(\S+)/m.exec(text)?.[1];
  const date = /^Date:\s*(.+)$/m.exec(text)?.[1];
  if (!codename || !version) return null;
  const iso = date ? new Date(date).toISOString().slice(0, 10) : undefined;
  return { codename, version, ...(iso && iso !== 'Invalid Date' ? { date: iso } : {}) };
}

/** Node : parité paire = ligne susceptible d'être LTS ; `lts` non-false = déjà promue. */
export function pickNode(
  entries: ReadonlyArray<{ version: string; lts: string | false; date: string }>,
  stability: 'stable' | 'lts' | 'any',
): { version: string; lts: string | false; date: string } | null {
  const pool = stability === 'any' ? entries
    : stability === 'stable' ? entries.filter(x => Number(x.version.slice(1).split('.')[0]) % 2 === 0)
    : entries.filter(x => x.lts !== false);
  // index.json est trié du plus récent au plus ancien.
  return pool[0] ?? null;
}

/**
 * Lit `https://changelogs.ubuntu.com/meta-release-lts` : blocs séparés par une ligne vide, une
 * clé par ligne (`Dist`, `Version`, `Date`, `Supported`). On rend la dernière LTS encore
 * supportée — c'est ce fichier qu'Ubuntu lui-même consulte pour proposer une mise à niveau.
 */
export function parseUbuntuMetaRelease(text: string): { dist: string; version: string; date?: string } | null {
  const blocks = text.split(/\n\s*\n/).map(b => Object.fromEntries(
    b.split('\n').map(l => l.split(/:\s*/, 2)).filter(kv => kv.length === 2) as Array<[string, string]>,
  ));
  const supported = blocks.filter(b => b['Supported'] === '1' && b['Dist'] && b['Version']);
  const last = supported.at(-1);
  if (!last) return null;
  const iso = last['Date'] ? new Date(last['Date']).toISOString().slice(0, 10) : undefined;
  return { dist: last['Dist']!, version: last['Version']!, ...(iso && iso !== 'Invalid Date' ? { date: iso } : {}) };
}

/** Une image telle que la décrit `os_list_imagingutility_v4.json` de Raspberry Pi Imager. */
export interface RaspiosImage { name: string; url: string; release_date?: string; image_download_sha256?: string }

/**
 * Trouve une image dans la liste (imbriquée) de Raspberry Pi Imager par expression sur son nom,
 * ex. « Raspberry Pi OS Lite \(64-bit\) ». C'est la même source que l'outil officiel, donc l'URL,
 * la date et le sha256 sont exactement ceux que l'utilisateur obtiendrait en ligne.
 */
export function pickRaspiosImage(list: unknown, namePattern: string): RaspiosImage | null {
  const re = new RegExp(namePattern, 'i');
  const walk = (node: unknown): RaspiosImage | null => {
    if (!node || typeof node !== 'object') return null;
    const n = node as { name?: string; url?: string; release_date?: string; image_download_sha256?: string; subitems?: unknown[]; os_list?: unknown[] };
    if (n.name && n.url && re.test(n.name)) return { name: n.name, url: n.url, release_date: n.release_date, image_download_sha256: n.image_download_sha256 };
    for (const child of [...(n.os_list ?? []), ...(n.subitems ?? [])]) { const r = walk(child); if (r) return r; }
    return null;
  };
  return walk(list);
}
