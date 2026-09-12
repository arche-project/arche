// Index de paquets et fermeture de dépendances : Debian/Ubuntu (`Packages`) et Alpine (`APKINDEX`).
// Package indexes and dependency closure: Debian/Ubuntu (`Packages`) and Alpine (`APKINDEX`).
//
// C'est ce qui rend un miroir PARTIEL installable. On ne peut pas copier tous les paquets du monde,
// mais on peut, à partir d'une courte liste (« hostapd, git, python3, build-essential »), calculer
// exactement les paquets qu'il faut pour que `apt install` ou `apk add` réussissent sans réseau —
// et pas un de plus. Tout ici est pur : du texte en entrée, une liste en sortie, testable sans réseau.
//
// This is what makes a PARTIAL mirror installable: from a short list of packages, compute the exact
// set needed for `apt install` / `apk add` to succeed offline. Pure functions, tested offline.

export interface Pkg {
  name: string;
  version: string;
  arch?: string;
  /** Dépendances dures : chaque élément est une liste d'alternatives (`a | b` en Debian). */
  depends: string[][];
  /** Dépendances douces (Recommends en Debian ; Alpine n'en a pas). */
  recommends: string[][];
  /** Noms virtuels fournis (`Provides:` / `p:`), sans version. */
  provides: string[];
  /** Chemin relatif du fichier dans le dépôt. */
  filename: string;
  size: number;
  sha256?: string;
}

export interface PkgIndex {
  format: 'deb' | 'apk';
  byName: Map<string, Pkg>;
  /** nom virtuel → paquets qui le fournissent. */
  providers: Map<string, Pkg[]>;
}

const stripVersion = (s: string): string => s.replace(/\s*\(.*?\)\s*/g, '').replace(/[<>=~!].*$/, '').replace(/:any$/, '').trim();

/** `Packages` de Debian/Ubuntu : stanzas RFC 822, séparées par une ligne vide. */
export function parseDebianPackages(text: string): PkgIndex {
  const idx: PkgIndex = { format: 'deb', byName: new Map(), providers: new Map() };
  for (const stanza of text.split(/\n\s*\n/)) {
    const f: Record<string, string> = {};
    let last = '';
    for (const line of stanza.split('\n')) {
      if (/^\s/.test(line) && last) { f[last] += '\n' + line.trim(); continue; } // continuation
      const m = /^([A-Za-z0-9-]+):\s*(.*)$/.exec(line);
      if (m) { last = m[1]!; f[last] = m[2]!; }
    }
    if (!f['Package'] || !f['Filename']) continue;
    const alts = (s?: string): string[][] => (s ? s.split(',').map(a => a.split('|').map(x => stripVersion(x)).filter(Boolean)).filter(a => a.length) : []);
    const pkg: Pkg = {
      name: f['Package'],
      version: f['Version'] ?? '',
      arch: f['Architecture'],
      depends: [...alts(f['Pre-Depends']), ...alts(f['Depends'])],
      recommends: alts(f['Recommends']),
      provides: (f['Provides'] ?? '').split(',').map(stripVersion).filter(Boolean),
      filename: f['Filename'],
      size: Number(f['Size'] ?? 0),
      sha256: f['SHA256'],
    };
    // Plusieurs versions du même paquet peuvent coexister : on garde la première rencontrée par
    // nom, ce qui correspond à l'ordre du fichier (le plus souvent la plus récente en dernier — on
    // préfère donc la plus haute version si on en voit deux).
    const prev = idx.byName.get(pkg.name);
    if (!prev || compareDebVersion(pkg.version, prev.version) > 0) idx.byName.set(pkg.name, pkg);
    for (const p of pkg.provides) idx.providers.set(p, [...(idx.providers.get(p) ?? []), pkg]);
  }
  return idx;
}

/** Comparaison de versions Debian, suffisante pour départager deux entrées (epoch, upstream, revision). */
export function compareDebVersion(a: string, b: string): number {
  const split = (v: string): [number, string, string] => {
    const m = /^(?:(\d+):)?(.*?)(?:-([^-]*))?$/.exec(v)!;
    return [Number(m[1] ?? 0), m[2] ?? '', m[3] ?? ''];
  };
  const [ea, ua, ra] = split(a); const [eb, ub, rb] = split(b);
  if (ea !== eb) return ea - eb;
  const cmp = (x: string, y: string): number => {
    const tx = x.match(/\d+|[^\d]+/g) ?? []; const ty = y.match(/\d+|[^\d]+/g) ?? [];
    for (let i = 0; i < Math.max(tx.length, ty.length); i++) {
      const p = tx[i] ?? ''; const q = ty[i] ?? '';
      if (p === q) continue;
      const np = /^\d+$/.test(p); const nq = /^\d+$/.test(q);
      if (np && nq) return Number(p) - Number(q);
      return p < q ? -1 : 1;
    }
    return 0;
  };
  return cmp(ua, ub) || cmp(ra, rb);
}

/**
 * `APKINDEX` d'Alpine : entrées séparées par une ligne vide, une lettre-clé par ligne.
 *   P: nom  V: version  A: arch  D: dépendances (séparées par des espaces)  p: provides  S: taille  C: checksum
 * Les dépendances peuvent être `so:libfoo.so.1`, `cmd:bash`, `pc:…`, avec contrainte `>=1.2`, ou `!nom`
 * (conflit, ignoré ici). `p:` liste ce que le paquet fournit, avec `=version` éventuel.
 */
export function parseApkIndex(text: string): PkgIndex {
  const idx: PkgIndex = { format: 'apk', byName: new Map(), providers: new Map() };
  for (const entry of text.split(/\n\s*\n/)) {
    const f: Record<string, string> = {};
    for (const line of entry.split('\n')) {
      const m = /^([A-Za-z]):(.*)$/.exec(line);
      if (m) f[m[1]!] = m[2]!;
    }
    if (!f['P']) continue;
    const name = f['P']; const version = f['V'] ?? '';
    const deps = (f['D'] ?? '').split(/\s+/).filter(Boolean).filter(d => !d.startsWith('!')).map(d => [d.replace(/[<>=~].*$/, '')]);
    const provides = (f['p'] ?? '').split(/\s+/).filter(Boolean).map(p => p.replace(/=.*$/, ''));
    const pkg: Pkg = {
      name, version, arch: f['A'], depends: deps, recommends: [], provides,
      filename: `${name}-${version}.apk`, size: Number(f['S'] ?? 0),
    };
    idx.byName.set(name, pkg);
    for (const p of provides) idx.providers.set(p, [...(idx.providers.get(p) ?? []), pkg]);
    // Un paquet se fournit lui-même sous `cmd:` et son propre nom pour les résolutions simples.
  }
  return idx;
}

export interface ClosureResult {
  packages: Pkg[];
  totalBytes: number;
  /** Dépendances qu'aucun paquet ne satisfait : le miroir sera incomplet, il faut le dire. */
  unresolved: Array<{ from: string; dep: string }>;
}

/** Trouve qui satisfait un nom : le paquet lui-même, sinon un fournisseur virtuel. */
function resolve(idx: PkgIndex, name: string): Pkg | null {
  const direct = idx.byName.get(name);
  if (direct) return direct;
  const prov = idx.providers.get(name);
  if (prov?.length) return prov[0]!;
  return null;
}

/**
 * Fermeture transitive des dépendances à partir d'une liste de paquets racine.
 * Pour une alternative `a | b`, on prend la première qui existe — c'est ce que fait apt en
 * l'absence de préférence. `recommends: true` suit aussi les Recommends (Debian), ce qui gonfle
 * le miroir mais rapproche du comportement par défaut d'apt.
 *
 * Transitive dependency closure from root packages.
 */
export function closure(idx: PkgIndex, roots: readonly string[], opts: { recommends?: boolean } = {}): ClosureResult {
  const seen = new Map<string, Pkg>();
  const unresolved: ClosureResult['unresolved'] = [];
  const stack = [...roots.map(r => ({ from: '(racine)', name: r }))];
  while (stack.length) {
    const { from, name } = stack.pop()!;
    const pkg = resolve(idx, name);
    if (!pkg) { if (!unresolved.some(u => u.dep === name)) unresolved.push({ from, dep: name }); continue; }
    if (seen.has(pkg.name)) continue;
    seen.set(pkg.name, pkg);
    const groups = opts.recommends ? [...pkg.depends, ...pkg.recommends] : pkg.depends;
    for (const alts of groups) {
      const pick = alts.find(a => resolve(idx, a));
      if (pick) stack.push({ from: pkg.name, name: pick });
      else if (alts.length && !opts.recommends) unresolved.push({ from: pkg.name, dep: alts.join(' | ') });
      else if (alts.length && pkg.depends.includes(alts)) unresolved.push({ from: pkg.name, dep: alts.join(' | ') });
    }
  }
  const packages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { packages, totalBytes: packages.reduce((s, p) => s + p.size, 0), unresolved };
}
