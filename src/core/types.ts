// Types du catalogue. Miroir des JSON Schema dans catalog/schema/.
// Catalog types. Mirror of the JSON Schemas in catalog/schema/.

export type Lang = 'fr' | 'en';
export type I18n = Record<Lang, string>;

export type ProfileId = 'bunker' | 'lowtech' | 'novice';
export type Priority = 'essential' | 'recommended' | 'optional';
export type ResourceType = 'zim' | 'ai-model' | 'git-repo' | 'toolchain' | 'pdf' | 'software' | 'dataset' | 'map';
export type SourceKind = 'kiwix' | 'github-release' | 'github-repo' | 'ollama' | 'huggingface' | 'http' | 'manual' | 'arche-hosted';
export type Status = 'active' | 'unverified' | 'deprecated' | 'missing';
/** Sur quoi tourne un logiciel (ADR 0008). / What a piece of software runs on. */
export type Runtime = 'static-binary' | 'node' | 'python' | 'jvm' | 'container' | 'source' | 'firmware' | 'none';

export interface Source {
  kind: SourceKind;
  url?: string;
  homepage?: string;
  mirrors?: string[];
  kiwix_name?: string;
  github_repo?: string;
  github_asset_pattern?: string;
  ollama_model?: string;
  hf_repo?: string;
  hf_file?: string;
  include_wiki?: boolean;
  include_releases?: boolean;
  ia_item?: string;
  torrent?: string;
  magnet?: string;
  ipfs_cid?: string;
}

export interface Checksum { algo: 'sha256' | 'sha1' | 'md5'; value?: string | null; url?: string | null }

export interface Requires {
  disk_gb?: number; ram_gb?: number; vram_gb?: number;
  gpu?: 'none' | 'optional' | 'required';
  os?: Array<'linux' | 'macos' | 'windows'>;
  arch?: Array<'x64' | 'arm64' | 'armv7'>;
  tools?: string[];
}

export interface Resource {
  id: string;
  type: ResourceType;
  category: string;
  name: I18n;
  description: I18n;
  tags?: string[];
  languages: string[];
  profiles: ProfileId[];
  priority: Priority;
  size_bytes?: number | null;
  size_estimate_gb?: number | null;
  version?: string | null;
  updated?: string | null;
  source: Source;
  checksum?: Checksum | null;
  license: { spdx: string; url?: string; redistribution?: string; note?: I18n };
  requires?: Requires;
  depends_on?: string[];
  provides?: string[];
  printable?: { available?: boolean; url?: string; pages_estimate?: number; note?: I18n } | null;
  update?: { tracker: string; check_interval_days?: number; stability?: 'stable' | 'lts' | 'any'; package?: string } | null;
  /** Date de dernière vérification amont par l'updater (≠ `updated`, date de la version amont). */
  checked?: string | null;
  /** ADR 0008 : runtime déclaré ; `container` ne peut être ni essential/recommended ni novice. */
  runtime?: Runtime;
  built_from?: { url: string; tool: string; recipe?: string; built_at?: string | null; permission?: 'license' | 'written' | 'pending' | 'none'; permission_ref?: string } | null;
  /** Shard d'index de récupération (ADR 0007). / Retrieval index shard (ADR 0007). */
  index?: IndexShardRef | null;
  status: Status;
  reliability?: string;
  notes?: I18n;
}

/**
 * Référence au corpus publié d'une ressource (`.arche.sqlite.zst`, ADR 0014 ; M1-10 finit le bloc).
 * `model`/`dims` : la table de vecteurs qu'il porte — chaque base a les siennes, rien à fusionner.
 * Reference to a resource's published corpus; model/dims name the vector table it carries.
 */
export interface IndexShardRef {
  url?: string;
  sha256?: string | null;
  size_bytes?: number | null;
  model: string;
  dims: number;
  chunks?: number | null;
  built_at?: string | null;
  /** La ressource porte déjà un index plein texte (Xapian dans les ZIM Kiwix). */
  lexical?: boolean;
}

export interface Profile {
  id: ProfileId; name: I18n; tagline: I18n;
  default_priorities: Priority[];
  disk_budget_ratio: number;
  prefer_printable?: boolean;
  hide_types?: string[]; hide_categories?: string[];
}

export interface HardwarePreset {
  id: string; name: I18n; description: I18n;
  assumed: { disk_gb?: number; ram_gb?: number; vram_gb?: number; arch?: string; os?: string };
}

export interface AiTier { id: string; min_ram_gb: number; min_vram_gb: number | null; models: string[] }

export interface Bundle { id: string; name: I18n; description: I18n; resources: string[]; dynamic?: string }

export interface Catalog {
  resources: Resource[];
  byId: Map<string, Resource>;
  profiles: Profile[];
  hardware_presets: HardwarePreset[];
  ai_tiers: AiTier[];
  bundles: Bundle[];
  generatedAt: string;
}

export interface Hardware {
  os: 'linux' | 'macos' | 'windows';
  arch: 'x64' | 'arm64' | 'armv7';
  ram_gb: number;
  vram_gb: number;          // 0 = pas de GPU dédié détecté
  gpu_name?: string;
  disk_free_gb: number;     // sur le dossier de destination
  tools: Record<string, boolean>; // git, ollama, docker, python3...
  online: boolean;
}

export interface PlanOptions {
  profile: ProfileId;
  languages?: string[];          // ['fr','en'] — ordre = préférence
  bundles?: string[];            // bundles cochés explicitement
  include?: string[];            // ids forcés
  exclude?: string[];            // ids exclus
  diskBudgetGb?: number;         // remplace hw.disk_free_gb * ratio
  allowPriorities?: Priority[];  // remplace profile.default_priorities
}

export interface PlanItem {
  resource: Resource;
  sizeGb: number;
  selected: boolean;
  reason: string;                // clé i18n + détail
  viaBundle?: string;
}

export interface Plan {
  profile: ProfileId;
  items: PlanItem[];
  totalSelectedGb: number;
  budgetGb: number;
  aiTier: string | null;
  warnings: string[];
}

export const sizeGbOf = (r: Resource): number =>
  r.size_bytes != null ? r.size_bytes / 1e9 : (r.size_estimate_gb ?? 0);
