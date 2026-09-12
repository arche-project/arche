// L'inventaire : « ce que j'ai à ma disposition ». Point d'entrée de tout projet (ADR 0010).
// The inventory: "what I have at hand". Entry point of every project (ADR 0010).
//
// Un fichier YAML écrit par l'utilisateur (ou rempli par l'interface), lu par les solveurs. Il ne
// contient que des faits sur SA situation : parcelles, semences, matériaux, composants, machines,
// outils, climat, bras disponibles. Jamais de contenu de la bibliothèque.

import fs from 'node:fs';
import { parse } from 'yaml';

export type Sun = 'full' | 'partial' | 'shade';

export interface Plot {
  id: string;
  name?: string;
  area_m2: number;
  sun?: Sun;
  /** Famille botanique cultivée l'an dernier — sert à la rotation. */
  last_family?: string;
  irrigated?: boolean;
  note?: string;
}

export interface SeedLot {
  /** Clé ou alias de knowledge/crops.yaml (`tomate`, `tomato`…). */
  crop: string;
  /** Nombre de plants souhaités ; sinon dérivé de `plants_per_person`. */
  plants?: number;
  variety?: string;
  note?: string;
}

export type DatasetKind = 'orthomosaic' | 'dsm' | 'dtm' | 'pointcloud' | 'satellite' | 'photos' | 'video' | 'camera' | 'sensor_log' | 'gnss_track' | 'field_map' | 'other';
export const DATASET_KINDS: DatasetKind[] = ['orthomosaic', 'dsm', 'dtm', 'pointcloud', 'satellite', 'photos', 'video', 'camera', 'sensor_log', 'gnss_track', 'field_map', 'other'];

/**
 * Une donnée de terrain que l'utilisateur possède déjà : orthophoto drone, MNS/MNT, nuage LiDAR,
 * tuiles satellite, flux caméra, journal de capteurs. Arche ne la produit pas ; il la décrit pour
 * que les outils (ODM, PDAL, QGIS, Node-RED) et le client IA sachent qu'elle existe (ADR 0012).
 */
export interface Dataset {
  id: string;
  kind: DatasetKind;
  /** Chemin local, dossier ou URL de flux (rtsp://…). */
  path: string;
  /** Système de coordonnées (EPSG:2154 pour la France métropolitaine, EPSG:4326…). */
  crs?: string;
  /** Résolution au sol, cm/pixel, ou densité de points par m². */
  resolution?: number;
  date?: string;
  /** D'où ça vient : « drone DJI + ODM », « Sentinel-2 », « caméra ESP32-CAM serre »… */
  source?: string;
  size_gb?: number;
  note?: string;
}

export interface Item { name: string; quantity?: number; unit?: string; note?: string }
export interface Component { ref: string; quantity?: number; note?: string }

export interface Inventory {
  version?: number;
  project?: { name?: string; type?: string };
  /** Nombre de personnes à nourrir / de bras disponibles. */
  people?: number;
  climate?: { zone?: string; last_frost?: string; first_frost?: string; note?: string };
  site?: Record<string, unknown>;
  plots?: Plot[];
  seeds?: SeedLot[];
  materials?: Item[];
  components?: Component[];
  machines?: Item[];
  tools?: string[];
  power?: Record<string, unknown>;
  /** Données de terrain déjà en possession de l'utilisateur. */
  datasets?: Dataset[];
}

const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Erreurs bloquantes d'un inventaire, en clair. Vide = utilisable. */
export function validateInventory(inv: unknown): string[] {
  const errs: string[] = [];
  if (!inv || typeof inv !== 'object' || Array.isArray(inv)) return ['inventaire : un objet YAML est attendu'];
  const i = inv as Inventory;
  if (i.people !== undefined && (!Number.isFinite(i.people) || i.people <= 0)) errs.push('people : nombre > 0 attendu');
  for (const k of ['last_frost', 'first_frost'] as const) {
    const v = i.climate?.[k];
    if (v !== undefined && !MMDD.test(String(v))) errs.push(`climate.${k} : format MM-JJ attendu (ex. 05-10), reçu « ${String(v)} »`);
  }
  const ids = new Set<string>();
  for (const [n, p] of (i.plots ?? []).entries()) {
    if (!p || typeof p !== 'object') { errs.push(`plots[${n}] : objet attendu`); continue; }
    if (!p.id) errs.push(`plots[${n}] : id manquant`);
    else if (ids.has(p.id)) errs.push(`plots[${n}] : id « ${p.id} » en double`);
    else ids.add(p.id);
    if (!Number.isFinite(p.area_m2) || p.area_m2 <= 0) errs.push(`plots[${n}] : area_m2 > 0 attendu`);
    if (p.sun !== undefined && !['full', 'partial', 'shade'].includes(p.sun)) errs.push(`plots[${n}] : sun = full | partial | shade`);
  }
  for (const [n, s] of (i.seeds ?? []).entries()) {
    if (!s || typeof s !== 'object' || !s.crop) { errs.push(`seeds[${n}] : crop manquant`); continue; }
    if (s.plants !== undefined && (!Number.isFinite(s.plants) || s.plants < 0)) errs.push(`seeds[${n}] : plants ≥ 0 attendu`);
  }
  for (const [n, c] of (i.components ?? []).entries()) if (!c || !c.ref) errs.push(`components[${n}] : ref manquante`);
  const dsIds = new Set<string>();
  for (const [n, d] of (i.datasets ?? []).entries()) {
    if (!d || typeof d !== 'object') { errs.push(`datasets[${n}] : objet attendu`); continue; }
    if (!d.id) errs.push(`datasets[${n}] : id manquant`);
    else if (dsIds.has(d.id)) errs.push(`datasets[${n}] : id « ${d.id} » en double`);
    else dsIds.add(d.id);
    if (!DATASET_KINDS.includes(d.kind)) errs.push(`datasets[${n}] : kind = ${DATASET_KINDS.join(' | ')}`);
    if (!d.path) errs.push(`datasets[${n}] : path manquant (chemin local ou flux)`);
    if (d.crs !== undefined && !/^EPSG:\d+$/i.test(String(d.crs))) errs.push(`datasets[${n}] : crs au format EPSG:xxxx`);
  }
  return errs;
}

/** Lit et valide un inventaire ; lève une erreur lisible sinon. */
export function loadInventory(file: string): Inventory {
  const raw = parse(fs.readFileSync(file, 'utf8')) as unknown;
  const errs = validateInventory(raw);
  if (errs.length) throw new Error(`inventaire invalide (${file}) :\n  - ${errs.join('\n  - ')}`);
  return raw as Inventory;
}

/** Les sections présentes, en notation pointée (`plots`, `climate.last_frost`) — pour les recettes. */
export function inventoryFields(inv: Inventory): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(inv)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) { if (v.length) out.add(k); continue; }
    out.add(k);
    if (typeof v === 'object') for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) if (v2 !== undefined && v2 !== null) out.add(`${k}.${k2}`);
  }
  // Champs par élément de tableau : `plots.sun` présent si au moins une parcelle le renseigne.
  for (const p of inv.plots ?? []) for (const k of ['sun', 'last_family', 'irrigated'] as const) if (p[k] !== undefined) out.add(`plots.${k}`);
  for (const d of inv.datasets ?? []) out.add(`datasets.${d.kind}`);
  return out;
}
