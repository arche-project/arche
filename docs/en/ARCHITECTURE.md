# Arche architecture

> French version: [docs/fr/ARCHITECTURE.md](../fr/ARCHITECTURE.md). Detailed decisions: [docs/adr/](../adr/).

## 1. The problem in one sentence

Make hundreds of gigabytes of knowledge and tools usable on an ordinary machine with no network,
**without ever hosting them ourselves**, for three audiences that share neither hardware nor vocabulary.

## 2. Principles

1. **Orchestrator, not host.** The repo weighs a few MB. It describes *where* and *how* to obtain
   each resource from its official publisher. No third-party content is redistributed.
2. **Graceful degradation.** Everything that can work offline works offline: catalog validation,
   plan computation, integrity checks, the web UI, USB import. Only the initial download needs a network.
3. **As few dependencies as possible.** Two runtime deps (`commander`, `yaml`). No web framework, no
   database, no validation library: the JSON Schema validator is 70 lines. A survival kit must still
   compile in ten years.
4. **One readable state file.** `<library>/.arche/state.json`. You can read it, copy it, fix it by hand.
5. **Every choice is explained.** The recommender emits one *reason* per line ("essential",
   "recommended, fits on disk", "replaced by…"). No magic.
6. **One logic for every audience.** The interactive wizard, the web UI and the `arche.yaml` file all
   call the same `plan()` function. Beginner and expert get the same selection for the same answers.

## 3. Layout

```
arche/
├── catalog/                     # THE core: knowing "what to download from where"
│   ├── schema/                  # JSON Schema (contract): resource.schema.json, profile.schema.json
│   ├── resources/               # one YAML list per theme (encyclopedia, practical, technical, ai-models,
│   │                            #   software, git-mirrors, toolchains, maps-and-printables)
│   ├── profiles.yaml            # user profiles, hardware presets, AI tiers
│   └── bundles.yaml             # thematic bundles (core, health, homestead, ai, maker…)
├── src/
│   ├── cli.ts                   # entry point: bare `arche` = wizard; scriptable sub-commands
│   ├── commands/                # init (wizard), plan, download, verify, serve, export/import, catalog
│   ├── core/                    # catalog, schema, recommend, hardware, downloader, kiwix, integrity,
│   │                            #   state, config, prompts, i18n
│   └── web/                     # server.ts (node:http, JSON API + SSE) and static/index.html (single-file UI)
├── scripts/catalog/             # automatic update (Kiwix OPDS, GitHub, Ollama/HF, dead links)
├── .github/workflows/           # ci.yml, catalog-update.yml (auto PR), release.yml (executables)
├── locales/                     # FR/EN CLI strings
├── config/arche.example.yaml    # commented declarative config
├── docs/{fr,en}/                # per-profile guides, decisions, blind spots
├── docs/printables/{fr,en}/     # printable sheets (low-tech profile)
├── docs/adr/                    # Architecture Decision Records
└── tests/                       # node:test
```

Never in the repo: `library/` (downloads), `.arche/` (state), `*.part`.

## 4. The catalog

### 4.1 A resource

Every entry in `catalog/resources/*.yaml` is validated against `catalog/schema/resource.schema.json`.
Key fields:

| Field | Role |
|---|---|
| `id` | stable slug, never reused |
| `type` | `zim` · `ai-model` · `git-repo` · `toolchain` · `pdf` · `software` · `dataset` · `map` |
| `category` | theme (medical, water, energy, electronics…) — used for UI grouping |
| `name`, `description`, `notes` | mandatory `{fr, en}` objects |
| `languages` | ISO codes or `mul` |
| `profiles` | `bunker` / `lowtech` / `novice`: who this resource makes sense for |
| `priority` | `essential` (always checked) · `recommended` (checked if it fits) · `optional` |
| `size_bytes` / `size_estimate_gb` | exact (filled by the updater) / human estimate |
| `source` | `kind` + stable identifiers: `kiwix_name`, `github_repo` + `github_asset_pattern`, `ollama_model`, `hf_repo`/`hf_file`, `url` |
| `checksum` | `algo`, `value`, or `url` of a sidecar file |
| `license` | `spdx` + `redistribution` (`allowed`, `allowed-nc`, `attribution`, `forbidden`, `unclear`) |
| `requires` | disk, RAM, VRAM, GPU, OS, arch, tools on PATH |
| `depends_on` / `provides` | dependency graph (a ZIM depends on `kiwix-tools`) |
| `printable` | is there a paper version? |
| `update.tracker` | which updater script follows it |
| `status` | `active` · `unverified` (hand-entered) · `deprecated` · `missing` (gone upstream) |
| `reliability` | editorial confidence: `reference`, `curated`, `community`, `unknown` |

Why YAML rather than JSON: comments. Resource files are *read by humans* and *rewritten by robots*;
the `yaml` library preserves comments on round-trip.

### 4.2 Profiles, presets, AI tiers (`profiles.yaml`)

- **Profiles**: what is shown and hidden (`hide_types`, `hide_categories`), which priorities are
  pre-checked, and the share of free disk we allow ourselves (`disk_budget_ratio`).
- **Hardware presets**: "laptop + USB SSD", "Raspberry Pi 5", "desktop with GPU", "old laptop".
  They replace detection when the user prepares a disk for another machine.
- **AI tiers**: `tiny` (4 GB) → `xlarge` (64 GB RAM or 24 GB VRAM). The largest satisfied tier wins;
  its first model becomes the default chat model.

### 4.3 Bundles (`bundles.yaml`)

Thematic packs the wizard offers as one checkbox. A bundle has no priority of its own: checking it
checks its resources. The `ai` bundle is *dynamic*: it adds the detected tier's models.

## 5. The recommender (`src/core/recommend.ts`)

Inputs: catalog, hardware (detected or preset), options (profile, languages, bundles,
include/exclude, budget). Output: a list of `{resource, sizeGb, selected, reason}` plus warnings.

Rules, in order:

1. **Hard filter**: profile, OS/arch, required RAM/VRAM, `status` ≠ `deprecated|missing`. What fails
   does not appear. Resources in a non-requested language stay visible but are never checked.
2. **AI tier** → only the tier's models appear (others via explicit `include`).
3. Explicit `include` and bundles → checked.
4. **Essentials** → checked even if the budget explodes (with a warning).
5. The tier's default AI model.
6. **Recommended, smallest first**, while the budget holds. Twenty small useful resources beat one huge one.
7. **Substitutions**: if `wikipedia-fr-maxi` fits in what is left, it replaces `wikipedia-fr-nopic`.
8. Optionals (bunker profile only, < 30 GB each).
9. `exclude` always wins.
10. Dependencies: checking a resource checks its `depends_on`.

Default budget = free space × the profile's `disk_budget_ratio` (60% for a beginner: leave room for
updates and for models that grow).

## 6. The wizard: three interfaces, one logic

| Interface | Command | Audience |
|---|---|---|
| **Interactive terminal** | `arche` (or `arche init`) | beginner; numbered questions, no technical concept |
| **Local web** | `arche serve` → http://localhost:8765 | beginner / family; same flow, more comfortable; SSE progress |
| **Declarative** | `arche plan|download --config arche.yaml -y` | expert; scriptable, reproducible, CI-able |

The beginner flow asks **three questions** (profile, target, languages) plus one "which topics do you
absolutely want" box; everything else is derived. Hidden from them: ids, types, licenses, exact
sizes, URLs, the AI tier. Still shown: the total in GB, the budget bar, and *why* each line is
checked. Expert mode (a checkbox in the UI, `--include` etc. in the CLI) reveals ids, licenses,
RAM/VRAM overrides and the `arche.yaml` export.

## 7. Download, resume, integrity, offline

- **Resolution**: a stable `kiwix_name` is translated at run time into a dated URL through the Kiwix
  OPDS (`library.kiwix.org/catalog/v2/entries?name=…`). A GitHub release resolves through
  `/releases/latest` + `github_asset_pattern` + a platform heuristic. Ollama and Git delegate to the
  binaries (`ollama pull`, `git clone --mirror`).
- **Resume**: download into `<file>.part` with a `Range` header. A server ignoring `Range` (200
  instead of 206) restarts cleanly from zero. 5 attempts with exponential backoff.
- **Integrity**: streaming sha256 (or md5). The expected checksum comes, in order, from the catalog,
  a `<url>.sha256` / `.md5` sidecar, else the announced size is compared. Failure → file deleted,
  error raised. `arche verify` re-hashes everything offline; `--fix` drops corrupt entries so
  `arche download` fetches them again.
- **Atomicity**: `.part` → `rename()` after verification; `state.json` written through a temp file.
  A power cut leaves at worst a resumable `.part`.
- **Order**: software first (Kiwix, Ollama), then smallest to largest. Something usable appears quickly.
- **Git**: `clone --mirror` + `remote update --prune` on resume, the wiki as a separate repo
  (`<repo>.wiki.git`), release binaries apart, and a `git bundle --all` (single copyable file,
  restorable with `git clone file.bundle`).
- **Ollama**: `OLLAMA_MODELS` points at `<library>/models/ollama` so weights live on the external disk.
- **Already-offline machine**: `arche export --to /media/usb` copies library + state + the Arche repo
  (and the executable if present); `arche import --from /media/usb` on the target. Then `arche serve`
  works with no network. Online detection is a single HEAD on library.kiwix.org with a 3 s timeout.

## 8. Technical choices (summary — details in `docs/adr/`)

| Choice | Why | Cost |
|---|---|---|
| **Node 22 + TypeScript** | Florian's choice; native `fetch`, `statfs`, `readline/promises`, `node:test` → very few deps; Node is everywhere (Pi included) | a ~100 MB runtime; beginners get a **SEA executable** (`scripts/build-sea.sh`, `release.yml`) |
| **2 runtime deps** | resilience: rebuildable in ten years with an old Node | we rewrote prompts + validator (~150 lines) |
| **YAML catalog** | comments, readability, round-trip by the updater | marginally slower parse (unmeasurable here) |
| **JSON Schema as contract** | validatable by any tool, even without Arche | two validators (in-house at run time, Ajv in CI) |
| **No web framework** | `node:http` + one HTML file suffice; must run on a Pi and stay readable in ten years | no reusable components |
| **SSE over WebSocket** | native, one-way, enough for progress | — |
| **state.json over SQLite** | readable, copyable, no native binary | no complex queries (not needed) |
| **Portability** | Windows/macOS/Linux x64+arm64: 3-OS CI matrix + ARM64 job; `node:path`; `which`/`where`; `start`/`open`/`xdg-open` | Windows ARM untested |

## 9. Automatic catalog update

See `scripts/catalog/` and `.github/workflows/catalog-update.yml`. Every Monday: `check-kiwix`
(full OPDS → URL, size, version, `missing`), `check-github` (releases, commits, archived repos →
`deprecated`), `check-models` (Ollama registry, HF `paths-info` with sha256, list of new popular
models), `check-links` (HEAD on every URL; only 404/410 become `missing`, 403/429 are merely
reported). Then validation and a `catalog/auto-update` PR with a change table and a review
checklist. Nothing merges without a human.

## 10. What this architecture does not solve

See [BLIND-SPOTS.md](BLIND-SPOTS.md). Notably: no ZIM for several major French sources (Low-tech Lab,
Open Source Ecology, WikiHow gone), Kiwix as a single point of failure, and reading the ZIM format in
ten years.
