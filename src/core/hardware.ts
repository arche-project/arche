// Détection matérielle best-effort, sans dépendance native.
// Best-effort hardware detection, no native dependency.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Hardware } from './types.js';

function has(cmd: string): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  try { execFileSync(probe, [cmd], { stdio: 'ignore' }); return true; } catch { return false; }
}

function detectGpu(): { vram_gb: number; name?: string } {
  // NVIDIA
  try {
    const out = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const [name, mem] = out.trim().split('\n')[0].split(',').map(s => s.trim());
    return { vram_gb: Math.round(Number(mem) / 1024), name };
  } catch { /* pas de nvidia-smi */ }
  // Apple Silicon : mémoire unifiée → la RAM sert de VRAM (on en compte ~70 %)
  if (process.platform === 'darwin' && os.arch() === 'arm64') {
    return { vram_gb: Math.floor(os.totalmem() / 1e9 * 0.7), name: 'Apple Silicon (unified memory)' };
  }
  // AMD sous Linux : lecture sysfs
  try {
    for (const card of fs.readdirSync('/sys/class/drm').filter(d => /^card\d+$/.test(d))) {
      const f = `/sys/class/drm/${card}/device/mem_info_vram_total`;
      if (fs.existsSync(f)) return { vram_gb: Math.round(Number(fs.readFileSync(f, 'utf8')) / 1e9), name: 'AMD (sysfs)' };
    }
  } catch { /* ignore */ }
  return { vram_gb: 0 };
}

export async function diskFreeGb(dir: string): Promise<number> {
  let probe = dir;
  while (!fs.existsSync(probe)) { const parent = path.dirname(probe); if (parent === probe) break; probe = parent; }
  try {
    const s = await fs.promises.statfs(probe);
    return (Number(s.bavail) * Number(s.bsize)) / 1e9;
  } catch { return 0; }
}

export async function isOnline(timeoutMs = 3000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch('https://library.kiwix.org/catalog/v2/root.xml', { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(t);
    return r.ok || r.status < 500;
  } catch { return false; }
}

export async function detectHardware(targetDir: string, opts: { skipOnlineCheck?: boolean } = {}): Promise<Hardware> {
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
  const archRaw = os.arch();
  const arch = archRaw === 'arm64' ? 'arm64' : archRaw === 'arm' ? 'armv7' : 'x64';
  const gpu = detectGpu();
  return {
    os: platform,
    arch,
    ram_gb: Math.round(os.totalmem() / 1e9),
    vram_gb: gpu.vram_gb,
    gpu_name: gpu.name,
    disk_free_gb: await diskFreeGb(targetDir),
    tools: Object.fromEntries(['git', 'ollama', 'docker', 'python3', 'pip', 'kiwix-serve', 'cmake', 'ninja', 'apt'].map(t => [t, has(t)])),
    online: opts.skipOnlineCheck ? false : await isOnline(),
  };
}
