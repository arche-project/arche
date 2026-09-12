// Téléchargement avec reprise (Range), fichier .part, vérification d'intégrité, et dispatch par type de source.
// Resumable download (Range), .part file, integrity check, and per-source-kind dispatch.
//
// Principes :
//  - On n'écrit jamais directement le fichier final : <dest>.part, renommé après vérification (atomique).
//  - Une machine hors-ligne ne lance rien : `resolve()` échoue proprement et la ressource passe en "manual".
//  - Les sources non-HTTP (ollama, git) délèguent au binaire idoine, en streaming la sortie.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { Resource } from './types.js';
import { resolveKiwix } from './kiwix.js';
import { fetchExpectedChecksum, verifyFile } from './integrity.js';
import { destDirFor, loadState, saveState, relPath } from './state.js';

export interface Progress { id: string; phase: 'resolve' | 'download' | 'verify' | 'done' | 'skip' | 'manual' | 'error'; done?: number; total?: number; message?: string }
export type OnProgress = (p: Progress) => void;

export interface Resolved { url: string; filename: string; size?: number; version?: string | null; checksum?: { algo: 'sha256' | 'md5' | 'sha1'; value: string } | null }

/** Traduit la source du catalogue en URL concrète (peut nécessiter le réseau). */
export async function resolve(r: Resource): Promise<Resolved | null> {
  const s = r.source;
  switch (s.kind) {
    case 'kiwix': {
      if (s.kiwix_name) {
        const e = await resolveKiwix(s.kiwix_name);
        if (e) return { url: e.url, filename: path.basename(new URL(e.url).pathname), size: e.size_bytes, version: e.version };
      }
      if (s.url) return { url: s.url, filename: path.basename(new URL(s.url).pathname), version: r.version };
      return null;
    }
    case 'http':
    case 'arche-hosted':
    case 'huggingface': {
      if (!s.url) return null;
      return { url: s.url, filename: s.hf_file ?? path.basename(new URL(s.url).pathname), version: r.version, checksum: r.checksum?.value ? { algo: r.checksum.algo, value: r.checksum.value } : null };
    }
    case 'github-release': {
      if (!s.github_repo) return s.url ? { url: s.url, filename: path.basename(s.url) } : null;
      const api = await fetch(`https://api.github.com/repos/${s.github_repo}/releases/latest`, { headers: ghHeaders(), signal: AbortSignal.timeout(20000) });
      if (!api.ok) throw new Error(`GitHub API ${api.status}`);
      const rel = await api.json() as { tag_name: string; assets: Array<{ name: string; browser_download_url: string; size: number }> };
      const re = s.github_asset_pattern ? new RegExp(s.github_asset_pattern) : null;
      const asset = rel.assets.find(a => (re ? re.test(a.name) : true) && matchesPlatform(a.name));
      if (!asset) return null;
      return { url: asset.browser_download_url, filename: asset.name, size: asset.size, version: rel.tag_name };
    }
    default:
      return null; // ollama, github-repo, manual : gérés par install()
  }
}

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': 'arche-wizard', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

/** Heuristique : un asset dont le nom cite une autre plateforme est écarté. */
function matchesPlatform(name: string): boolean {
  const n = name.toLowerCase();
  const os = process.platform, arch = process.arch;
  const otherOs = [['win', 'windows', '.exe', 'msi'], ['darwin', 'macos', 'mac', '.dmg'], ['linux', 'ubuntu', '.appimage', '.deb']];
  const mine = os === 'win32' ? 0 : os === 'darwin' ? 1 : 2;
  for (let i = 0; i < 3; i++) if (i !== mine && otherOs[i].some(k => n.includes(k))) return false;
  if (arch === 'arm64' && /(x86_64|amd64|x64)/.test(n)) return false;
  if (arch === 'x64' && /(aarch64|arm64|armhf|armv7)/.test(n)) return false;
  return true;
}

/** Télécharge avec reprise. Retourne le chemin final. */
export async function downloadFile(url: string, dest: string, opts: { expectedSize?: number; onProgress?: (done: number, total?: number) => void; retries?: number } = {}): Promise<string> {
  const part = dest + '.part';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const retries = opts.retries ?? 5;
  for (let attempt = 0; ; attempt++) {
    const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
    try {
      const headers: Record<string, string> = { 'User-Agent': 'arche-wizard' };
      if (have > 0) headers.Range = `bytes=${have}-`;
      const res = await fetch(url, { headers, redirect: 'follow' });
      if (res.status === 416) { break; }                                  // déjà complet
      if (res.status === 200 && have > 0) { fs.truncateSync(part, 0); }   // serveur sans Range : on repart de zéro
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
      const offset = res.status === 206 ? have : 0;
      const total = (() => {
        const cr = res.headers.get('content-range'); if (cr) return Number(cr.split('/')[1]);
        const cl = res.headers.get('content-length'); return cl ? Number(cl) + offset : opts.expectedSize;
      })();
      let done = offset;
      const out = fs.createWriteStream(part, { flags: offset ? 'a' : 'w' });
      const body = Readable.fromWeb(res.body as never);
      body.on('data', (c: Buffer) => { done += c.length; opts.onProgress?.(done, total); });
      await pipeline(body, out);
      break;
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise(r => setTimeout(r, Math.min(30000, 1000 * 2 ** attempt)));
    }
  }
  fs.renameSync(part, dest);
  return dest;
}

function run(cmd: string, args: string[], cwd?: string, onLine?: (l: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const feed = (b: Buffer) => b.toString().split(/\r?\n/).filter(Boolean).forEach(l => onLine?.(l));
    p.stdout.on('data', feed); p.stderr.on('data', feed);
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

/** Installe une ressource dans la bibliothèque. Idempotent. */
export async function install(r: Resource, lib: string, onProgress: OnProgress = () => {}): Promise<void> {
  const state = loadState(lib);
  const destDir = path.join(lib, destDirFor(r.type));
  fs.mkdirSync(destDir, { recursive: true });
  const s = r.source;

  try {
    if (s.kind === 'ollama' && s.ollama_model) {
      onProgress({ id: r.id, phase: 'download', message: s.ollama_model });
      // OLLAMA_MODELS pointe vers la bibliothèque pour que les poids vivent sur le disque externe.
      process.env.OLLAMA_MODELS = process.env.OLLAMA_MODELS ?? path.join(lib, 'models', 'ollama');
      await run('ollama', ['pull', s.ollama_model], undefined, l => onProgress({ id: r.id, phase: 'download', message: l }));
      state.installed[r.id] = { id: r.id, path: 'models/ollama', version: null, size_bytes: Math.round((r.size_estimate_gb ?? 0) * 1e9), installed_at: new Date().toISOString(), source_url: `ollama://${s.ollama_model}` };
      saveState(lib, state); onProgress({ id: r.id, phase: 'done' }); return;
    }

    if (s.kind === 'github-repo' && s.url) {
      const target = path.join(destDir, `${r.id}.git`);
      onProgress({ id: r.id, phase: 'download', message: s.url });
      if (fs.existsSync(target)) await run('git', ['--git-dir', target, 'remote', 'update', '--prune'], undefined, l => onProgress({ id: r.id, phase: 'download', message: l }));
      else await run('git', ['clone', '--mirror', s.url, target], undefined, l => onProgress({ id: r.id, phase: 'download', message: l }));
      if (s.include_wiki && s.github_repo) {
        const wiki = path.join(destDir, `${r.id}.wiki.git`);
        try { await run('git', fs.existsSync(wiki) ? ['--git-dir', wiki, 'remote', 'update'] : ['clone', '--mirror', `https://github.com/${s.github_repo}.wiki.git`, wiki]); }
        catch { onProgress({ id: r.id, phase: 'download', message: 'wiki: none or inaccessible' }); }
      }
      if (s.include_releases && s.github_repo) {
        const res = await resolve({ ...r, source: { ...s, kind: 'github-release' } }).catch(() => null);
        if (res) await downloadFile(res.url, path.join(destDir, `${r.id}-releases`, res.filename), { onProgress: (d, t) => onProgress({ id: r.id, phase: 'download', done: d, total: t }) });
      }
      // bundle portable : un seul fichier copiable sur clé USB, restaurable avec `git clone <file>.bundle`
      await run('git', ['--git-dir', target, 'bundle', 'create', path.join(destDir, `${r.id}.bundle`), '--all']);
      state.installed[r.id] = { id: r.id, path: relPath(lib, target), version: null, size_bytes: dirSize(target), installed_at: new Date().toISOString(), source_url: s.url };
      saveState(lib, state); onProgress({ id: r.id, phase: 'done' }); return;
    }

    if (s.kind === 'manual' || r.type === 'toolchain') {
      onProgress({ id: r.id, phase: 'manual', message: s.url ?? s.homepage ?? '' });
      return;
    }

    onProgress({ id: r.id, phase: 'resolve' });
    const res = await resolve(r);
    if (!res) { onProgress({ id: r.id, phase: 'manual', message: s.homepage ?? s.url ?? '' }); return; }

    const dest = path.join(destDir, res.filename);
    const already = state.installed[r.id];
    if (fs.existsSync(dest) && already && already.version === (res.version ?? null)) { onProgress({ id: r.id, phase: 'skip' }); return; }

    await downloadFile(res.url, dest, { expectedSize: res.size, onProgress: (d, t) => onProgress({ id: r.id, phase: 'download', done: d, total: t }) });

    onProgress({ id: r.id, phase: 'verify' });
    const expected = res.checksum ?? await fetchExpectedChecksum(res.url, r.checksum?.url);
    let checksum: { algo: string; value: string } | null = null;
    if (expected) {
      const ok = await verifyFile(dest, expected, d => onProgress({ id: r.id, phase: 'verify', done: d, total: res.size }));
      if (!ok) { fs.unlinkSync(dest); throw new Error('checksum mismatch'); }
      checksum = expected;
    } else if (res.size && fs.statSync(dest).size !== res.size) {
      fs.unlinkSync(dest); throw new Error('size mismatch');
    }
    // ancienne version du même ZIM : on la supprime après succès seulement
    if (already && already.path !== relPath(lib, dest) && fs.existsSync(path.join(lib, already.path))) fs.unlinkSync(path.join(lib, already.path));
    state.installed[r.id] = { id: r.id, path: relPath(lib, dest), version: res.version ?? null, size_bytes: fs.statSync(dest).size, checksum, installed_at: new Date().toISOString(), verified_at: checksum ? new Date().toISOString() : null, source_url: res.url };
    saveState(lib, state);
    onProgress({ id: r.id, phase: 'done' });
  } catch (e) {
    onProgress({ id: r.id, phase: 'error', message: (e as Error).message });
    throw e;
  }
}

function dirSize(dir: string): number {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
}
