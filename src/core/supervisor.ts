// Superviseur de services : ce que `docker compose` faisait, sans démon (ADR 0008).
// Service supervisor: what `docker compose` did, with no daemon (ADR 0008).
//
// Les services de la bibliothèque — kiwix-serve, Ollama, Gitea — sont des binaires ordinaires
// installés dans la bibliothèque. On les lance comme des processus enfants, on les relance s'ils
// tombent (délai croissant, plafonné), on écrit un seul journal lisible, et on les arrête
// proprement. Rien ici n'exige autre chose que Node : c'est le point.
//
// Library services are plain binaries; we spawn, restart with capped backoff, log to one file,
// and shut down cleanly. Nothing here needs anything but Node.

import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface ServiceSpec {
  /** Nom court, préfixe des lignes de journal. */
  name: string;
  /** Chemin du binaire. */
  bin: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Port annoncé à l'utilisateur, purement informatif. */
  port?: number;
}

export interface SupervisorOptions {
  /** Dossier du journal (`arche.log`) ; créé si absent. */
  logDir: string;
  /** Recopie aussi la sortie des services sur la console. */
  echo?: boolean;
  /** Délai initial avant relance, en ms. */
  baseDelayMs?: number;
  /** Plafond du délai de relance. */
  maxDelayMs?: number;
  /** Au-delà, on cesse de relancer et on le dit — un service qui tombe 10 fois a besoin d'un humain. */
  maxRestarts?: number;
  /** Un service qui a tenu au moins ce temps remet son compteur à zéro. */
  stableAfterMs?: number;
}

export type ServiceState = 'starting' | 'running' | 'restarting' | 'stopped' | 'failed';

export interface ServiceStatus {
  name: string;
  state: ServiceState;
  pid?: number;
  restarts: number;
  port?: number;
  lastExit?: { code: number | null; signal: NodeJS.Signals | null; at: string };
}

/**
 * Délai avant la n-ième relance : exponentiel, plafonné. Pur, donc testé.
 *   0 → base, 1 → 2·base, 2 → 4·base … jusqu'à max.
 */
export function backoffDelay(attempt: number, baseMs = 1000, maxMs = 60_000): number {
  if (attempt < 0) return baseMs;
  const d = baseMs * 2 ** Math.min(attempt, 30);
  return Math.min(d, maxMs);
}

/**
 * Cherche un exécutable : d'abord dans la bibliothèque (`software/`, récursif), puis dans le PATH.
 * La bibliothèque passe avant le système : c'est la version qu'on a vérifiée et qu'on peut
 * réinstaller depuis le disque.
 */
export function findBinary(lib: string, name: string): string | null {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const root = path.join(lib, 'software');
  if (fs.existsSync(root)) {
    const stack = [root];
    while (stack.length) {
      const d = stack.pop()!;
      let entries: fs.Dirent[] = [];
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.name === exe) return p;
      }
    }
  }
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [exe], { stdio: 'ignore' });
    return exe;
  } catch { return null; }
}

interface Managed {
  spec: ServiceSpec;
  child?: ChildProcess;
  state: ServiceState;
  restarts: number;
  startedAt: number;
  timer?: NodeJS.Timeout;
  lastExit?: ServiceStatus['lastExit'];
}

export class Supervisor {
  private readonly services = new Map<string, Managed>();
  private readonly opts: Required<SupervisorOptions>;
  private readonly log: fs.WriteStream;
  private stopping = false;

  constructor(opts: SupervisorOptions) {
    this.opts = { echo: false, baseDelayMs: 1000, maxDelayMs: 60_000, maxRestarts: 10, stableAfterMs: 60_000, ...opts };
    fs.mkdirSync(this.opts.logDir, { recursive: true });
    this.log = fs.createWriteStream(path.join(this.opts.logDir, 'arche.log'), { flags: 'a' });
  }

  get logFile(): string { return path.join(this.opts.logDir, 'arche.log'); }

  /** Lance les services. Ceux dont le binaire manque sont signalés, pas fatals. */
  start(specs: readonly ServiceSpec[]): void {
    for (const spec of specs) {
      if (this.services.has(spec.name)) continue;
      const m: Managed = { spec, state: 'starting', restarts: 0, startedAt: 0 };
      this.services.set(spec.name, m);
      this.launch(m);
    }
  }

  status(): ServiceStatus[] {
    return [...this.services.values()].map(m => ({
      name: m.spec.name, state: m.state, pid: m.child?.pid, restarts: m.restarts, port: m.spec.port, lastExit: m.lastExit,
    }));
  }

  /** Arrêt propre : SIGTERM, puis SIGKILL après `graceMs`. */
  async stop(graceMs = 5000): Promise<void> {
    this.stopping = true;
    const waits: Promise<void>[] = [];
    for (const m of this.services.values()) {
      if (m.timer) clearTimeout(m.timer);
      const child = m.child;
      if (!child || child.exitCode !== null || child.signalCode !== null) { m.state = 'stopped'; continue; }
      waits.push(new Promise<void>(resolve => {
        const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* déjà mort */ } }, graceMs);
        child.once('exit', () => { clearTimeout(killer); m.state = 'stopped'; resolve(); });
        try { child.kill('SIGTERM'); } catch { clearTimeout(killer); resolve(); }
      }));
    }
    await Promise.all(waits);
    this.write('supervisor', 'arrêt propre / clean shutdown');
    await new Promise<void>(r => this.log.end(r));
  }

  private launch(m: Managed): void {
    const { spec } = m;
    if (!fs.existsSync(spec.bin) && !/^[^/\\]+$/.test(spec.bin)) {
      m.state = 'failed';
      this.write(spec.name, `binaire introuvable : ${spec.bin}`);
      return;
    }
    let child: ChildProcess;
    try {
      child = spawn(spec.bin, spec.args, { cwd: spec.cwd, env: { ...process.env, ...(spec.env ?? {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      m.state = 'failed';
      this.write(spec.name, `lancement impossible : ${(e as Error).message}`);
      return;
    }
    m.child = child;
    m.state = 'running';
    m.startedAt = Date.now();
    this.write(spec.name, `démarré pid ${child.pid}${spec.port ? ` port ${spec.port}` : ''} — ${spec.bin} ${spec.args.join(' ')}`);
    child.stdout?.on('data', d => this.write(spec.name, String(d).trimEnd()));
    child.stderr?.on('data', d => this.write(spec.name, String(d).trimEnd()));
    child.on('error', e => this.write(spec.name, `erreur : ${e.message}`));
    child.on('exit', (code, signal) => {
      m.lastExit = { code, signal, at: new Date().toISOString() };
      if (this.stopping) { m.state = 'stopped'; return; }
      // Un service qui a tenu longtemps a droit à un compteur neuf : on ne punit pas un plantage
      // isolé après trois jours de service par un délai d'une minute.
      if (Date.now() - m.startedAt > this.opts.stableAfterMs) m.restarts = 0;
      if (m.restarts >= this.opts.maxRestarts) {
        m.state = 'failed';
        this.write(spec.name, `tombé ${m.restarts} fois de suite (code ${code}, signal ${signal}) : on n'insiste plus. Voir ${this.logFile}`);
        return;
      }
      const delay = backoffDelay(m.restarts, this.opts.baseDelayMs, this.opts.maxDelayMs);
      m.restarts++;
      m.state = 'restarting';
      this.write(spec.name, `sorti (code ${code}, signal ${signal}) — relance n°${m.restarts} dans ${Math.round(delay / 1000)} s`);
      m.timer = setTimeout(() => this.launch(m), delay);
      m.timer.unref?.();
    });
  }

  private write(name: string, line: string): void {
    if (!line) return;
    const stamped = line.split('\n').map(l => `${new Date().toISOString()} [${name}] ${l}`).join('\n') + '\n';
    this.log.write(stamped);
    if (this.opts.echo) process.stdout.write(stamped);
  }
}

/**
 * Découvre les services lançables depuis la bibliothèque. Un service absent n'est pas une erreur :
 * on lance ce qu'on a. L'ordre est celui de l'utilité — Kiwix d'abord, c'est la bibliothèque.
 *
 * Discovers launchable services from the library; missing ones are skipped, not fatal.
 */
export function discoverServices(
  lib: string,
  o: { bind: string; kiwixPort: number; ollamaPort?: number; giteaPort?: number; zims: string[]; disable?: string[] },
): { specs: ServiceSpec[]; missing: string[] } {
  const specs: ServiceSpec[] = [];
  const missing: string[] = [];
  const off = new Set(o.disable ?? []);

  if (!off.has('kiwix')) {
    const bin = findBinary(lib, 'kiwix-serve');
    if (bin && o.zims.length) specs.push({ name: 'kiwix', bin, args: ['--port', String(o.kiwixPort), '--address', o.bind, ...o.zims], port: o.kiwixPort });
    else if (!bin) missing.push('kiwix-serve');
  }
  if (!off.has('ollama')) {
    const bin = findBinary(lib, 'ollama');
    const port = o.ollamaPort ?? 11434;
    if (bin) specs.push({ name: 'ollama', bin, args: ['serve'], port, env: { OLLAMA_MODELS: path.join(lib, 'models'), OLLAMA_HOST: `${o.bind}:${port}` } });
    else missing.push('ollama');
  }
  if (!off.has('gitea')) {
    const bin = findBinary(lib, 'gitea');
    const port = o.giteaPort ?? 3000;
    const work = path.join(lib, 'gitea');
    if (bin) {
      fs.mkdirSync(work, { recursive: true });
      specs.push({ name: 'gitea', bin, args: ['web', '--port', String(port), '--work-path', work], port, cwd: work, env: { GITEA_WORK_DIR: work } });
    } else missing.push('gitea');
  }
  return { specs, missing };
}
