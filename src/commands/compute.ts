// `arche compute estimate` : combien de temps ce modèle / ce workflow prendra sur CETTE machine.
// `arche jobs …` : la file de tâches qui survit aux coupures (ADR 0012).
import fs from 'node:fs';
import { parse } from 'yaml';
import { loadCatalog } from '../core/catalog.js';
import { loadConfig } from '../core/config.js';
import { libraryDir } from '../core/paths.js';
import { detectHardware } from '../core/hardware.js';
import { getLang } from '../core/i18n.js';
import { estimatePipeline, formatPipeline, modelShapeFromTags, type ComputeHardware, type PipelineStep } from '../core/compute.js';
import { listJobs, readJob, cancelJob, describeJob } from '../core/jobs.js';

/** Un modèle par identifiant du catalogue (`ollama-qwen3-6-27b`), par tag Ollama (`qwen3.5:9b`) ou par taille en Go (`16`). */
export function resolveModel(spec: string): PipelineStep['model'] {
  const gb = Number(spec);
  if (Number.isFinite(gb) && gb > 0) return { id: `${gb} Go`, size_gb: gb };
  const cat = loadCatalog({ strict: false });
  const r = cat.byId.get(spec) ?? cat.resources.find(x => x.type === 'ai-model' && (x.source as { ollama_model?: string }).ollama_model === spec);
  if (!r) throw new Error(`modèle inconnu : ${spec} — un identifiant du catalogue, un tag Ollama, ou une taille en Go`);
  return modelShapeFromTags(r.id, r.size_estimate_gb ?? 4, r.tags ?? []);
}

export async function computeEstimate(o: { model?: string; steps?: string; prompt?: string; output?: string; ram?: string; vram?: string; cores?: string; disk?: string; machine?: string; json?: boolean; library?: string; config?: string }) {
  const lang = getLang();
  const cfg = loadConfig(o.config);
  const lib = libraryDir(o.library ?? cfg.library);
  const detected = await detectHardware(lib, { skipOnlineCheck: true });
  const hw: ComputeHardware = {
    ram_gb: o.ram ? Number(o.ram) : detected.ram_gb,
    vram_gb: o.vram ? Number(o.vram) : detected.vram_gb,
    ...(o.cores ? { cpu_cores: Number(o.cores) } : {}),
    ...(o.disk ? { disk_kind: o.disk as ComputeHardware['disk_kind'] } : {}),
    ...(o.machine ? { machine_kind: o.machine as ComputeHardware['machine_kind'] } : {}),
  };
  let steps: PipelineStep[];
  if (o.steps) {
    const raw = parse(fs.readFileSync(o.steps, 'utf8')) as { steps: Array<{ model: string; prompt_tokens?: number; output_tokens?: number; label?: string }> };
    steps = raw.steps.map(s => ({ model: resolveModel(s.model), prompt_tokens: s.prompt_tokens ?? 2000, output_tokens: s.output_tokens ?? 500, ...(s.label ? { label: s.label } : {}) }));
  } else if (o.model) {
    steps = [{ model: resolveModel(o.model), prompt_tokens: Number(o.prompt ?? 2000), output_tokens: Number(o.output ?? 500) }];
  } else throw new Error('--model <id|tag|Go> ou --steps <fichier.yaml>');
  const p = estimatePipeline(steps, hw, lang);
  if (o.json) { console.log(JSON.stringify({ hardware: hw, ...p }, null, 2)); return; }
  console.log(`${lang === 'fr' ? 'Machine' : 'Machine'} : ${hw.ram_gb} Go RAM, ${hw.vram_gb} Go VRAM${hw.cpu_cores ? `, ${hw.cpu_cores} ${lang === 'fr' ? 'cœurs' : 'cores'}` : ''}${hw.disk_kind ? `, ${hw.disk_kind}` : ''}\n`);
  process.stdout.write(formatPipeline(p, lang));
}

export function jobsList(o: { library?: string; config?: string; json?: boolean }) {
  const cfg = loadConfig(o.config);
  const lib = libraryDir(o.library ?? cfg.library);
  const jobs = listJobs(lib);
  if (o.json) { console.log(JSON.stringify(jobs, null, 2)); return; }
  if (!jobs.length) { console.log(getLang() === 'fr' ? 'aucune tâche' : 'no jobs'); return; }
  for (const j of jobs) console.log(describeJob(j, getLang()));
}

export function jobsShow(id: string, o: { library?: string; config?: string }) {
  const cfg = loadConfig(o.config);
  const j = readJob(libraryDir(o.library ?? cfg.library), id);
  if (!j) throw new Error(`tâche inconnue : ${id}`);
  console.log(JSON.stringify(j, null, 2));
}

export function jobsCancel(id: string, o: { library?: string; config?: string }) {
  const cfg = loadConfig(o.config);
  const j = cancelJob(libraryDir(o.library ?? cfg.library), id);
  if (!j) throw new Error(`tâche inconnue : ${id}`);
  console.log(describeJob(j, getLang()));
}
