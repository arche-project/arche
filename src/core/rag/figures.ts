// Calculateurs déterministes de dimensionnement.
// Deterministic sizing calculators.
//
// Raison d'être (ADR 0007, §6) : un modèle local à qui l'on demande « quelle citerne pour 4
// personnes ? » produit un nombre plausible et faux. Ici le modèle n'a le droit que d'appeler une
// fonction et d'expliquer son résultat. Les constantes viennent de knowledge/figures.yaml, jamais
// du code — pour qu'on puisse les corriger sans recompiler et qu'elles restent citables.
//
// A local model asked to size a cistern will produce a plausible wrong number. Here it may only
// call a function and explain the result. Constants live in knowledge/figures.yaml.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { knowledgeDir } from '../paths.js';
import type { I18n } from '../types.js';

export interface Range { lo?: number; hi?: number; value?: number; planning?: number; note?: string }
type Figures = Record<string, any>;

let cache: Figures | null = null;

/** Charge knowledge/figures.yaml (mis en cache). / Loads the figures file, cached. */
export function figures(): Figures {
  if (cache) return cache;
  const file = path.join(knowledgeDir(), 'figures.yaml');
  cache = parse(fs.readFileSync(file, 'utf8')) as Figures;
  return cache;
}


/** Valeur de planification d'une fourchette : `planning`, sinon `value`, sinon le milieu. */
export function plan(r: Range | number): number {
  if (typeof r === 'number') return r;
  if (r.planning !== undefined) return r.planning;
  if (r.value !== undefined) return r.value;
  if (r.lo !== undefined && r.hi !== undefined) return (r.lo + r.hi) / 2;
  throw new Error('fourchette illisible dans figures.yaml');
}

const lo = (r: Range | number): number => (typeof r === 'number' ? r : r.lo ?? r.value ?? plan(r));
const hi = (r: Range | number): number => (typeof r === 'number' ? r : r.hi ?? r.value ?? plan(r));
const round = (n: number, d = 0): number => Number(n.toFixed(d));

export interface CalcResult {
  label: I18n;
  /** Valeur de planification. */
  value: number;
  /** Fourchette raisonnable autour de la valeur. */
  range: { lo: number; hi: number };
  unit: string;
  /** Le calcul, montré à l'utilisateur : on ne demande jamais de faire confiance sur parole. */
  steps: string[];
  assumptions: string[];
  caveat?: I18n;
  /** Fiches et ressources à lire ensuite. */
  see?: string[];
}

export interface CalculatorSpec {
  name: string;
  description: I18n;
  params: Record<string, { type: 'number' | 'string'; required?: boolean; default?: number | string; description: I18n; enum?: string[] }>;
  run(args: Record<string, number | string>): CalcResult;
}

const num = (args: Record<string, number | string>, key: string, dflt?: number): number => {
  const v = args[key];
  if (v === undefined || v === '') {
    if (dflt !== undefined) return dflt;
    throw new Error(`paramètre manquant : ${key}`);
  }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`paramètre invalide : ${key} = ${String(v)}`);
  return n;
};

const str = (args: Record<string, number | string>, key: string, dflt: string): string => {
  const v = args[key];
  return v === undefined || v === '' ? dflt : String(v);
};

// ---------------------------------------------------------------------------------------------
// Eau
// ---------------------------------------------------------------------------------------------

const rainwater: CalculatorSpec = {
  name: 'eau_pluie',
  description: {
    fr: "Volume d'eau de pluie récupérable par an sur une toiture.",
    en: 'Rainwater harvestable per year from a roof.',
  },
  params: {
    roof_m2: { type: 'number', required: true, description: { fr: 'surface de toit au sol, en m²', en: 'roof footprint, m²' } },
    rainfall_mm: { type: 'number', required: true, description: { fr: 'pluviométrie annuelle, en mm', en: 'annual rainfall, mm' } },
  },
  run(args) {
    const f = figures().water;
    const roof = num(args, 'roof_m2');
    const rain = num(args, 'rainfall_mm');
    const coef = plan(f.roof_runoff_coefficient);
    const litres = roof * rain * coef;
    const flush = roof * plan(f.first_flush_litres_per_m2);
    return {
      label: { fr: 'Eau de pluie récupérable', en: 'Harvestable rainwater' },
      value: round(litres),
      range: { lo: round(roof * rain * 0.7), hi: round(roof * rain * 0.9) },
      unit: 'L/an',
      steps: [`${roof} m² × ${rain} mm × ${coef} = ${round(litres)} L/an (${round(litres / 1000, 1)} m³)`],
      assumptions: [
        `coefficient de ruissellement ${coef} (tuile ou bac acier)`,
        `premier jet à écarter : ${round(flush)} L par épisode de pluie`,
      ],
      caveat: {
        fr: "Le total annuel ne dit rien de la répartition : c'est la plus longue période sèche qui dimensionne la citerne. Toiture en amiante, plomb, bardeau bitumé ou traitée : impropre à la boisson.",
        en: 'The annual total says nothing about timing: the longest dry spell sizes the cistern. Asbestos, lead, bitumen or treated roofing is not fit for drinking water.',
      },
      see: ['fiche 01 — eau potable', 'fiche 08 — les chiffres de l’autonomie'],
    };
  },
};

const cistern: CalculatorSpec = {
  name: 'citerne',
  description: {
    fr: "Volume de citerne nécessaire pour traverser la période sèche.",
    en: 'Cistern volume needed to cross the dry season.',
  },
  params: {
    people: { type: 'number', required: true, description: { fr: 'nombre de personnes', en: 'number of people' } },
    dry_days: { type: 'number', default: 90, description: { fr: 'durée de la plus longue période sèche, en jours', en: 'longest dry spell, days' } },
    litres_per_day: { type: 'number', description: { fr: 'litres par personne et par jour (défaut : usage sobre)', en: 'litres per person per day' } },
    level: { type: 'string', default: 'frugal', enum: ['survival', 'sphere_minimum', 'frugal', 'normal'], description: { fr: "niveau d'usage si litres_per_day n'est pas donné", en: 'usage level' } },
  },
  run(args) {
    const f = figures().water;
    const people = num(args, 'people');
    const days = num(args, 'dry_days', 90);
    const level = str(args, 'level', 'frugal');
    const band = f.litres_per_person_day[level];
    if (!band) throw new Error(`niveau d'usage inconnu : ${level}`);
    const lpd = args['litres_per_day'] !== undefined ? num(args, 'litres_per_day') : plan(band);
    const litres = people * lpd * days;
    return {
      label: { fr: 'Citerne nécessaire', en: 'Cistern needed' },
      value: round(litres / 1000, 1),
      range: { lo: round((people * lo(band) * days) / 1000, 1), hi: round((people * hi(band) * days) / 1000, 1) },
      unit: 'm³',
      steps: [`${people} pers. × ${lpd} L/j × ${days} j = ${round(litres)} L = ${round(litres / 1000, 1)} m³`],
      assumptions: [
        `usage « ${level} » : ${lpd} L par personne et par jour`,
        'aucune autre ressource (source, puits, réseau) pendant la période sèche',
      ],
      caveat: {
        fr: "Ce volume suppose la citerne pleine en début de période sèche : vérifiez que la toiture la remplit. Hors-sol, prévoyez le gel ; enterrée, la lumière en moins limite les algues.",
        en: 'Assumes the cistern is full when the dry spell starts: check the roof can fill it. Above ground, plan for freezing; buried, darkness limits algae.',
      },
      see: ['calculateur eau_pluie', 'fiche 01 — eau potable'],
    };
  },
};

// ---------------------------------------------------------------------------------------------
// Alimentation
// ---------------------------------------------------------------------------------------------

const calories: CalculatorSpec = {
  name: 'calories',
  description: {
    fr: "Besoin calorique d'un foyer, en tenant compte du travail physique.",
    en: 'Household calorie requirement, accounting for physical work.',
  },
  params: {
    adults: { type: 'number', required: true, description: { fr: "nombre d'adultes", en: 'adults' } },
    children: { type: 'number', default: 0, description: { fr: "nombre d'enfants", en: 'children' } },
    activity: { type: 'string', default: 'farm_work', enum: ['sedentary', 'farm_work', 'hard_cold'], description: { fr: "niveau d'activité", en: 'activity level' } },
  },
  run(args) {
    const f = figures().calories;
    const adults = num(args, 'adults');
    const children = num(args, 'children', 0);
    const activity = str(args, 'activity', 'farm_work');
    const band = f.kcal_per_adult_day[activity];
    if (!band) throw new Error(`niveau d'activité inconnu : ${activity}`);
    const per = plan(band);
    const ratio = plan(f.child_ratio);
    const day = adults * per + children * per * ratio;
    return {
      label: { fr: 'Besoin calorique du foyer', en: 'Household calorie need' },
      value: round(day),
      range: { lo: round(adults * lo(band) + children * lo(band) * ratio), hi: round(adults * hi(band) + children * hi(band) * ratio) },
      unit: 'kcal/jour',
      steps: [
        `${adults} adulte(s) × ${per} kcal = ${round(adults * per)} kcal`,
        ...(children ? [`${children} enfant(s) × ${per} × ${ratio} = ${round(children * per * ratio)} kcal`] : []),
        `total ${round(day)} kcal/jour, soit ${round((day * 365) / 1e6, 2)} millions de kcal/an`,
      ],
      assumptions: [`activité « ${activity} » : ${per} kcal par adulte et par jour`, `enfant = ${ratio} × adulte`],
      caveat: {
        fr: "L'erreur classique est de dimensionner sur 2 000 kcal : en autonomie on travaille physiquement tous les jours. Les calories viennent des féculents, des graisses et des oléagineux, pas des légumes verts.",
        en: 'The classic mistake is sizing on 2 000 kcal. Calories come from starches, fats and oilseeds, not green vegetables.',
      },
      see: ['calculateur surface_nourriciere', 'fiche 08'],
    };
  },
};

const foodLand: CalculatorSpec = {
  name: 'surface_nourriciere',
  description: {
    fr: "Surface cultivée nécessaire pour nourrir un foyer une année.",
    en: 'Cultivated area needed to feed a household for a year.',
  },
  params: {
    people: { type: 'number', required: true, description: { fr: 'personnes à nourrir', en: 'people to feed' } },
    scope: { type: 'string', default: 'complete_diet', enum: ['vegetables_only', 'complete_diet'], description: { fr: 'ambition', en: 'ambition' } },
  },
  run(args) {
    const f = figures().land;
    const people = num(args, 'people');
    const scope = str(args, 'scope', 'complete_diet');
    const band = f.m2_per_person[scope];
    if (!band) throw new Error(`ambition inconnue : ${scope}`);
    const per = plan(band);
    return {
      label: { fr: 'Surface cultivée nécessaire', en: 'Cultivated area needed' },
      value: round(people * per),
      range: { lo: round(people * lo(band)), hi: round(people * hi(band)) },
      unit: 'm²',
      steps: [`${people} pers. × ${per} m² = ${round(people * per)} m² (${round((people * per) / 10000, 2)} ha)`],
      assumptions: [
        `${per} m² par personne pour « ${scope} »`,
        'rendements à la main, sans engrais de synthèse, pertes et repos du sol inclus',
      ],
      caveat: {
        fr: "Les 200–400 m²/personne des écoles bio-intensives sont un record obtenu par des gens très expérimentés sur sol amendé : comptez le double ou le triple la première décennie. Ajoutez 0,5 à 1 ha par personne si vous voulez des animaux et leur fourrage.",
        en: 'The 200–400 m²/person figure is a record, not a norm: budget two or three times that for your first decade. Add 0.5–1 ha per person for animals and their fodder.',
      },
      see: ['calculateur calories', 'fiche 08'],
    };
  },
};

const fats: CalculatorSpec = {
  name: 'graisses',
  description: {
    fr: "Corps gras nécessaires par an, alimentation et savon compris — le trou classique.",
    en: 'Fat needed per year, food and soap — the classic gap.',
  },
  params: { people: { type: 'number', required: true, description: { fr: 'personnes', en: 'people' } } },
  run(args) {
    const f = figures().fats;
    const people = num(args, 'people');
    const food = plan(f.kg_per_person_year_food);
    const soap = plan(f.kg_per_person_year_soap);
    const total = people * (food + soap);
    const tree = plan(f.sources.walnut_tree_kg_nuts) * plan(f.sources.walnut_oil_fraction);
    return {
      label: { fr: 'Corps gras nécessaires', en: 'Fat needed' },
      value: round(total),
      range: { lo: round(people * (lo(f.kg_per_person_year_food) + lo(f.kg_per_person_year_soap))), hi: round(people * (hi(f.kg_per_person_year_food) + hi(f.kg_per_person_year_soap))) },
      unit: 'kg/an',
      steps: [
        `alimentation : ${people} × ${food} kg = ${round(people * food)} kg`,
        `savon : ${people} × ${soap} kg = ${round(people * soap)} kg`,
        `total ${round(total)} kg/an`,
        `équivalent : ${round(total / tree, 1)} noyer(s) adulte(s), ou ${round(total / plan(f.sources.pig_lard_kg), 1)} cochon(s), ou ${round(total / (plan(f.sources.rapeseed_oil_t_per_ha) * 1000) * 10000)} m² de colza`,
      ],
      assumptions: [`${food} kg/personne/an pour manger, ${soap} kg pour le savon (1 kg de gras ≈ 1,3 kg de savon)`],
      caveat: {
        fr: "C'est ce qui manque en premier en climat tempéré. Un noyer met 8 à 10 ans avant de produire : si vous n'en avez pas, la décision de plantation est urgente, pas la lecture.",
        en: 'This runs out first in a temperate climate. A walnut takes 8–10 years to bear: if you have none, planting is the urgent decision.',
      },
      see: ['fiche 08 §3'],
    };
  },
};

// ---------------------------------------------------------------------------------------------
// Chaleur et énergie
// ---------------------------------------------------------------------------------------------

const firewood: CalculatorSpec = {
  name: 'bois_chauffage',
  description: {
    fr: "Stères par hiver et surface de taillis nécessaire pour les produire.",
    en: 'Stères per winter and the coppice area that produces them.',
  },
  params: {
    house: { type: 'string', default: 'insulated', enum: ['uninsulated_120m2', 'insulated', 'very_insulated'], description: { fr: 'isolation du logement', en: 'house insulation' } },
    kwh_needed: { type: 'number', description: { fr: 'besoin de chaleur en kWh, si vous le connaissez (prime sur `house`)', en: 'heat need in kWh if known' } },
  },
  run(args) {
    const f = figures().wood;
    const kwhPerStere = plan(f.kwh_useful_per_stere);
    let steres: number;
    let band: Range;
    const steps: string[] = [];
    if (args['kwh_needed'] !== undefined) {
      const kwh = num(args, 'kwh_needed');
      steres = kwh / kwhPerStere;
      band = { lo: kwh / hi(f.kwh_useful_per_stere), hi: kwh / lo(f.kwh_useful_per_stere) };
      steps.push(`${kwh} kWh ÷ ${kwhPerStere} kWh/stère = ${round(steres, 1)} stères`);
    } else {
      const house = str(args, 'house', 'insulated');
      band = f.steres_per_winter[house];
      if (!band) throw new Error(`type de logement inconnu : ${house}`);
      steres = plan(band);
      steps.push(`logement « ${house} » : ${lo(band)}–${hi(band)} stères, retenu ${steres}`);
    }
    const perHa = plan(f.coppice_steres_per_ha_year);
    const ha = steres / perHa;
    steps.push(`${round(steres, 1)} stères ÷ ${perHa} stères/ha/an = ${round(ha, 1)} ha de taillis en rotation`);
    return {
      label: { fr: 'Bois de chauffage', en: 'Firewood' },
      value: round(steres, 1),
      range: { lo: round(lo(band), 1), hi: round(hi(band), 1) },
      unit: 'stères/hiver',
      steps,
      assumptions: [
        `${kwhPerStere} kWh utiles par stère (feuillu dur sec, poêle à ~75 %)`,
        `taillis : ${perHa} stères par hectare et par an en rotation de 15 à 30 ans`,
      ],
      caveat: {
        fr: "Bois humide = moitié moins de chaleur et un feu de cheminée à terme : il faut 18 à 24 mois de séchage, donc deux années d'avance en permanence. Ramonage deux fois par an, et un détecteur de monoxyde de carbone à pile par pièce chauffée — c'est le CO qui tue, pas le froid.",
        en: 'Wet wood halves the heat and eventually causes a chimney fire: 18–24 months of seasoning, so two years standing ahead. Sweep twice a year and fit a battery CO alarm in every heated room.',
      },
      see: ['fiche 08 §4'],
    };
  },
};

const solar: CalculatorSpec = {
  name: 'solaire',
  description: {
    fr: "Puissance de panneaux et capacité de batterie, dimensionnées sur décembre.",
    en: 'Panel power and battery capacity, sized on December.',
  },
  params: {
    kwh_per_day: { type: 'number', required: true, description: { fr: 'consommation quotidienne visée, en kWh', en: 'daily consumption target, kWh' } },
    region: { type: 'string', default: 'mid_fr', enum: ['north_fr', 'mid_fr', 'south_fr'], description: { fr: 'zone (nord/centre/sud de la France)', en: 'region' } },
    battery: { type: 'string', default: 'lifepo4', enum: ['lifepo4', 'lead_acid'], description: { fr: 'technologie de batterie', en: 'battery chemistry' } },
  },
  run(args) {
    const f = figures().solar;
    const need = num(args, 'kwh_per_day');
    const region = str(args, 'region', 'mid_fr');
    const chem = str(args, 'battery', 'lifepo4');
    const dec = f.december_kwh_per_kwp_day[region];
    if (!dec) throw new Error(`zone inconnue : ${region}`);
    const dod = f.depth_of_discharge[chem];
    if (!dod) throw new Error(`technologie de batterie inconnue : ${chem}`);
    const losses = plan(f.system_losses);
    const decDay = plan(dec);
    const kwp = need / (decDay * (1 - losses));
    const days = plan(f.autonomy_days);
    const battery = (need * days) / plan(dod);
    const summer = (kwp * plan(f.kwh_per_kwp_year[region])) / 365;
    return {
      label: { fr: 'Installation solaire', en: 'Solar system' },
      value: round(kwp, 1),
      range: { lo: round(need / (hi(dec) * (1 - losses)), 1), hi: round(need / (lo(dec) * (1 - losses)), 1) },
      unit: 'kWc',
      steps: [
        `${need} kWh/j ÷ (${decDay} kWh/kWc/j en décembre × ${round(1 - losses, 2)}) = ${round(kwp, 1)} kWc`,
        `batterie : ${need} kWh × ${days} jours ÷ ${plan(dod)} = ${round(battery, 1)} kWh nominaux (${chem})`,
        `à titre indicatif, cette installation produira ~${round(summer, 1)} kWh/j en moyenne annuelle`,
      ],
      assumptions: [
        `productible de décembre : ${decDay} kWh par kWc et par jour (${region})`,
        `${round(losses * 100)} % de pertes système (onduleur, câbles, aller-retour batterie)`,
        `${days} jours d'autonomie, décharge à ${round(plan(dod) * 100)} %`,
      ],
      caveat: {
        fr: "Dimensionner sur la moyenne annuelle donne une installation qui tombe en panne en décembre, quand on en a le plus besoin. Le plomb meurt en 3–5 ans si on le descend trop bas ; le LiFePO4 ne doit pas être chargé sous 0 °C.",
        en: 'Sizing on the annual average gives a system that fails in December. Lead dies in 3–5 years if run flat; LiFePO4 must not be charged below 0 °C.',
      },
      see: ['fiche 08 §5'],
    };
  },
};

// ---------------------------------------------------------------------------------------------
// Animaux et semences
// ---------------------------------------------------------------------------------------------

const henFeed: CalculatorSpec = {
  name: 'poules_grain',
  description: {
    fr: "Grain consommé par un troupeau de poules et surface céréalière correspondante.",
    en: 'Grain a flock of hens eats, and the cereal area behind it.',
  },
  params: { hens: { type: 'number', required: true, description: { fr: 'nombre de poules', en: 'number of hens' } } },
  run(args) {
    const f = figures();
    const hens = num(args, 'hens');
    const perHen = plan(f.animals.hen.grain_kg_year);
    const kg = hens * perHen;
    const wheat = plan(f.land.yields_t_per_ha.wheat) * 1000;
    const eggs = hens * plan(f.animals.hen.eggs_year);
    return {
      label: { fr: 'Grain pour les poules', en: 'Grain for the hens' },
      value: round(kg),
      range: { lo: round(kg * 0.85), hi: round(kg * 1.15) },
      unit: 'kg/an',
      steps: [
        `${hens} poules × ${perHen} kg = ${round(kg)} kg de grain par an`,
        `soit ${round((kg / wheat) * 10000)} m² de blé (rendement ${round(wheat)} kg/ha)`,
        `en échange : environ ${round(eggs)} œufs par an`,
      ],
      assumptions: [`${perHen} kg de grain par poule et par an`, `blé à ${round(wheat / 1000, 1)} t/ha sans intrants`],
      caveat: {
        fr: "Les animaux ne sont rentables que s'ils mangent ce que nous ne pouvons pas manger. Une poule qui mange votre blé vous coûte des calories ; une poule qui mange les restes, les insectes et l'herbe vous en rend. La ponte chute nettement après la deuxième année.",
        en: 'Animals only pay when they eat what we cannot. Laying drops sharply after the second year.',
      },
      see: ['fiche 08 §6'],
    };
  },
};

const seedPopulation: CalculatorSpec = {
  name: 'semences_effectif',
  description: {
    fr: "Nombre minimum de pieds à laisser monter en graine pour ressemer sans dégénérescence.",
    en: 'Minimum plants to save seed from without inbreeding depression.',
  },
  params: {
    group: { type: 'string', required: true, enum: ['selfers', 'cucurbits', 'biennials', 'outcrossers'], description: { fr: "groupe d'espèces", en: 'species group' } },
  },
  run(args) {
    const f = figures().seeds;
    const group = str(args, 'group', 'selfers');
    const band = f.min_plants[group];
    if (!band) throw new Error(`groupe inconnu : ${group}`);
    const species: string[] = band.species ?? [];
    return {
      label: { fr: 'Effectif minimum pour la semence', en: 'Minimum seed population' },
      value: plan(band),
      range: { lo: lo(band), hi: hi(band) },
      unit: 'pieds',
      steps: [`groupe « ${group} » : au moins ${plan(band)} pieds${species.length ? ` (${species.join(', ')})` : ''}`],
      assumptions: ['variétés population ou anciennes — les hybrides F1 ne se ressèment pas à l’identique'],
      caveat: {
        fr: "C'est ici que les autonomistes échouent le plus souvent : garder la graine de trois pieds de maïs donne une récolte médiocre en deux générations. Gardez 10 à 15 % de la récolte en semence, et ressemez tout au moins tous les trois ans — une graine jamais semée n'est pas une semence.",
        en: 'Saving seed from three maize plants ruins the crop within two generations. Keep 10–15 % of the harvest as seed and grow everything out at least every three years.',
      },
      see: ['fiche 08 §7'],
    };
  },
};

const stores: CalculatorSpec = {
  name: 'stock_un_an',
  description: {
    fr: "Stock alimentaire d'un an pour un foyer, poste par poste.",
    en: "One year of food stores for a household, item by item.",
  },
  params: {
    people: { type: 'number', required: true, description: { fr: 'personnes', en: 'people' } },
    months: { type: 'number', default: 12, description: { fr: 'durée à couvrir, en mois', en: 'months to cover' } },
  },
  run(args) {
    const f = Object.fromEntries(Object.entries(figures().stores_kg_per_person_year).filter((e): e is [string, number] => typeof e[1] === 'number')); // hors marqueur de provenance (M4-1)
    const people = num(args, 'people');
    const months = num(args, 'months', 12);
    const ratio = months / 12;
    const steps = Object.entries(f).map(([k, v]) => `${k} : ${round(people * v * ratio)} kg`);
    const total = Object.values(f).reduce((s, v) => s + v, 0) * people * ratio;
    return {
      label: { fr: 'Stock alimentaire', en: 'Food stores' },
      value: round(total),
      range: { lo: round(total * 0.9), hi: round(total * 1.1) },
      unit: 'kg',
      steps: [...steps, `total ${round(total)} kg, soit environ ${round(total / 550, 1)} m³`],
      assumptions: [`${months} mois pour ${people} personne(s)`, 'denrées sèches, conservation 5 ans et plus au frais et au sec'],
      caveat: {
        fr: "Les corps gras sont le poste le plus difficile à stocker longtemps : tournez-les tous les deux ans. Et un stock jamais mangé est un stock jamais vérifié — mangez-le et remplacez-le.",
        en: 'Fats are the hardest item to store long: rotate every two years. A store never eaten is a store never checked.',
      },
      see: ['fiche 04 — conservation', 'fiche 08 §10'],
    };
  },
};

export const CALCULATORS: Record<string, CalculatorSpec> = Object.fromEntries(
  [rainwater, cistern, calories, foodLand, fats, firewood, solar, henFeed, seedPopulation, stores].map(c => [c.name, c]),
);

/** Exécute un calculateur par son nom. / Runs a calculator by name. */
export function runCalculator(name: string, args: Record<string, number | string>): CalcResult {
  const calc = CALCULATORS[name];
  if (!calc) throw new Error(`calculateur inconnu : ${name}. Connus : ${Object.keys(CALCULATORS).join(', ')}`);
  return calc.run(args);
}

/** Rend un résultat en texte, pour l'injecter dans le contexte du modèle ou l'afficher tel quel. */
export function formatResult(r: CalcResult, lang: 'fr' | 'en' = 'fr'): string {
  const lines = [
    `${r.label[lang]} : ${r.value} ${r.unit} (fourchette ${r.range.lo}–${r.range.hi})`,
    ...r.steps.map(s => `  ${s}`),
    ...(r.assumptions.length ? [lang === 'fr' ? 'Hypothèses :' : 'Assumptions:', ...r.assumptions.map(a => `  - ${a}`)] : []),
    ...(r.caveat ? [(lang === 'fr' ? 'Attention : ' : 'Caveat: ') + r.caveat[lang]] : []),
  ];
  return lines.join('\n');
}
