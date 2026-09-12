// Le planificateur de parcelles : inventaire (parcelles + semences + gel) → calendrier, attribution,
// rendements. Déterministe ; le LLM l'appelle et l'explique, il ne l'improvise pas (ADR 0010).
// The plot planner: inventory (plots + seeds + frost) → calendar, assignment, yields. Deterministic;
// the LLM calls and explains it, never improvises it (ADR 0010).
//
// Ce que le solveur sait : les dates par rapport au gel, l'espacement, la rotation des familles,
// l'exposition. Ce qu'il ignore et dit ignorer : le sol, la pente, l'eau, la main-d'œuvre.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { knowledgeDir } from '../paths.js';
import type { I18n } from '../types.js';
import type { Inventory, Plot, Sun } from './inventory.js';

export interface CropSpec {
  key: string;
  name: I18n;
  family: string;
  sun: 'full' | 'partial';
  frost_hardy: boolean;
  sow: { indoor?: number; transplant?: number; direct?: number; anchor?: 'last_frost' | 'first_frost' };
  spacing_cm: { row: number; plant: number };
  days_to_harvest: number;
  harvest_weeks: number;
  succession_weeks?: number;
  yield_kg_per_m2: { lo: number; hi: number };
  plants_per_person: number;
  /** Provenance (M4-1) : un locator vers le corpus, ou la grâce explicite ; `verified` n'est jamais écrit, `arche knowledge verify` le calcule. */
  source?: { resource: string; path: string; quote: string };
  unsourced?: true;
}

interface CropsFile {
  version: number;
  updated: string;
  defaults: { last_frost: string; first_frost: string; people: number };
  uncertainty?: string;
  crops: Record<string, Omit<CropSpec, 'key'>>;
  aliases?: Record<string, string>;
}

let cache: CropsFile | null = null;

export function cropsFile(): CropsFile {
  if (cache) return cache;
  cache = parse(fs.readFileSync(path.join(knowledgeDir(), 'crops.yaml'), 'utf8')) as CropsFile;
  return cache;
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[\s-]+/g, '_');

/** Résout une clé ou un alias (« Tomate », « petit pois », « squash ») vers la fiche. */
export function resolveCrop(name: string): CropSpec | undefined {
  const f = cropsFile();
  const n = fold(name);
  const aliases: Record<string, string> = {};
  for (const [k, v] of Object.entries(f.aliases ?? {})) aliases[fold(k)] = v;
  const key = f.crops[n] ? n : aliases[n];
  if (!key || !f.crops[key]) return undefined;
  return { key, ...f.crops[key]! };
}

export type Action = 'sow_indoor' | 'transplant' | 'sow_direct' | 'harvest_start' | 'harvest_end';

export interface CalendarEvent { date: string; crop: string; action: Action; plots: string[]; note?: string }
export interface Bed { plot: string; crop: string; family: string; plants: number; area_m2: number }
export interface CropLine {
  crop: string; name: I18n; family: string;
  plants_wanted: number; plants_planned: number; area_m2: number;
  yield_kg: { lo: number; hi: number }; plots: string[]; sourced: boolean;
}
export interface PlotUse { id: string; area_m2: number; used_m2: number; free_m2: number; sun: Sun; assumed_sun: boolean }

export interface GardenPlan {
  year: number;
  people: number;
  climate: { last_frost: string; first_frost: string; defaulted: boolean };
  calendar: CalendarEvent[];
  beds: Bed[];
  crops: CropLine[];
  plots: PlotUse[];
  unknown: string[];
  warnings: string[];
  assumptions: string[];
  sources: string[];
}

const day = 86_400_000;
const at = (year: number, mmdd: string): Date => new Date(Date.UTC(year, Number(mmdd.slice(0, 2)) - 1, Number(mmdd.slice(3, 5))));
const plus = (d: Date, days: number): Date => new Date(d.getTime() + days * day);
const iso = (d: Date): string => d.toISOString().slice(0, 10);
const r1 = (n: number): number => Math.round(n * 10) / 10;

const sunOk = (crop: 'full' | 'partial', plot: Sun): boolean => (crop === 'full' ? plot === 'full' : plot !== 'shade');
const sunRank = (crop: 'full' | 'partial', plot: Sun): number => (plot === crop ? 0 : plot === 'full' ? 1 : plot === 'partial' ? 2 : 3);

/** Le plan de l'année. Ne lève jamais pour une culture inconnue : elle est listée dans `unknown`. */
export function planGarden(inv: Inventory, opts: { year?: number } = {}): GardenPlan {
  const f = cropsFile();
  const year = opts.year ?? new Date().getUTCFullYear() + 1;
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const defaulted = !inv.climate?.last_frost || !inv.climate?.first_frost;
  const lastFrost = inv.climate?.last_frost ?? f.defaults.last_frost;
  const firstFrost = inv.climate?.first_frost ?? f.defaults.first_frost;
  if (defaulted) assumptions.push(`gel : dates par défaut ${lastFrost} / ${firstFrost} (climat tempéré, plaine) — remplacez-les par vos observations`);
  const people = inv.people ?? f.defaults.people;
  if (inv.people === undefined) assumptions.push(`${people} personnes par défaut pour dimensionner les cultures sans quantité`);

  const plots: PlotUse[] = (inv.plots ?? []).map(p => ({ id: p.id, area_m2: p.area_m2, used_m2: 0, free_m2: p.area_m2, sun: p.sun ?? 'full', assumed_sun: p.sun === undefined }));
  if (plots.some(p => p.assumed_sun)) assumptions.push('exposition « plein soleil » supposée pour les parcelles sans `sun`');
  const byId = new Map<string, Plot>((inv.plots ?? []).map(p => [p.id, p]));

  // 1. Demande par culture (plants → surface).
  const unknown: string[] = [];
  const demands: Array<{ spec: CropSpec; wanted: number; areaPerPlant: number }> = [];
  const seen = new Set<string>();
  for (const s of inv.seeds ?? []) {
    const spec = resolveCrop(s.crop);
    if (!spec) { unknown.push(s.crop); continue; }
    if (seen.has(spec.key)) { warnings.push(`${s.crop} : plusieurs lots, seul le premier est planifié — fusionnez-les`); continue; }
    seen.add(spec.key);
    const wanted = s.plants ?? spec.plants_per_person * people;
    demands.push({ spec, wanted, areaPerPlant: (spec.spacing_cm.row * spec.spacing_cm.plant) / 10_000 });
  }
  demands.sort((a, b) => b.wanted * b.areaPerPlant - a.wanted * a.areaPerPlant);

  // 2. Attribution : plus gourmand d'abord, parcelles compatibles (soleil, rotation), puis dégradé.
  const beds: Bed[] = [];
  const lines: CropLine[] = [];
  for (const d of demands) {
    const { spec } = d;
    let remaining = d.wanted;
    const used: string[] = [];
    const place = (cands: PlotUse[], note?: string) => {
      for (const p of cands) {
        if (remaining <= 0) break;
        const fit = Math.min(remaining, Math.floor(p.free_m2 / d.areaPerPlant));
        if (fit <= 0) continue;
        const area = r1(fit * d.areaPerPlant);
        beds.push({ plot: p.id, crop: spec.key, family: spec.family, plants: fit, area_m2: area });
        p.used_m2 = r1(p.used_m2 + area); p.free_m2 = r1(p.area_m2 - p.used_m2);
        remaining -= fit; used.push(p.id);
        if (note) warnings.push(`${spec.name.fr} → ${p.id} : ${note}`);
      }
    };
    const rotationOk = (p: PlotUse) => byId.get(p.id)?.last_family !== spec.family;
    const rank = (a: PlotUse, b: PlotUse) => sunRank(spec.sun, a.sun) - sunRank(spec.sun, b.sun) || b.free_m2 - a.free_m2;
    place(plots.filter(p => sunOk(spec.sun, p.sun) && rotationOk(p)).sort(rank));
    if (remaining > 0) place(plots.filter(p => sunOk(spec.sun, p.sun) && !rotationOk(p)).sort(rank), `même famille (${spec.family}) que l'an dernier — rotation rompue, risque de maladies`);
    if (remaining > 0 && spec.sun === 'full') place(plots.filter(p => p.sun === 'partial' && rotationOk(p)).sort(rank), 'mi-ombre pour une culture de plein soleil — rendement réduit');
    const planned = d.wanted - remaining;
    if (remaining > 0) warnings.push(`${spec.name.fr} : ${remaining} plant(s) sur ${d.wanted} sans place (il manque ~${r1(remaining * d.areaPerPlant)} m²)`);
    const area = r1(planned * d.areaPerPlant);
    lines.push({
      crop: spec.key, name: spec.name, family: spec.family, plants_wanted: d.wanted, plants_planned: planned, area_m2: area,
      yield_kg: { lo: r1(area * spec.yield_kg_per_m2.lo), hi: r1(area * spec.yield_kg_per_m2.hi) }, plots: used, sourced: !!spec.source,
    });
  }

  // 3. Calendrier.
  const calendar: CalendarEvent[] = [];
  const firstFrostDate = at(year, firstFrost);
  for (const l of lines) {
    if (l.plants_planned <= 0) continue;
    const spec = resolveCrop(l.crop)!;
    const anchor = spec.sow.anchor === 'first_frost' ? at(year - 1, firstFrost) : at(year, lastFrost);
    const indoor = spec.sow.indoor !== undefined;
    const planting = plus(anchor, (indoor ? (spec.sow.transplant ?? 0) : (spec.sow.direct ?? 0)) * 7);
    const sowings = [planting];
    if (spec.succession_weeks) {
      for (let k = 1; k < 4; k++) {
        const next = plus(planting, k * spec.succession_weeks * 7);
        if (plus(next, spec.days_to_harvest).getTime() > firstFrostDate.getTime() - 7 * day) break;
        sowings.push(next);
      }
    }
    sowings.forEach((p, k) => {
      const note = k > 0 ? `semis échelonné n°${k + 1}` : undefined;
      if (indoor) {
        if (k === 0) calendar.push({ date: iso(plus(anchor, spec.sow.indoor! * 7)), crop: l.crop, action: 'sow_indoor', plots: [] });
        calendar.push({ date: iso(p), crop: l.crop, action: 'transplant', plots: l.plots, ...(note ? { note } : {}) });
      } else {
        calendar.push({ date: iso(p), crop: l.crop, action: 'sow_direct', plots: l.plots, ...(note ? { note } : {}) });
      }
      const hs = plus(p, spec.days_to_harvest);
      let he = plus(hs, spec.harvest_weeks * 7);
      if (!spec.frost_hardy && he.getTime() > firstFrostDate.getTime()) he = firstFrostDate;
      if (!spec.frost_hardy && hs.getTime() > firstFrostDate.getTime()) warnings.push(`${spec.name.fr} : première récolte (${iso(hs)}) après la première gelée — ne mûrira pas ; semez plus tôt sous abri ou renoncez`);
      calendar.push({ date: iso(hs), crop: l.crop, action: 'harvest_start', plots: l.plots, ...(note ? { note } : {}) });
      calendar.push({ date: iso(he), crop: l.crop, action: 'harvest_end', plots: l.plots, ...(note ? { note } : {}) });
    });
    if (spec.sow.anchor === 'first_frost') assumptions.push(`${spec.name.fr} : plantation d'automne ${year - 1}, récolte ${year}`);
  }
  calendar.sort((a, b) => a.date.localeCompare(b.date) || a.crop.localeCompare(b.crop));

  if (lines.some(l => !l.sourced)) assumptions.push('valeurs de crops.yaml sans locator vers le corpus (`unsourced: true`, période de grâce M4-2) : ' + (f.uncertainty ?? '±30 %'));
  return {
    year, people, climate: { last_frost: lastFrost, first_frost: firstFrost, defaulted }, calendar, beds, crops: lines, plots, unknown, warnings, assumptions,
    sources: [`knowledge/crops.yaml (v${f.version}, ${f.updated})`, 'openfarm-crops-rescue (CC0) — espacement, exposition'],
  };
}

const ACTION: Record<Action, I18n> = {
  sow_indoor: { fr: 'semis au chaud', en: 'sow indoors' },
  transplant: { fr: 'repiquage', en: 'transplant' },
  sow_direct: { fr: 'semis en place', en: 'direct sow' },
  harvest_start: { fr: 'début de récolte', en: 'harvest starts' },
  harvest_end: { fr: 'fin de récolte', en: 'harvest ends' },
};

/** Le livrable lisible : ce que l'utilisateur imprime et accroche dans la serre. */
export function renderGardenMarkdown(plan: GardenPlan, lang: 'fr' | 'en' = 'fr'): string {
  const fr = lang === 'fr';
  const name = (key: string) => resolveCrop(key)?.name[lang] ?? key;
  const out: string[] = [];
  out.push(fr ? `# Plan du potager ${plan.year}` : `# Garden plan ${plan.year}`);
  out.push('');
  out.push(fr
    ? `Dernière gelée ${plan.climate.last_frost}, première gelée ${plan.climate.first_frost}${plan.climate.defaulted ? ' (défaut)' : ''} · ${plan.people} personne(s).`
    : `Last frost ${plan.climate.last_frost}, first frost ${plan.climate.first_frost}${plan.climate.defaulted ? ' (default)' : ''} · ${plan.people} people.`);
  out.push('');
  out.push(fr ? '## Calendrier' : '## Calendar');
  out.push('');
  out.push(fr ? '| Date | Culture | Action | Parcelles |' : '| Date | Crop | Action | Plots |');
  out.push('|---|---|---|---|');
  for (const e of plan.calendar) out.push(`| ${e.date} | ${name(e.crop)} | ${ACTION[e.action][lang]}${e.note ? ` (${e.note})` : ''} | ${e.plots.join(', ') || '—'} |`);
  out.push('');
  out.push(fr ? '## Parcelles' : '## Plots');
  out.push('');
  out.push(fr ? '| Parcelle | Culture | Famille | Plants | m² |' : '| Plot | Crop | Family | Plants | m² |');
  out.push('|---|---|---|---|---|');
  for (const b of plan.beds) out.push(`| ${b.plot} | ${name(b.crop)} | ${b.family} | ${b.plants} | ${b.area_m2} |`);
  for (const p of plan.plots) out.push(`| ${p.id} | ${fr ? 'libre' : 'free'} | | | ${p.free_m2} / ${p.area_m2} |`);
  out.push('');
  out.push(fr ? '## Cultures et rendements estimés' : '## Crops and estimated yields');
  out.push('');
  out.push(fr ? '| Culture | Plants prévus / voulus | m² | kg (fourchette) |' : '| Crop | Plants planned / wanted | m² | kg (range) |');
  out.push('|---|---|---|---|');
  for (const c of plan.crops) out.push(`| ${c.name[lang]}${c.sourced ? '' : ' *'} | ${c.plants_planned} / ${c.plants_wanted} | ${c.area_m2} | ${c.yield_kg.lo}–${c.yield_kg.hi} |`);
  const total = plan.crops.reduce((a, c) => ({ lo: a.lo + c.yield_kg.lo, hi: a.hi + c.yield_kg.hi }), { lo: 0, hi: 0 });
  out.push(`| **${fr ? 'Total' : 'Total'}** | | ${r1(plan.crops.reduce((a, c) => a + c.area_m2, 0))} | ${r1(total.lo)}–${r1(total.hi)} |`);
  if (plan.crops.some(c => !c.sourced)) out.push('', fr ? '\\* valeur sans source dans le corpus (crops.yaml, `unsourced: true`).' : '\\* value without a corpus source (crops.yaml, `unsourced: true`).');
  if (plan.unknown.length) {
    out.push('', fr ? '## Non planifié (culture inconnue du fichier crops.yaml)' : '## Not planned (crop unknown to crops.yaml)', '');
    for (const u of plan.unknown) out.push(`- ${u}`);
  }
  if (plan.warnings.length) {
    out.push('', fr ? '## Avertissements' : '## Warnings', '');
    for (const w of plan.warnings) out.push(`- ${w}`);
  }
  out.push('', fr ? '## Hypothèses' : '## Assumptions', '');
  for (const a of plan.assumptions) out.push(`- ${a}`);
  out.push('', fr ? '## Sources' : '## Sources', '');
  for (const s of plan.sources) out.push(`- ${s}`);
  out.push('', fr
    ? '_Le solveur place et date ; il ne connaît ni votre sol, ni votre eau, ni votre temps. Il ne dit jamais qu\'une plante est comestible._'
    : '_The solver places and dates; it knows neither your soil, your water nor your time. It never says a plant is edible._');
  return out.join('\n') + '\n';
}

/** Le même calendrier en iCalendar (événements sur la journée), importable partout, même sans réseau. */
export function renderGardenIcs(plan: GardenPlan, lang: 'fr' | 'en' = 'fr'): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Arche//garden_plan//FR', 'CALSCALE:GREGORIAN'];
  plan.calendar.forEach((e, i) => {
    const d = e.date.replace(/-/g, '');
    const next = iso(plus(at(Number(e.date.slice(0, 4)), e.date.slice(5)), 1)).replace(/-/g, '');
    const title = `${resolveCrop(e.crop)?.name[lang] ?? e.crop} — ${ACTION[e.action][lang]}${e.note ? ` (${e.note})` : ''}`;
    lines.push('BEGIN:VEVENT', `UID:arche-garden-${plan.year}-${i}@arche.local`, `DTSTAMP:${plan.year}0101T000000Z`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${esc(title)}`);
    if (e.plots.length) lines.push(`LOCATION:${esc(e.plots.join(', '))}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
