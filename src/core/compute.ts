// Le temps s'adapte à la machine, jamais les capacités (ADR 0012).
// Time adapts to the machine, never capability (ADR 0012).
//
// Un modèle plus gros que la RAM n'est pas « impossible » : il tourne depuis le SSD (mmap), lentement,
// et ce module dit combien. Un workflow à quatre modèles sur 8 Go de RAM prend une heure au lieu de
// dix secondes ; l'estimation le dit AVANT, l'utilisateur décide, et la file de tâches (jobs.ts)
// garantit qu'une heure de calcul survit à un redémarrage. Les chiffres viennent de
// knowledge/compute.yaml, jamais du code.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { knowledgeDir } from './paths.js';
import type { Hardware } from './types.js';

interface ComputeFigures {
  uncertainty: string;
  bandwidth_gbs: { vram: Record<string, number>; ram: Record<string, number>; disk: Record<string, number> };
  prefill: { cpu_per_core_per_gb: number; gpu_per_gb: number; integrated_gpu_per_gb: number };
  bytes_per_param: Record<string, number>;
  kv_cache_gb_per_active_b_per_8k: { value: number };
  system_reserve_gb: { value: number };
  power_w: Record<string, { idle: number; load: number }>;
}

let cache: ComputeFigures | null = null;
export function computeFigures(): ComputeFigures {
  if (cache) return cache;
  cache = parse(fs.readFileSync(path.join(knowledgeDir(), 'compute.yaml'), 'utf8')) as ComputeFigures;
  return cache;
}

/** Ce que l'estimateur a besoin de savoir d'une machine, au-delà de `Hardware`. Tout est facultatif : défauts prudents. */
export interface ComputeHardware extends Pick<Hardware, 'ram_gb' | 'vram_gb'> {
  cpu_cores?: number;
  ram_kind?: 'ddr4_dual' | 'ddr4_single' | 'ddr5_dual' | 'lpddr5_apple' | 'raspberry_pi_5';
  vram_kind?: 'integrated' | 'laptop' | 'desktop' | 'high_end';
  disk_kind?: 'nvme' | 'sata_ssd' | 'usb3_ssd' | 'hdd' | 'sd_card';
  /** Classe de consommation ; devinée sinon (Pi, portable, tour, carte graphique). */
  machine_kind?: 'raspberry_pi_5' | 'laptop_cpu' | 'apple_silicon' | 'desktop_cpu' | 'desktop_gpu_laptop' | 'desktop_gpu_desktop' | 'desktop_gpu_high_end';
}

/** Un modèle tel que l'estimateur le voit : poids sur disque, poids actifs par token (MoE), contexte. */
export interface ModelShape {
  id: string;
  /** Taille des poids sur disque, Go (la quantification est déjà dedans). */
  size_gb: number;
  /** Paramètres actifs par token, en milliards ; = total pour un modèle dense. */
  active_b?: number;
  /** Paramètres totaux, en milliards, si connus (pour le KV cache et l'affichage). */
  total_b?: number;
}

export type Placement = 'vram' | 'ram' | 'disk';

export interface StepEstimate {
  model: string;
  placement: Placement;
  /** Où la partie qui ne tient pas est lue : disque, quand placement = disk. */
  bandwidth_gbs: number;
  tok_s: number;
  prefill_tok_s: number;
  load_s: number;
  prefill_s: number;
  generate_s: number;
  total_s: number;
  /** Wattheures consommés par l'étape, à la prise (knowledge/compute.yaml, power_w). */
  energy_wh: number;
  /** Ce qu'on peut faire pour aller plus vite, en clair. */
  advice: string[];
}

export interface PipelineStep { model: ModelShape; prompt_tokens: number; output_tokens: number; label?: string }

export interface PipelineEstimate {
  steps: Array<StepEstimate & { label?: string; swapped: boolean }>;
  total_s: number;
  total_wh: number;
  swaps: number;
  human: string;
  advice: string[];
  uncertainty: string;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** La classe de consommation d'une machine, devinée depuis ce qu'on sait d'elle. */
export function guessMachineKind(hw: ComputeHardware): NonNullable<ComputeHardware['machine_kind']> {
  if (hw.machine_kind) return hw.machine_kind;
  if (hw.ram_kind === 'raspberry_pi_5') return 'raspberry_pi_5';
  if (hw.ram_kind === 'lpddr5_apple') return 'apple_silicon';
  if (hw.vram_gb >= 20) return 'desktop_gpu_high_end';
  if (hw.vram_gb >= 10) return 'desktop_gpu_desktop';
  if (hw.vram_gb > 0) return 'desktop_gpu_laptop';
  return (hw.cpu_cores ?? 4) <= 4 && hw.ram_gb <= 16 ? 'laptop_cpu' : 'desktop_cpu';
}

/** Wattheures d'une durée sous charge sur cette machine. */
export function energyWh(seconds: number, hw: ComputeHardware): number {
  const p = computeFigures().power_w[guessMachineKind(hw)] ?? { idle: 20, load: 60 };
  return r1((p.load * seconds) / 3600);
}

/** Où les poids actifs tiennent, et à quelle vitesse ils se relisent à chaque token. */
export function placeModel(m: ModelShape, hw: ComputeHardware): { placement: Placement; bandwidth_gbs: number; active_gb: number; need_gb: number } {
  const f = computeFigures();
  // Sans indication, on suppose une quantification q4 : 0,58 octet par paramètre → Go / 0,58 = milliards de paramètres.
  const total_b = m.total_b ?? Math.max(0.1, m.size_gb / f.bytes_per_param.q4_k_m!);
  const active_b = m.active_b ?? total_b;
  const bytesPerParam = m.size_gb / total_b; // Go par milliard = octets par paramètre
  const active_gb = active_b * bytesPerParam;
  const kv = f.kv_cache_gb_per_active_b_per_8k.value * active_b;
  const need_gb = m.size_gb + kv;
  const vramBw = f.bandwidth_gbs.vram[hw.vram_kind ?? (hw.vram_gb >= 20 ? 'high_end' : hw.vram_gb >= 10 ? 'desktop' : 'laptop')] ?? 250;
  const ramBw = f.bandwidth_gbs.ram[hw.ram_kind ?? 'ddr4_dual'] ?? 25;
  const diskBw = f.bandwidth_gbs.disk[hw.disk_kind ?? 'sata_ssd'] ?? 0.45;
  if (hw.vram_gb > 0 && need_gb <= hw.vram_gb) return { placement: 'vram', bandwidth_gbs: vramBw, active_gb, need_gb };
  const ramFree = Math.max(0, hw.ram_gb - f.system_reserve_gb.value);
  if (need_gb <= ramFree) return { placement: 'ram', bandwidth_gbs: ramBw, active_gb, need_gb };
  // Une partie des poids se relit depuis le disque à chaque token : la vitesse est celle du disque,
  // pondérée par la part qui déborde (mmap garde en cache ce qui tient).
  const overflow = Math.min(1, Math.max(0, (need_gb - ramFree) / Math.max(need_gb, 0.001)));
  const eff = 1 / ((1 - overflow) / ramBw + overflow / diskBw);
  return { placement: 'disk', bandwidth_gbs: eff, active_gb, need_gb };
}

/** Une étape : charger, lire le prompt, générer. Jamais « impossible » ; toujours un temps. */
export function estimateStep(step: PipelineStep, hw: ComputeHardware, alreadyLoaded = false): StepEstimate {
  const f = computeFigures();
  const { placement, bandwidth_gbs, active_gb } = placeModel(step.model, hw);
  const tok_s = bandwidth_gbs / Math.max(active_gb, 0.05);
  const cores = hw.cpu_cores ?? 4;
  const prefill_tok_s = placement === 'vram'
    ? f.prefill.gpu_per_gb / Math.max(active_gb, 0.05)
    : Math.max(1, f.prefill.cpu_per_core_per_gb * cores / Math.max(active_gb, 0.05)) * (placement === 'disk' ? 0.5 : 1);
  const diskBw = f.bandwidth_gbs.disk[hw.disk_kind ?? 'sata_ssd'] ?? 0.45;
  const load_s = alreadyLoaded ? 0 : (placement === 'disk' ? 0 : step.model.size_gb / diskBw);
  const prefill_s = step.prompt_tokens / prefill_tok_s;
  const generate_s = step.output_tokens / tok_s;
  const advice: string[] = [];
  if (placement === 'disk') advice.push(`${step.model.id} déborde de la RAM : lu depuis le disque à chaque token (~${r1(tok_s)} tok/s). Un disque NVMe, une quantification plus petite ou un modèle MoE (poids actifs réduits) changent tout ; sinon, lancez et laissez tourner.`);
  if (placement === 'ram' && hw.vram_gb === 0 && active_gb > 6) advice.push(`${step.model.id} sur CPU : un modèle MoE de même qualité (ex. 35b-a3b) irait 3 à 5× plus vite.`);
  if (step.prompt_tokens > 6000 && placement !== 'vram') advice.push(`prompt long (${step.prompt_tokens} tokens) : sur CPU la lecture du prompt domine ; réduisez les extraits ou découpez.`);
  const total_s = r1(load_s + prefill_s + generate_s);
  return { model: step.model.id, placement, bandwidth_gbs: r1(bandwidth_gbs), tok_s: r1(tok_s), prefill_tok_s: Math.round(prefill_tok_s), load_s: r1(load_s), prefill_s: r1(prefill_s), generate_s: r1(generate_s), total_s, energy_wh: energyWh(total_s, hw), advice };
}

/** Durée lisible : « 12 s », « 4 min », « 1 h 20 ». */
export function formatDuration(s: number, lang: 'fr' | 'en' = 'fr'): string {
  if (s < 60) return `${Math.max(1, Math.round(s))} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/**
 * Un workflow à plusieurs modèles, exécuté en série (une machine hors ligne n'en charge qu'un à la
 * fois). Les étapes consécutives sur le même modèle ne rechargent pas ; l'ordre proposé les groupe.
 */
export function estimatePipeline(steps: PipelineStep[], hw: ComputeHardware, lang: 'fr' | 'en' = 'fr'): PipelineEstimate {
  const f = computeFigures();
  let loaded: string | null = null;
  let swaps = 0;
  const out: PipelineEstimate['steps'] = [];
  for (const s of steps) {
    const same = loaded === s.model.id;
    const swapped = !same && loaded !== null;
    const e = estimateStep(s, hw, same);
    if (swapped) swaps++;
    if (!same) loaded = s.model.id;
    out.push({ ...e, ...(s.label ? { label: s.label } : {}), swapped });
  }
  const total_s = r1(out.reduce((a, e) => a + e.total_s, 0));
  const total_wh = r1(out.reduce((a, e) => a + e.energy_wh, 0));
  const advice = [...new Set(out.flatMap(e => e.advice))];
  if (total_wh > 50) advice.push(lang === 'fr' ? `≈ ${total_wh} Wh à la prise : sur panneaux, lancez en milieu de journée, batterie pleine ; une machine avec carte graphique fait souvent MOINS de Wh par réponse qu'un CPU lent.` : `≈ ${total_wh} Wh at the plug: on solar, run at midday with a full battery; a GPU machine often uses LESS Wh per answer than a slow CPU.`);
  const distinct = new Set(steps.map(s => s.model.id)).size;
  if (swaps >= distinct && distinct > 1) advice.push(lang === 'fr' ? `${swaps} rechargements de modèle : regroupez les étapes par modèle (toutes celles du premier, puis toutes celles du second).` : `${swaps} model reloads: group the steps by model.`);
  if (total_s > 1800) advice.push(lang === 'fr' ? 'Plus d’une demi-heure : lancez la tâche en file (elle reprend après un redémarrage) et faites autre chose.' : 'More than half an hour: queue the job (it resumes after a restart) and do something else.');
  const human = lang === 'fr'
    ? `≈ ${formatDuration(total_s)} et ≈ ${total_wh} Wh au total sur cette machine (${guessMachineKind(hw)} ; ${steps.length} étape(s), ${distinct} modèle(s), ${swaps} rechargement(s)) — ${f.uncertainty}`
    : `≈ ${formatDuration(total_s, 'en')} and ≈ ${total_wh} Wh in total on this machine (${guessMachineKind(hw)}; ${steps.length} step(s), ${distinct} model(s), ${swaps} reload(s)) — ${f.uncertainty}`;
  return { steps: out, total_s, total_wh, swaps, human, advice, uncertainty: f.uncertainty };
}

/** Rendu texte, pour l'outil MCP et la ligne de commande. */
export function formatPipeline(p: PipelineEstimate, lang: 'fr' | 'en' = 'fr'): string {
  const lines = [p.human, ''];
  p.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.label ? `${s.label} — ` : ''}${s.model} [${s.placement}${s.swapped ? (lang === 'fr' ? ', rechargé' : ', reloaded') : ''}] ${formatDuration(s.total_s, lang)} (${lang === 'fr' ? 'chargement' : 'load'} ${formatDuration(s.load_s, lang)}, prompt ${formatDuration(s.prefill_s, lang)}, ${lang === 'fr' ? 'génération' : 'generation'} ${formatDuration(s.generate_s, lang)} à ${s.tok_s} tok/s)`));
  if (p.advice.length) { lines.push('', lang === 'fr' ? 'Pour aller plus vite :' : 'To go faster:'); for (const a of p.advice) lines.push(`- ${a}`); }
  return lines.join('\n') + '\n';
}

/** Taille et paramètres actifs depuis une fiche du catalogue (`size_estimate_gb`, tags `active:3b`, `params:35b`). */
export function modelShapeFromTags(id: string, sizeGb: number, tags: readonly string[] = []): ModelShape {
  const num = (prefix: string): number | undefined => { const t = tags.find(x => x.startsWith(prefix)); const m = t?.slice(prefix.length).match(/^([\d.]+)b$/i); return m ? Number(m[1]) : undefined; };
  const idB = id.match(/(\d+(?:\.\d+)?)b(?:-a(\d+(?:\.\d+)?)b)?/i);
  const total_b = num('params:') ?? (idB ? Number(idB[1]) : undefined);
  const active_b = num('active:') ?? (idB?.[2] ? Number(idB[2]) : undefined);
  return { id, size_gb: sizeGb, ...(total_b !== undefined ? { total_b } : {}), ...(active_b !== undefined ? { active_b } : {}) };
}
