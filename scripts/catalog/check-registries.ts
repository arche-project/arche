// Suit les registres de paquets et les distributions : npm, PyPI, crates.io, Docker Hub, rosdistro,
// Node LTS, Debian stable. Toujours la dernière version STABLE, jamais « la plus récente ».
// Tracks package registries and distributions — always the latest STABLE, never merely the newest.
//
// Usage : tsx scripts/catalog/check-registries.ts [--dry-run]
//
// Chaque tracker lit l'API officielle du registre, applique la politique de src/core/versions.ts,
// et n'écrit que trois champs : version, updated (date amont), checked (aujourd'hui). Quand la
// politique doit se rabattre (pas de LTS, que des prérelease), la note apparaît dans la PR pour
// que Florian tranche — l'automate ne décide jamais de distribuer une bêta.

import { loadResourceFiles, saveResourceFiles, setField, writeReport, markChecked, setUpdaterNote } from './lib.js';
import { latestStable, parseVersion, type Stability } from '../../src/core/versions.js';
import { parseRosdistroIndex, latestActiveRos2Lts, ROS2_LTS, parseDebianRelease, pickNode, parseUbuntuMetaRelease, pickRaspiosImage } from './registries-parse.js';

const dry = process.argv.includes('--dry-run');
const UA = { 'User-Agent': 'arche-catalog-updater (https://github.com/arche-project/arche)', Accept: 'application/json' };

async function getJson<T>(url: string, accept = 'application/json'): Promise<T | null> {
  const r = await fetch(url, { headers: { ...UA, Accept: accept }, signal: AbortSignal.timeout(30000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return (accept === 'application/json' ? r.json() : r.text()) as Promise<T>;
}

interface Found { version: string; updated?: string; note?: string; missing?: boolean }
type Tracker = (pkg: string | undefined, stability: Stability, current: string | null | undefined) => Promise<Found | null>;

const fallbackNote = (f?: string): string | undefined =>
  f === 'only-prereleases' ? 'aucune version stable : seulement des prérelease — à arbitrer'
  : f === 'no-lts-found' ? 'pas de LTS trouvée, repli sur la dernière stable'
  : undefined;

// --- npm -------------------------------------------------------------------------------------
const npm: Tracker = async (pkg, stability) => {
  if (!pkg) throw new Error('update.package manquant');
  const d = await getJson<{ 'dist-tags': Record<string, string>; versions: Record<string, unknown>; time: Record<string, string> }>(
    `https://registry.npmjs.org/${encodeURIComponent(pkg)}`,
  );
  if (!d) return { version: '', missing: true };
  // `latest` est stable par convention, mais des paquets publient des rc dessus : on vérifie.
  const tagged = stability === 'lts' ? d['dist-tags'].lts ?? d['dist-tags'].latest : d['dist-tags'].latest;
  const pick = tagged && !parseVersion(tagged)?.prerelease && stability !== 'any'
    ? { tag: tagged }
    : latestStable(Object.keys(d.versions), stability, v => v === d['dist-tags'].lts);
  if (!pick) return null;
  return { version: pick.tag, updated: d.time[pick.tag]?.slice(0, 10), note: fallbackNote(pick.fallback) };
};

// --- PyPI ------------------------------------------------------------------------------------
const pypi: Tracker = async (pkg, stability) => {
  if (!pkg) throw new Error('update.package manquant');
  const d = await getJson<{ info: { version: string }; releases: Record<string, Array<{ upload_time: string; yanked?: boolean }>> }>(
    `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`,
  );
  if (!d) return { version: '', missing: true };
  const candidates = Object.entries(d.releases).filter(([, files]) => files.length && !files.every(f => f.yanked)).map(([v]) => v);
  const pick = latestStable(candidates, stability);
  if (!pick) return null;
  return { version: pick.tag, updated: d.releases[pick.tag]?.[0]?.upload_time.slice(0, 10), note: fallbackNote(pick.fallback) };
};

// --- crates.io -------------------------------------------------------------------------------
const crates: Tracker = async (pkg, stability) => {
  if (!pkg) throw new Error('update.package manquant');
  const d = await getJson<{ crate: { max_stable_version: string | null; max_version: string; updated_at: string }; versions: Array<{ num: string; created_at: string; yanked: boolean }> }>(
    `https://crates.io/api/v1/crates/${encodeURIComponent(pkg)}`,
  );
  if (!d) return { version: '', missing: true };
  const pick = latestStable(d.versions.filter(v => !v.yanked).map(v => v.num), stability);
  if (!pick) return null;
  const v = d.versions.find(x => x.num === pick.tag);
  return { version: pick.tag, updated: v?.created_at.slice(0, 10), note: fallbackNote(pick.fallback) };
};

// --- Docker Hub ------------------------------------------------------------------------------
const dockerhub: Tracker = async (pkg, stability) => {
  if (!pkg) throw new Error('update.package manquant (org/image)');
  const repo = pkg.includes('/') ? pkg : `library/${pkg}`;
  const d = await getJson<{ results: Array<{ name: string; tag_last_pushed: string }> }>(
    `https://hub.docker.com/v2/repositories/${repo}/tags?page_size=100&ordering=last_updated`,
  );
  if (!d) return { version: '', missing: true };
  // On ignore les tags flottants (latest, stable, edge) : ils ne disent pas ce qu'on télécharge.
  const numeric = d.results.filter(t => /\d/.test(t.name) && !/^sha256/.test(t.name));
  const pick = latestStable(numeric.map(t => t.name), stability);
  if (!pick) return null;
  return { version: pick.tag, updated: numeric.find(t => t.name === pick.tag)?.tag_last_pushed.slice(0, 10), note: fallbackNote(pick.fallback) };
};

// --- ROS 2 (rosdistro) -----------------------------------------------------------------------
const rosdistro: Tracker = async (pkg, stability) => {
  const text = await getJson<string>('https://raw.githubusercontent.com/ros/rosdistro/master/index-v4.yaml', 'text/plain');
  if (!text) return null;
  const distros = parseRosdistroIndex(text);
  if (!distros.length) throw new Error('index-v4.yaml illisible — sa forme a changé ?');
  const active = distros.filter(d => d.type === 'ros2' && d.name !== 'rolling' && d.status === 'active');
  if (pkg) {
    const d = distros.find(x => x.name === pkg && x.type === 'ros2');
    if (!d) return { version: pkg, missing: true };
    const newerLts = active.filter(x => ROS2_LTS.has(x.name) && x.name > pkg).map(x => x.name).sort();
    return {
      version: pkg,
      note: d.status !== 'active' ? `distribution ${pkg} en fin de vie (${d.status}) — passer à ${newerLts.at(-1) ?? 'la LTS suivante'}`
        : newerLts.length ? `une LTS plus récente est active : ${newerLts.at(-1)}` : undefined,
    };
  }
  const lts = latestActiveRos2Lts(distros);
  if (stability === 'any') { const any = active.map(d => d.name).sort().at(-1); return any ? { version: any } : null; }
  if (lts) return { version: lts };
  const fallback = active.map(d => d.name).sort().at(-1);
  return fallback ? { version: fallback, note: 'aucune LTS active connue — vérifier ROS2_LTS dans registries-parse.ts' } : null;
};

// --- Node.js LTS -----------------------------------------------------------------------------
const nodeLts: Tracker = async (_pkg, stability) => {
  const d = await getJson<Array<{ version: string; lts: string | false; date: string }>>('https://nodejs.org/dist/index.json');
  if (!d) return null;
  const entry = pickNode(d, stability);
  if (!entry) return null;
  return { version: entry.version, updated: entry.date, note: entry.lts ? `LTS « ${entry.lts} »` : 'pas encore promue LTS' };
};

// --- Debian stable ---------------------------------------------------------------------------
const debian: Tracker = async () => {
  const text = await getJson<string>('https://deb.debian.org/debian/dists/stable/Release', 'text/plain');
  if (!text) return null;
  const rel = parseDebianRelease(text);
  if (!rel) throw new Error('fichier Release illisible');
  return { version: `${rel.version} (${rel.codename})`, updated: rel.date };
};

// --- Ubuntu LTS ------------------------------------------------------------------------------
const ubuntuLts: Tracker = async () => {
  const text = await getJson<string>('https://changelogs.ubuntu.com/meta-release-lts', 'text/plain');
  if (!text) return null;
  const rel = parseUbuntuMetaRelease(text);
  if (!rel) throw new Error('meta-release-lts illisible');
  return { version: `${rel.version} (${rel.dist})`, updated: rel.date };
};

// --- Raspberry Pi OS -------------------------------------------------------------------------
// `update.package` est une expression sur le nom de l'image, ex. "Raspberry Pi OS Lite \\(64-bit\\)".
const raspios: Tracker = async (pkg) => {
  if (!pkg) throw new Error('update.package manquant (motif sur le nom de l’image)');
  const list = await getJson<unknown>('https://downloads.raspberrypi.com/os_list_imagingutility_v4.json');
  if (!list) return null;
  const img = pickRaspiosImage(list, pkg);
  if (!img) return { version: '', missing: true };
  const version = /(\d{4}-\d{2}-\d{2})/.exec(img.url)?.[1] ?? img.release_date ?? img.url.split('/').pop()!;
  return { version, updated: img.release_date, note: img.image_download_sha256 ? `sha256 ${img.image_download_sha256.slice(0, 12)}… (${img.url})` : undefined };
};

const TRACKERS: Record<string, Tracker> = { npm, pypi, crates, dockerhub, rosdistro, 'node-lts': nodeLts, debian, 'ubuntu-lts': ubuntuLts, raspios };

async function main() {
  const files = loadResourceFiles();
  const cache = new Map<string, Found | null>(); // même registre + même paquet = une seule requête
  for (const rf of files) {
    for (let i = 0; i < rf.items.length; i++) {
      const r = rf.items[i]!;
      const tracker = r.update?.tracker;
      if (!tracker || !(tracker in TRACKERS)) continue;
      const stability: Stability = r.update?.stability ?? 'stable';
      const key = `${tracker}:${r.update?.package ?? ''}:${stability}`;
      try {
        let found = cache.get(key);
        if (found === undefined) { found = await TRACKERS[tracker]!(r.update?.package, stability, r.version); cache.set(key, found); }
        if (!found) { console.warn(`${r.id}: ${tracker} n'a rien rendu`); continue; }
        if (found.missing) { if (r.status !== 'missing') setField(rf, i, 'status', 'missing', `${tracker}: introuvable`); markChecked(rf, i); continue; }
        setField(rf, i, 'version', found.version, found.version !== r.version ? `nouvelle version stable (${tracker})` : undefined);
        if (found.updated) setField(rf, i, 'updated', found.updated);
        if (found.note) setUpdaterNote(rf, i, found.note, found.note);
        if (r.status === 'unverified' || r.status === 'missing') setField(rf, i, 'status', 'active');
        markChecked(rf, i);
      } catch (e) {
        console.warn(`${r.id}: ${(e as Error).message}`);
      }
    }
  }
  if (!dry) saveResourceFiles(files);
  writeReport('registries');
}
main().catch(e => { console.error(e); process.exit(1); });
