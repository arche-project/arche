# Competitive analysis — what exists, what Arche has more or less of, what to add

> Written 12 September 2026 from the public sources listed at the end. Figures are those
> displayed that day; stars and prices move. Read with [MVP.md](MVP.md) (what the product is)
> and [ARCHITECTURE-AUDIT](../fr/AUDIT-ARCHITECTURE.md) (what is wrong with it today).
> Français : [CONCURRENCE.md](../fr/CONCURRENCE.md).

## The landscape in one paragraph

Everything that resembles Arche falls into three families. **Reading appliances** put a Kiwix
library on a box with its own Wi-Fi: Kiwix Hotspot, Internet-in-a-Box, RACHEL, and their
commercial or clone descendants PrepperDisk and PrepperPi. **All-in-one servers with an AI**
add a local model next to the library: Project NOMAD — 36 400 stars in six months, the
reference of the moment —, its commercial packaging Personal Codex, and small personal setups
like civilization_node. **Pre-built indexes** publish a ready-made search index of Wikipedia
for a model to query: NeuML's txtai-wikipedia, the Cohere and Upstash embedding dumps,
wikilite (one SQLite per language with FTS5 and vectors, an MCP endpoint, 12 stars), plus a
handful of small MCP servers over ZIM files (openzim-mcp, kiwix-wiki-mcp-server). Nobody sits
where Arche wants to sit: **hundreds of corpora beyond Wikipedia, as model-agnostic shards,
served over MCP to a small offline model, with provenance, alongside the tools, mirrors,
models and methods needed to do things — not only read.**

## Side by side

| | Kiwix / Hotspot | Internet-in-a-Box | RACHEL | PrepperDisk | PrepperPi | Project NOMAD | Personal Codex | civilization_node | txtai-wikipedia | wikilite | **Arche (target)** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| What | ZIM format + readers + Pi 5 appliance | Ansible stack, ~40 apps, Pi/x86 | Nonprofit Wi-Fi server, curated OER | Pi appliance, $200–360 | Open Pi clone of PrepperDisk | Docker server + Command Center | NOMAD pre-installed, $499–2 899 | Open WebUI + Kiwix + Ollama | Faiss+SQLite index of EN Wikipedia leads | SQLite FTS5 + ANN per language | Catalogue + shards + MCP |
| Licence | GPLv3, nonprofit (Lausanne, 2007) | GPL-2.0, volunteers | mixed; contentshell CC BY-SA-**NC** | proprietary layer on IIAB/Kiwix | MIT-0 | Apache-2.0 | Apache-2.0 (NOMAD) | MIT | CC-BY-SA data | GFDL data | MIT code, inherited licences |
| Scale | 10 M+ users, 100+ languages | 2 000 ★, dozens of countries | 40+ countries, 500 k learners (2015) | ~5 000 units | 2 ★, v1.0 Apr 2026 | 36.4 k ★ / 3.6 k forks, monthly releases | resells NOMAD | 8 ★ | 6.5 M rows, 9 GB | 551 GB of DBs on HF | 0 users |
| Content model | user picks ZIMs; mirrors; torrents | user picks Kiwix/OER2Go/Kolibri/OSM | curated ZIP modules, single origin | ships ZIMs + licensed exclusives | downloads, never ships; YAML bundles | downloads from Kiwix; PMTiles maps; creator packs | pre-loaded | wget from download.kiwix.org | one index, refreshed twice a year | prebuilt DBs | **downloads latest stable from upstream; hosts only what does not exist elsewhere (shards, ZIMs)** |
| AI layer | none official | none | "RACHEL AI" semantic search, closed | undisclosed / retracted chatbot | none (idea) | Ollama + Qdrant, custom RAG | same | Ollama + Kiwix Xapian tool | consumer's choice | built-in Qwen3 embeddings | **none — Arche is a server; the client is yours** |
| RAG over the library | — | — | search only | ? | — | **not by default** (5–10× disk, "hours to days per GB" on CPU) | over uploaded docs | 1 article, first 6 kB | vectors on lead paragraphs only | FTS5 + ANN | FTS5 + int8 vectors per corpus, hybrid, routed |
| Model-agnostic index | — | — | — | — | — | Qdrant, model undocumented | — | — | **no** (e5-base baked in) | **no** (Qwen3 baked in) | **yes** — one vector table per model, text re-embeddable |
| MCP / API for other clients | OPDS, /search, /raw | — | — | — | JSON admin, no auth | management API; **no MCP** | — | — | Python only | **MCP `/mcp`** | **MCP stdio + HTTP, 21 tools** |
| Integrity | torrent hashes, UUIDs | inherited | none | — | **GPG-signed images**, SHA-256 for static files | none (`curl \| sudo bash`, `:latest`) | — | none | — | — | planned: signed catalogue, mandatory sha256 (M2) |
| Beyond reading | no | **Gitea, Jupyter, Node-RED/MQTT, maps 3D, PBX** | LMS | Morse, phrasebook, RepeaterBook | AP, maps | Supply Depot (9 apps), Meshtastic Web, FDA drug ref | same | no | no | no | **git mirrors, toolchains, models, field data, training, automation bundles; calculators; human gates** |
| Physical world / training | — | MQTT | — | — | — | — | — | — | — | — | **inventory, datasets (orthomosaic, LiDAR, sensors), training methods, energy estimates** |
| Languages | 100+ | any | EN/ES/FR editions | EN + download | EN UI | **EN UI only** | EN | EN | EN (+ SV) | EN, DE, ES, IT, ZH, AR… | EN source, FR generated (D22) |

## What Arche has more of

**A server, not a box.** Every competitor is a destination: you go to its web page. Arche is
an MCP server that any offline client — Jan, Open WebUI, OpenCode, an agent — plugs into. NOMAD,
the leader, has no MCP; only wikilite and three tiny ZIM servers do. This is the difference
between "a place to read" and "a base a model works from".

**Hundreds of corpora, not one.** Every pre-built index is Wikipedia. Nobody publishes ready
search shards for WikiMed, Hesperian, iFixit, Appropedia, Low-tech Lab, Open Source Ecology,
FAO, Sphere, poison centres, PhET, Stack Exchange — the corpora an autonomist actually needs.
`catalog/index-plan.yaml` lists 120 of them. That space is empty.

**Model-agnostic shards.** txtai bakes in e5-base, wikilite Qwen3, Cohere its own model,
tylercosgrove Qwen3-4B at 2 560 dims (104 GB). If your laptop cannot run that embedder, the
index is useless. Arche's format (ADR 0014, ticket M1-1) keeps the chunk text and adds one
vector table per model: download the one you can run, or compute it yourself (`arche index
embed`, M1-4). Nobody offers "same chunks, several models".

**Hybrid in one file, with provenance.** txtai has no keyword index; the Cohere and Upstash
dumps have no text index; ZIM servers have no vectors. One SQLite with FTS5 and int8 vectors
gives BM25 + dense + RRF with zero services, and a `meta` table that says dump date, licence,
chunker, model, dims — the exact documentation gap seen in burgerbee (no content description),
wikilite (no dims, no dump date) and Cohere (no licence field).

**Beyond reading — the uncontested ground.** Only IIAB hosts infrastructure (Gitea, Jupyter,
Node-RED/MQTT); NOMAD has a Supply Depot of nine apps. Nobody covers git mirrors of the tools
you need to rebuild, offline pip/npm/apt caches, CAD and EDA toolchains, local models by RAM
tier, drone/LiDAR/satellite datasets, sensor logs, training methods without NVIDIA, or energy
per computation. Arche's catalogue already has 317 resources and 24 bundles there, and the
`inventory` (ADR 0010) is the only "with what I have" entry point in the field.

**Time and energy, adapted to the machine.** No competitor estimates how long a workflow
takes or how many watt-hours it costs on *your* hardware; NOMAD's answer is a hardware tier
list ($150 → $1 000+) and a benchmark score. Arche's `estimate_pipeline` answers "1 h 27 and
65 Wh on this 8 GB laptop" — which is what an off-grid user needs to decide.

**No redistribution, latest stable from upstream, signed.** NOMAD and PrepperPi share the
"download, never ship" principle; PrepperDisk ships ZIMs and licensed exclusives on an
activation-locked SD card. Nobody signs a catalogue; PrepperPi alone signs its images. Arche's
plan (M2: minisign catalogue, mandatory sha256, no automerge of URLs) is ahead of the field on
paper — and only on paper until M2 is done.

**Human gates as data.** The three sensitive subjects, the load-bearing beam, the motor on the
steering wheel: nobody else encodes what the model must not decide. civilization_node ships an
uncensored model with a prompt; NOMAD's docs say the AI "can produce false or misleading
answers". Arche's rules resource and `detectRedFlags` are a real differentiator for medical
and safety questions — provided M4-1 makes the knowledge files sourced.

## What Arche has less of

**Users.** Zero, against 36 400 stars for NOMAD, 10 M+ for Kiwix, 5 000 units for
PrepperDisk. NOMAD gained 10 000 stars in one week in March 2026: the demand exists, the
audience is there, and it speaks English.

**An appliance experience.** Plug in, join the Wi-Fi, browse — Kiwix Hotspot, PrepperDisk,
PrepperPi (captive portal), NOMAD (one-line installer, GPU detection, Command Center) all have
it. Arche is a CLI and a wizard, by choice (ADR 0008, no daemon); it is still less.

**Maps.** NOMAD serves regional PMTiles with MapLibre and `pmtiles extract`; PrepperPi
extracts a country from the daily planet over HTTP range requests; IIAB has OSM with 3D
terrain and satellite tiles. Arche catalogues map software and datasets but has no map
pipeline of its own.

**A fast vector index at scale.** txtai uses Faiss IVF + SQ8 and answers in milliseconds over
6.5 M vectors. A brute-force scan over int8 blobs in SQLite will not hold past one or two
million chunks: Wikipedia FR (4.5 M) needs an ANN sidecar (sqlite-vec, or an IVF file next
to the DB). M1-9 must say so.

**Published quality numbers.** NeuML publishes an NDCG@10 table justifying its model choice
(e5-base 0.70 vs bge-base 0.63); Cohere publishes the loss of int8 and binary tiers ("99.7–100 %
of quality, 4× / 32× smaller"). Arche has no `arche eval` yet (M1-7); until then "it works" is
an opinion — the audit said so.

**Tiers and packs people understand.** Kiwix Hotspot sells "Preppers Premium / Medical /
Computer Science" bundles; PrepperPi has Starter ~5 GB / Medical ~1 GB / Education ~16 GB /
Complete ~130 GB; NOMAD has Essential / Standard / Comprehensive; txtai ships a 238 MB "slim"
tier with a semantic graph. Arche has bundles and profiles, but no named, sized ladder a
newcomer can pick from in ten seconds.

**A benchmark score.** NOMAD's single number with a public leaderboard, and Personal Codex
"benchmarking every unit before shipping", are simple and effective. `arche compute bench` has
been an open item for weeks.

**Simple mode for small models.** openzim-mcp exposes a single `zim_query` tool because
"models ≤ 13B benefit from Simple mode". Arche exposes 21 tools; a 4B model will fumble them.

**Language.** The whole field is English-first. Arche was French-first; D22 fixes the
source language, M3-5 makes the rest follow.

## The risk to watch

NOMAD has an open RFC (#883) to ingest ZIMs into its RAG. The day it ships "chat with your
Wikipedia" by default, that feature stops being a differentiator for anyone. Arche's moat is
not "chat with Wikipedia"; it is breadth of corpora, model-agnostic shards, provenance, and
everything beyond reading. Build there.

## What to add — proposals, each as a ticket

1. **Distribute through them, not against them.** Package `arche mcp` + shards as a NOMAD
   Supply Depot app (Docker image, since that is their format — not our recommended path, but
   their door) and as an IIAB role. NOMAD's 36 k users are the audience; Kiwix's ZIMs are the
   substrate; Arche adds the layer none of them has. Ticket **M4-12**.
2. **Named, sized packs.** "Field first aid — 1.2 GB", "Grow — 4 GB", "Build — 9 GB",
   "Rebuild the stack — 60 GB", each a profile + lock manifest with a stated energy and RAM
   floor. The Self-reliant Edition (D20) becomes one rung of that ladder. Fold into **M4-8**.
3. **Offline maps.** A `maps` bundle and a PMTiles regional extract recipe (Protomaps daily
   planet, `pmtiles extract` over range requests, MapLibre viewer), catalogued like everything
   else, with the field-data kinds already in the inventory. Ticket **M4-11**.
4. **ANN sidecar above ~1 M chunks.** sqlite-vec or an IVF file beside the SQLite, chosen by
   `arche eval`, transparent to the format. Add to **M1-9**.
5. **Simple mode.** One MCP tool, `arche_ask`, that routes, searches, and returns a short cited
   context — for ≤ 13 B models; the 21 tools stay for agents. Ticket **M1-11**.
6. **Benchmark score.** `arche compute bench`: a number, a public table in the docs, and the
   estimator calibrated on it. Ticket **M4-13**.
7. **Metadata columns that help small models.** Pageview percentile and domain labels on
   Wikipedia shards (NeuML's trick), two-stage retrieval lead paragraph → full article
   (OfflineWikipediaTextApi's trick). Add to **M1-1** and **M1-3**.
8. **Torrents as a mirror.** Internet Archive generates a torrent for every item; Kiwix
   recommends torrents for integrity. Candidate for **D23**, at no cost.
9. **Talk to Kiwix/openZIM.** They have no vector index and no official AI stance; a
   ZIM → SQLite converter (our `extract.ts`) and published lexical shards are a contribution
   they might list. Not a ticket — a message to send once M4-3 has twenty shards to show.

## Sources

Project NOMAD: [repository](https://github.com/Crosstalk-Solutions/project-nomad), [FAQ](https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/main/FAQ.md), [releases](https://github.com/Crosstalk-Solutions/project-nomad/releases), [RFC #883](https://github.com/Crosstalk-Solutions/project-nomad/issues/883), [site](https://www.projectnomad.us/), [write-up](https://andrew.ooo/posts/project-nomad-offline-survival-computer/), [Cybernews](https://cybernews.com/security/apocalypse-ready-knowledge-server-project-nomad/).
Personal Codex: [site](https://personal-codex.com/), [NOMAD alternatives](https://personal-codex.com/project-nomad-alternatives/), [PrepperDisk alternative](https://personal-codex.com/prepper-disk-alternative/).
PrepperDisk: [site](https://www.prepperdisk.com/), [comparison chart](https://www.prepperdisk.com/pages/comparison-chart), [FAQ](https://www.prepperdisk.com/pages/faq), [LowEndBox](https://lowendbox.com/blog/do-you-need-prepperdisk-the-off-the-grid-raspberry-pi-powered-reference-library/), [GearJunkie](https://gearjunkie.com/news/prepper-disk-brings-online-knowledge-off-grid), [Hacker News](https://news.ycombinator.com/item?id=43790409).
PrepperPi: [repository](https://github.com/jmarler/prepperpi), [release engineering](https://raw.githubusercontent.com/jmarler/prepperpi/main/docs/release-engineering.md), [bundles](https://github.com/jmarler/prepperpi-bundles).
civilization_node: [repository](https://github.com/emincb/civilization_node), [kiwix_tool.py](https://raw.githubusercontent.com/emincb/civilization_node/main/kiwix_tool.py).
Internet-in-a-Box: [site](https://internet-in-a-box.org), [repository](https://github.com/iiab/iiab), [8.3 release notes](https://github.com/iiab/iiab/wiki/IIAB-8.3-Release-Notes), [Wikipedia](https://en.wikipedia.org/wiki/Internet-in-a-Box).
RACHEL: [World Possible](https://worldpossible.org/rachel), [RACHEL 5](https://worldpossible.org/products/rachel-5-500), [content](https://rachel.worldpossible.org/content), [GitHub](https://github.com/worldpossible).
Kiwix: [Hotspot](https://get.kiwix.org/en/solutions/hotspots/kiwix-hotspot/), [site](https://kiwix.org/en/), [kiwix-serve](https://kiwix-tools.readthedocs.io/en/latest/kiwix-serve.html), [mirrors](https://mirrors.dotsrc.org/kiwix/), [llm-tools-kiwix](https://github.com/mozanunal/llm-tools-kiwix), [zim-llm](https://github.com/rouralberto/zim-llm).
Pre-built indexes: [NeuML/txtai-wikipedia](https://huggingface.co/NeuML/txtai-wikipedia), [txtai-wikipedia-slim](https://huggingface.co/NeuML/txtai-wikipedia-slim), [burgerbee/txtai-en-wikipedia](https://huggingface.co/burgerbee/txtai-en-wikipedia), [OfflineWikipediaTextApi](https://github.com/SomeOddCodeGuy/OfflineWikipediaTextApi), [tylercosgrove/wikipedia-embeddings](https://huggingface.co/datasets/tylercosgrove/wikipedia-embeddings), [Cohere multilingual v3](https://huggingface.co/datasets/Cohere/wikipedia-2023-11-embed-multilingual-v3), [Upstash bge-m3](https://huggingface.co/datasets/Upstash/wikipedia-2024-06-bge-m3), [EmergentMethods](https://huggingface.co/datasets/EmergentMethods/en_qdrant_wikipedia), [wikimedia/structured-wikipedia](https://huggingface.co/datasets/wikimedia/structured-wikipedia), [wikilite](https://github.com/eja/wikilite), [wikilite DBs](https://huggingface.co/datasets/eja/wikilite).
MCP over ZIM: [openzim-mcp](https://github.com/cameronrye/openzim-mcp), [kiwix-wiki-mcp-server](https://github.com/jeffreyrampineda/kiwix-wiki-mcp-server), [zim-mcp-server](https://github.com/zicojiao/zim-mcp-server), [wiki-local-mcp](https://github.com/robtacconelli/wiki-local-mcp).
