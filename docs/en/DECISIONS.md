# Decisions needed

> What I did **not** decide alone. Each point has a recommendation, but the call is yours.
> Français : [DECISIONS.md](../fr/DECISIONS.md)

## D1 — WikiHow has vanished from Kiwix

As of 2026-09-11 no WikiHow ZIM (FR or EN) is listed on download.kiwix.org. The resource is
`status: missing`. Options: (a) drop it; (b) document building a personal ZIM with Zimit
(CC BY-NC-SA: everyone builds their own, no redistribution); (c) ask Kiwix whether it is temporary.
**Reco: (b) + (c).** Unique content for a beginner.

## D2 — Major French sources without a ZIM: Low-tech Lab, Open Source Ecology, Farm Hack

The most relevant French content (Low-tech Lab) has no ZIM. Options: (a) a Zimit recipe for each
(everyone builds their own — slow, fragile); (b) ask the projects for an official ZIM or permission to
publish one under their name; (c) publish an "Arche community" ZIM (redistribution → leaves the
"pure orchestrator" principle, and NC licenses to respect). **Reco: (b) first, (a) meanwhile.**
(c) needs a principle decision on hosting.

## D3 — Does the project ever host anything?

Today: nothing. But a `catalog.json` on GitHub Pages (already in the workflow), a precomputed
embeddings index for RAG, or community ZIMs (D2) are hosting. Decide a rule: "Arche hosts only what
it produces itself from free sources (indexes, catalogs), never third-party content".

## D4 — Hesperian, IFRC: French PDF URLs unconfirmed

*Where There Is No Doctor* PDFs sit behind a form; the IFRC 2020 guidelines have no stable FR URL
found. Entries are `source.kind: manual`. URLs must be confirmed by hand (or by writing to Hesperian)
before these become truly downloadable.

## D5 — Maps: Organic Maps vs OsmAnd

Organic Maps is simplest for a beginner, but its per-region `.mwm` files download from the app via a
CDN with no stable URL. OsmAnd's `.obf` files are directly downloadable. For the bunker profile, the
Geofabrik `.pbf` + a local tile server (tileserver-gl / Protomaps `.pmtiles`) is the robust path.
**Reco: Protomaps `.pmtiles` France** (a single, statically served file) — add once a stable URL is identified.

## D6 — Repository name and URL — **decided: `github.com/arche-project/arche`**

Florian left the choice open (12 September 2026; "ApocaGit" discarded by himself). The project name stays **Arche** — it reads as is in English, and the `arche` organisation on GitHub is held by an inactive account. The repository lives in a **dedicated organisation**, `arche-project` (free on that date, as were `arche-offline`, `getarche`, `arche-base`), rather than on the personal account: that is what lets maintainers be added without moving the repository, and it is the field's convention (Project NOMAD, openZIM). Every reference in the repository now points to `arche-project/arche`; the publishing procedure is in [PUBLICATION.md](../fr/PUBLICATION.md) (ticket M0-1).

## D7 — Node target: 22 minimum?

`fs.statfs`, `readline/promises`, `fetch`, SEA: all need Node ≥ 20, and 22 is LTS until 2027.
Raspberry Pi OS Bookworm ships Node 18 → install from NodeSource or ship the SEA executable.
**Reco: ≥ 22, with the SEA executable as the beginner path.**

## D8 — v0.1 scope

Coded and tested: catalog, validation, plan, CLI wizard, web UI, resumable HTTP download with
checksums, Kiwix OPDS, GitHub releases, `ollama pull`, Git mirrors, verify, export/import, updater +
workflows. **Designed but not coded**: ~~`arche assist` (RAG)~~ (dropped, ADR 0011: MCP server instead, coded), launching Open WebUI/Gitea from `serve`,
automated toolchain recipes, incremental library updates ("Check for updates" in the UI). Confirm
the order: I propose RAG first (it's what makes the project unique), toolchains next.

## D9 — Funding and governance

MIT + donations. Pick the platform (GitHub Sponsors, Liberapay, Ko-fi) and decide early whether the
project aims at a non-profit (French *association loi 1901*) to receive grants — this conditions D3
and the bus factor.

## D10 — The word "survival"

The positioning ("civil war", "bunker") attracts one audience and repels another (schools,
libraries, municipalities, NGOs — exactly those who would deploy RACHEL/IIAB). "Arche" is neutral;
the current README says "long outage, dead zone, stop depending on the network". Decide the tone:
I recommend keeping the extreme use cases in the docs but not in the first sentence.

## D11 — Internet Archive: account and keys (to do at your PC)

Create an archive.org account, get the S3 keys at https://archive.org/account/s3.php, store them as GitHub secrets `IA_ACCESS_KEY` / `IA_SECRET_KEY`. Then run `zim-build.yml` manually with the `arche-docs-mul` recipe (our own docs, free license: zero risk) to validate the whole chain before touching third-party sources.

## D12 — Permissions to request first

By impact: Low-tech Lab (`lowtechlab-fr`, CC BY-NC-SA), InMoov (CC BY-NC), e-NABLE (mixed), Farm Hack (no license). The template email is in HOSTING.md. Open Source Ecology and RepRap can be built without asking (CC BY-SA / GFDL) — I suggest starting with them.

## D13 — Curators

COMMUNITY.md assumes 5–15 domain curators. Who, concretely, for health (where the four-eyes rule is mandatory)? Without at least one care professional, I recommend not accepting new `medical` resources beyond the reference sources already listed.

## D14 — Seed by default

DISTRIBUTION.md proposes that `arche serve` seeds torrents by default (capped). Right for resilience, but some users (metered connections, hostile ISPs) will dislike it. Alternative: opt-in with a box ticked by default in the wizard, explained in one sentence. Your call.

## D15 — Emergency rescue (this week)

L'Atelier Paysan (in liquidation) and Practical Plants (abandoned site) may vanish. The plan is in [EMERGENCY-RESCUE.md](EMERGENCY-RESCUE.md): run the `rescue` workflow as soon as the repo is on GitHub, ask the Wayback Machine and Archive Team to save the sites, send the permission email (ready in `docs/permissions/atelierpaysan-fr.md`). Your call: do you accept a private copy on an external disk of yours in addition to the CI artifact? I recommend it (two copies).

## D16 — Hesperian: ask permission for the French HealthWiki

The FR editions (midwives, women's health, dental) exist **only as HTML**, no PDF: a French speaker offline has no access at all today. Hesperian's licence allows non-commercial copying but requires **written permission for any digital format**. The email is ready in `docs/permissions/hesperian-fr.md`, with an option likely to land: hand them the ZIM so **they** publish it under their own name (via Kiwix). Send it alongside L'Atelier Paysan.

## D17 — What is redistributable right now in first-line care

Only two: **WHO MCPC** (obstetric emergencies, CC BY-NC-SA 3.0 IGO, French edition exists) and **Where There Is No Psychiatrist** (CC BY-NC-ND 4.0, verbatim). Recipes are written with `permission: license`: they can go out on the first `zim-build` run. Everything else (Hesperian, MSF, Global Health Media, Merck, Oxfam) is personal download only — documented in each entry.

## D18 — A ready-to-run "Arche" virtual-machine image?

You are right that Arche needs a stable environment underneath. The current path is **Debian stable + the native supervisor** (ADR 0008). The alternative is a **VM image** built in CI (Debian + Arche + services preinstalled, qcow2/OVA/raw) for whoever has an arbitrary host and wants the same environment as everyone else. Reproducible and testable, but a hypervisor is heavier than Docker, which cuts against the "no daemon" spirit. My view: useful for the *bunker* profile on a powerful machine, pointless on the Pi, never the recommended path for a beginner. **To decide**: build it (one more target in `release.yml`, ~40 lines with `virt-builder` or `mkosi`) or leave it to the community. See [MIRRORS.md](MIRRORS.md).

## D19 — The format of reference-design sheets (`knowledge/designs/`)

ADR 0010 requires a physical project to derive an existing design (OpenWeedLocator, AgOpenGPS, FarmBot) and the BOM to go through `bom_substitute`, which crosses the reference sheet with the inventory. The sheet does not exist yet: one YAML BOM per design, each line with its accepted equivalents and *what changes* when they are used (voltage, current, pinout, speed). **To decide**: write the format in the abstract, or — my view — freeze it with the first sheet (OWL, MVP gap G8) and let AgOpenGPS and FarmBot follow. See [MVP.md](MVP.md).

## D20 — The `autonomiste` profile, finally defined

Requested from the start, never defined. The MVP defines it as: **novice + the corpus of the five project recipes** (garden, weeding robot, bioclimatic house, tractor, automated farm), i.e. ~111 resources and ~96 GB with the fifth 'automated farm' recipe (~85 without Debian DVD-1 or Frigate/Meshroom), AI tier *medium* from 16 GB of RAM, physical target a 128 GB SSD. **To validate**: this scope, and moving Debian DVD-1 to the separate Ventoy stick. See [MVP.md](MVP.md).

## D21 — A GPU machine to index the big corpora

`index-build.yml` embeds on CPU in GitHub Actions: ~30 chunks/s, 6 h per job — enough for 120 corpora under 2 GB, not for Wikipedia FR (13 GB, ~4.5 million chunks, ~40 h CPU). Three paths: a self-hosted runner with a GPU at someone trusted (an RTX 4090 does Wikipedia FR in ~2 h), a one-off rental, or waiting — Wikipedia stays searchable through Xapian alone, which already works. **To decide** once M1 has proven the chain on small corpora. See [MVP.md](MVP.md).

## D22 — One source language for the documentation — **decided: English**

The audit (error 11) found everything translated by hand twice, and drifting. Florian decided on 12 September 2026: the repository is global, **English is the source language**. `docs/en/`, `README.md` and `locales/en` are what gets edited; `docs/fr/` (and other languages) are *generated* by a script, carry a header "translated from docs/en/… — do not edit" and a fingerprint of the source, and CI rejects a hand-edited translation. Ticket M3-5 puts this in place. Until it is done, both trees are still edited in parallel, English prevailing on any discrepancy. See [ORCHESTRATION](../fr/ORCHESTRATION.md).

## D23 — Second and third hosts for the shards

The audit (error 8): a single host (Internet Archive) for what Arche builds. Candidates: GitHub Releases (≤ 2 GB per file), Zenodo (DOI, 50 GB per record), Hugging Face datasets, an IPFS mirror. Two are needed besides IA, with compatible licences and an `index.mirrors[]` field in the catalogue (ticket M2-6). **To decide.** See [ORCHESTRATION](../fr/ORCHESTRATION.md).

## D24 — Arche's role: an aggregator, plus a RAG — **decided**

After the competitive analysis ([COMPETITION.md](COMPETITION.md)), Florian decided on 12 September 2026: Arche owns being **an aggregator** (the catalogue knows where everything is and fetches the latest stable from upstream; hosts nothing that exists elsewhere) **plus a RAG** (the corpus indexes, built in CI, published on Internet Archive, served over MCP — the only artefact Arche produces). No appliance, no client, no map engine, no content repository, no extra package manager: when a gap falls in those categories, catalogue what does it and distribute through it (M4-12). Written in [ADR 0015](../adr/0015-agregateur-et-rag.md).
