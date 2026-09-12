// La file de tâches qui survit : une heure de calcul sur une petite machine ne doit pas se perdre
// à cause d'une coupure de courant (ADR 0012). Chaque étape est enregistrée sur disque avant et
// après ; au redémarrage, on reprend à l'étape où on en était, jamais du début.
// The job queue that survives: an hour of compute on a small machine must not be lost to a power
// cut (ADR 0012). Every step is recorded on disk before and after; on restart, resume where we were.
//
// Pas de démon (ADR 0008) : la file est un dossier de fichiers JSON, `.arche/jobs/`, et un
// exécuteur qu'on lance quand on veut (`arche jobs run`, ou depuis le superviseur). Deux exécuteurs
// sur la même file se partagent les tâches par verrou de fichier.

import fs from 'node:fs';
import path from 'node:path';
import { backoffDelay } from './supervisor.js';

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface JobStep {
  id: string;
  /** Nom du gestionnaire (ex. `ollama.generate`, `shell`, `garden_plan`) ; l'exécuteur le résout. */
  kind: string;
  /** Entrée sérialisable ; les gros fichiers passent par un chemin, pas par ici. */
  input: unknown;
  status: 'pending' | 'done' | 'failed';
  /** Sortie sérialisable (ou chemin du fichier produit). */
  output?: unknown;
  attempts: number;
  error?: string;
  started_at?: string;
  finished_at?: string;
}

export interface Job {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  status: JobStatus;
  /** Index de la prochaine étape à exécuter : c'est le point de reprise. */
  cursor: number;
  steps: JobStep[];
  /** Estimation en secondes, si connue (compute.ts). */
  estimate_s?: number;
  max_attempts: number;
  /** Fichier de verrou : quel exécuteur tient la tâche, depuis quand. */
  lock?: { owner: string; since: string };
  error?: string;
}

export type StepHandler = (input: unknown, ctx: { job: Job; step: JobStep; previous: unknown }) => Promise<unknown>;

export const jobsDir = (lib: string) => path.join(lib, '.arche', 'jobs');
const jobFile = (lib: string, id: string) => path.join(jobsDir(lib), `${id}.json`);
const now = () => new Date().toISOString();

/** Écriture atomique : on n'a jamais un fichier de tâche à moitié écrit après une coupure. */
function writeJob(lib: string, job: Job): void {
  fs.mkdirSync(jobsDir(lib), { recursive: true });
  const f = jobFile(lib, job.id);
  const tmp = `${f}.tmp-${process.pid}`;
  job.updated_at = now();
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
  fs.renameSync(tmp, f);
}

export function readJob(lib: string, id: string): Job | null {
  const f = jobFile(lib, id);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8')) as Job;
}

export function listJobs(lib: string): Job[] {
  const d = jobsDir(lib);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')) as Job)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Crée et enregistre une tâche ; rien ne s'exécute encore. */
export function createJob(lib: string, title: string, steps: Array<{ id?: string; kind: string; input: unknown }>, opts: { id?: string; estimate_s?: number; max_attempts?: number } = {}): Job {
  const id = opts.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const job: Job = {
    id, title, created_at: now(), updated_at: now(), status: 'pending', cursor: 0,
    steps: steps.map((s, i) => ({ id: s.id ?? `s${i + 1}`, kind: s.kind, input: s.input, status: 'pending', attempts: 0 })),
    max_attempts: opts.max_attempts ?? 3, ...(opts.estimate_s !== undefined ? { estimate_s: opts.estimate_s } : {}),
  };
  writeJob(lib, job);
  return job;
}

export function cancelJob(lib: string, id: string): Job | null {
  const job = readJob(lib, id);
  if (!job || job.status === 'done') return job;
  job.status = 'cancelled';
  delete job.lock;
  writeJob(lib, job);
  return job;
}

/** Un verrou est périmé quand son propriétaire n'a rien écrit depuis `staleMs` : la machine a redémarré. */
const lockStale = (job: Job, staleMs: number): boolean => !job.lock || Date.now() - Date.parse(job.updated_at) > staleMs;

export interface RunOptions {
  owner?: string;
  /** Verrou considéré mort après ce délai sans écriture (défaut 10 min). */
  staleMs?: number;
  /** Fonction d'attente entre tentatives, remplaçable dans les tests. */
  sleep?: (ms: number) => Promise<void>;
  onStep?: (job: Job, step: JobStep) => void;
}

/**
 * Exécute une tâche à partir de son curseur. Chaque étape est écrite avant (running) et après
 * (done/failed). Une étape qui échoue est retentée avec attente croissante ; au-delà de
 * `max_attempts`, la tâche est `failed` mais garde tout ce qui a été fait : `resume` repart de là.
 */
export async function runJob(lib: string, id: string, handlers: Record<string, StepHandler>, o: RunOptions = {}): Promise<Job> {
  const owner = o.owner ?? `${process.pid}`;
  const sleep = o.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
  let job = readJob(lib, id);
  if (!job) throw new Error(`tâche inconnue : ${id}`);
  if (job.status === 'done' || job.status === 'cancelled') return job;
  if (job.lock && job.lock.owner !== owner && !lockStale(job, o.staleMs ?? 600_000)) throw new Error(`tâche ${id} tenue par ${job.lock.owner} depuis ${job.lock.since}`);
  job.lock = { owner, since: now() };
  job.status = 'running';
  delete job.error;
  writeJob(lib, job);

  while (job.cursor < job.steps.length) {
    const step = job.steps[job.cursor]!;
    if (step.status === 'done') { job.cursor++; writeJob(lib, job); continue; }
    const handler = handlers[step.kind];
    if (!handler) { step.status = 'failed'; step.error = `gestionnaire inconnu : ${step.kind}`; job.status = 'failed'; job.error = step.error; delete job.lock; writeJob(lib, job); return job; }
    const previous = job.cursor > 0 ? job.steps[job.cursor - 1]!.output : undefined;
    step.attempts++;
    step.started_at = now();
    delete step.error;
    writeJob(lib, job);
    o.onStep?.(job, step);
    try {
      step.output = await handler(step.input, { job, step, previous });
      step.status = 'done';
      step.finished_at = now();
      job.cursor++;
      writeJob(lib, job);
    } catch (e) {
      step.error = (e as Error).message;
      step.finished_at = now();
      if (step.attempts >= job.max_attempts) {
        step.status = 'failed'; job.status = 'failed'; job.error = `étape ${step.id} : ${step.error}`;
        delete job.lock; writeJob(lib, job); return job;
      }
      writeJob(lib, job);
      await sleep(backoffDelay(step.attempts));
      // Rechargement : un autre exécuteur a pu annuler pendant l'attente.
      const fresh = readJob(lib, id);
      if (!fresh || fresh.status === 'cancelled') return fresh ?? job;
    }
  }
  job.status = 'done';
  delete job.lock;
  writeJob(lib, job);
  return job;
}

/** Reprend toutes les tâches en attente ou interrompues, dans l'ordre de création. */
export async function runPending(lib: string, handlers: Record<string, StepHandler>, o: RunOptions = {}): Promise<Job[]> {
  const out: Job[] = [];
  for (const j of listJobs(lib)) {
    if (j.status === 'pending' || j.status === 'running' || (j.status === 'failed' && o.owner === 'retry')) {
      try { out.push(await runJob(lib, j.id, handlers, o)); } catch (e) { if (!/tenue par/.test((e as Error).message)) throw e; }
    }
  }
  return out;
}

/** Résumé lisible d'une tâche pour la ligne de commande et l'outil MCP. */
export function describeJob(j: Job, lang: 'fr' | 'en' = 'fr'): string {
  const done = j.steps.filter(s => s.status === 'done').length;
  const head = `${j.id}  ${j.status.padEnd(9)} ${done}/${j.steps.length}  ${j.title}${j.estimate_s ? `  (~${Math.round(j.estimate_s / 60)} min)` : ''}`;
  const err = j.error ? `\n  ${lang === 'fr' ? 'erreur' : 'error'} : ${j.error}` : '';
  return head + err;
}
