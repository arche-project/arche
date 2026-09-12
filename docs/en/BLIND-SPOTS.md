# Blind spots — what Arche doesn't do (yet)

> Frank critique, not validation. Criticality: **C1** = defeats the project in its main use case ·
> **C2** = large loss of value · **C3** = to do, not urgent. Each point has a concrete proposal.
> Français : [ANGLES-MORTS.md](../fr/ANGLES-MORTS.md)

## A. Flaws in the model itself

### A1 · The user didn't download before the outage — C1
*The* likely scenario: people care when it cuts. Arche can do nothing for them. The only lever is
**social**: prepared disks must exist *around* them.
**Proposal:** (1) make the USB bundle (`arche export`) first-class: a "Prepare a disk for someone
else" page in the beginner guide and a "disk to give away" preset (FR + EN nopic + health + 4B AI,
150 GB); (2) encourage "Arche points" (fablabs, public libraries, associations) that keep a disk
current and duplicate it — documenting disk-to-disk copy matters more than downloading;
(3) LAN/mesh: `arche serve --bind 0.0.0.0` on a Pi covers a building. → Addressed in [COMMUNITY.md](COMMUNITY.md) (Arche points) and [DISTRIBUTION.md](DISTRIBUTION.md) (torrent, mDNS).

### A2 · Kiwix is a single point of failure — C1
90% of resources depend on download.kiwix.org, the OPDS and the ZIM format. If Kiwix (a small Swiss
non-profit) disappears, the catalog dies with it.
**Proposal:** (1) `source.mirrors` is in the schema: fill it with the official mirrors
(mirrorservice.org, dumps.wikimedia.org, mirror.download.kiwix.org) and run the updater across
them; (2) reference the raw **Wikimedia dumps** (`*-pages-articles.xml.bz2`) as plan B, with a
minimal reader; (3) mirror the **libzim/kiwix-tools** and **Zimit** sources in `git-mirrors.yaml`
(only binaries today) — without sources, no reader in ten years (see A3).

### A3 · Reading a ZIM in 2036 — C2
ZIM is open and documented, but its reader is a binary linked to libzim/Xapian/zstd. An old binary
on a new OS may not run.
**Proposal:** (1) mirror the **sources** of libzim, kiwix-tools, kiwix-desktop, zim-tools and their
deps (zstd, xapian, icu) + the format spec into `library/git/`; (2) add a kiwix-desktop
**AppImage** and a static `kiwix-serve` for 3 architectures; (3) keep a **flat HTML export**
(`zim-tools zimdump`) of the 10 essential ZIMs, readable by any browser — 3× bigger but
indestructible; (4) a printable sheet "How to read these files again" with the format's principle.

### A4 · Hardware failure — C1
One SSD = zero redundancy. SSDs have limited unpowered data retention (a few years, less in heat);
USB sticks worse.
**Proposal:** (1) the wizard explicitly proposes **two disks** (the second via `arche export`) and
a reminder to **refresh** (recopy) every 2–3 years; (2) scheduled `arche verify` (cron) with an
alert on corruption; (3) PAR2 parity for essential ZIMs: `par2create -r10` repairs 10% corruption —
integrate as `redundancy: par2`; (4) prefer an HDD for cold archive (better retention) and the SSD
for use; (5) the reading electronics themselves: a **spare Pi** in an antistatic bag, and the paper
profile.

### A5 · Local AI is fragile and misleading — C2
A 4B hallucinates doses. Models change license. Ollama is a fast-moving binary.
**Proposal:** (1) the citation-mandatory RAG design of [ai-assistant.md](ai-assistant.md);
(2) mirror **llama.cpp sources** + one raw GGUF per tier (started: `hf-qwen3-8b-gguf`) to not depend
on Ollama; (3) a smoke test shipped with the library: 20 questions with expected answers (health,
water) so the user measures *their* model's reliability; (4) a permanent "can be wrong — check the
source" marker in the UI.

### A6 · Electricity — C1 (out of scope, but conditions everything)
None of this works without power. The project covers *knowledge* about energy, not the solution.
**Proposal:** a printable sheet "Run Arche on 20 W": Pi 5 + SSD ≈ 8–10 W; a 100 W panel + 50 Ah
LiFePO4 battery is enough; shopping list with orders of magnitude and calculation references
(Energypedia). And the "old laptop" profile: a laptop battery is a free UPS.

## B. Missing knowledge domains

| Domain | Crit. | Gap | Concrete proposal |
|---|---|---|---|
| **Legal / administrative** | C2 | Légifrance and Service-Public are in the brief but **absent from the catalog**: no ZIM; Etalab license fine but volume and structure hard. | Targeted Zimit on service-public.fr (practical sheets); Légifrance: DILA dumps (Etalab, XML) — too raw for beginners, expert only. A "everyday law" ZIM (Wikipedia FR law category) as immediate substitute. |
| **Children's education** | C2 | Vikidia and PhET are thin. No textbooks, no reading method, no curriculum. | **Sésamath** textbooks (maths, CC BY-SA, PDF), **Wikiversity FR**, Khan Academy FR (94 GB, 2023), public-domain reading material (Gutenberg FR). Document a "minimum curriculum" per age. |
| **Languages** | C3 | Wiktionaries translate word by word, no method. | Wikibooks language manuals, **Tatoeba** (sentences, CC BY). |
| **Psychology, grief, stress, traumatised children** | C2 | Nothing. Yet this is what breaks groups in a crisis. | WHO **Psychological First Aid** guide (free, FR), *Where There Is No Psychiatrist* (Hesperian), IASC sheets. Add the `society` category. |
| **Veterinary / livestock** | C2 | The brief says "livestock" but nothing veterinary. | *Where There Is No Vet* (Practical Action), FAO livestock manuals (CC BY-NC-SA, FR available). |
| **Metallurgy, blacksmithing, mechanics** | C3 | Survivor Library (235 GB, 19th-century English) is the only source. | Targeted extracts: Open Source Ecology, Wikipedia + Engineering StackExchange, a "minimal forge" sheet. |
| **Textile, leather, soap, hygiene** | C3 | Absent. | Wikibooks, Wikipedia, Appropedia cover part; reference key articles in the printable sheets rather than new sources. |
| **Hygiene, sanitation, latrines** | C1 | Covered by Sphere and zimgit, but **not foregrounded**: the first cause of post-disaster deaths (diarrhoea). | Dedicated printable sheet + latrines; promote `pdf-sanitation-sphere-handbook` to `essential`. |
| **Group management, decisions, conflicts** | C2 | Nothing. | Sphere (organisation), shared-governance guides (sociocracy — free sources are rare), FEMA *CERT* (public domain, EN). A dedicated docs chapter rather than a single source. |
| **Wild food, plants, mushrooms** | C2 | No reliable identification key. Mistakes kill. | Wikipedia + Commons are not enough; recommend **buying** a regional paper guide (low-tech guide). Never let the AI identify a mushroom. |
| **Physical security, defence** | C3 | Deliberately absent. | Hold the line: point to *Ready.gov*/FEMA for preparedness, no more. The project would lose institutional partners otherwise (D10). |
| **Contraception, pregnancy, childbirth** | C1 | WikiMed mentions it, but no practical manual. | *A Book for Midwives* and *Where Women Have No Doctor* (Hesperian, partly in FR). |

## C. Non-technical blind spots

### C1 · Transmission without electricity — C2
A disk teaches nobody. Knowledge passes through people.
**Proposal:** a `docs/practice/` folder: monthly drills, "one skill a month", paper logbook, and a
"who knows what" protocol for a group of 10 (printable skills matrix). Little code, much value.

### C2 · Social organisation — C2
The project is designed for *one* household. A building, a village, a school need shared access,
control over who changes what, training.
**Proposal:** document the "Arche point" deployment (Pi + Wi-Fi + notice board) and look at what
IIAB does well (accounts, Moodle, Kolibri) before reinventing.

### C3 · The beginner doesn't know what they don't know — C2
Three questions is good; but nothing tells them *what they should have* nor trains them.
**Proposal:** a post-install **checklist** in the UI: "Tested cut off? A second disk? Printed the 5
sheets? Who else can use it?". Lightly gamified (5 boxes).

## D. Content bias

### D1 · English > French — C2
The best technical content (StackExchange, Appropedia, Energypedia, WikEM, MDWiki, zimgit) is in
English; 60% of catalog entries are EN. A beginner who doesn't read English loses half the value.
**Proposal:** (1) the local AI as **translator** of the library (use 2 in ai-assistant.md) is the
most scalable answer; (2) prioritise the rare quality FR sources (Low-tech Lab, Sésamath, Hesperian
FR, FAO FR); (3) a **"practical selection" Wikipedia FR** ZIM (health, farming, energy, building)
built with `mwoffliner` from a category list — 5 GB instead of 52.

### D2 · Cultural and geographic bias — C3
Ready.gov, FEMA, CDC, MedlinePlus: US context (emergency numbers, units, drugs, plants). Appropedia:
Global South. Little for a temperate European climate, a vegetable garden near Paris, a winter
without heating.
**Proposal:** a `region` field in the catalog (schema addition) and **localised** printable sheets
(FR emergency numbers, Île-de-France sowing seasons, local plants) — the sheets are ours, not the sources'.

### D3 · Variable reliability — C2
Survivor Library mixes 1890 manuals with dangerous medical advice. StackExchange has well-voted wrong
answers. WikiHow is SEO content.
**Proposal:** the `reliability` field exists; show it in the UI (badge) and in the AI prompt
("community source, verify"). For health, admit only `reliability: reference`.

### D4 · Frozen currency — C3
A ZIM is dated. Regulation, drugs, AI models move on. State "library frozen on DD/MM/YYYY" clearly on
the home page (`state.json` knows).

## E. Legal and license risks

| Source | License | Risk | What we do |
|---|---|---|---|
| Wikipedia, Wiktionary, StackExchange, Appropedia | CC BY-SA | low: free use and copy with attribution | `redistribution: attribution` |
| iFixit, WikiHow, Khan Academy, Low-tech Lab, Low-tech Magazine, Sphere | CC BY-**NC**-SA | **medium**: no commercial redistribution; a non-profit "Arche point" is fine, a company selling prepared disks is not | `redistribution: allowed-nc`; warn in expert UI and in the "prepare a disk for someone" guide |
| Hesperian | Open Copyright (NC) | low if non-commercial | same |
| Gemma, Llama | proprietary "open" licenses | medium: use clauses, country/use restrictions (check EU clauses for Llama 4; Llama 3.1 is fine) | prefer Qwen (Apache-2.0) as default — already the case |
| Survivor Library | public domain scans, non-free site | low on content, uncertain on the ZIM | `reliability: unknown`, optional |
| zimgit-* | mixed (NGOs, governments) | uncertain | `redistribution: unclear`; never redistribute ourselves |
| OSM maps | ODbL | low; attribution + share-alike on derived *data* | attribution |
| Local AI output | — | **liability**: wrong medical advice. A disclaimer isn't legally sufficient but is necessary | permanent banner + mandatory citation + no dose advice without a source |
| The project itself (orchestrator) | MIT | low: we redistribute nothing. Careful the day we host (DECISIONS D3) | explicit "hosts only what it produces" rule |

Specific point: the brief mentioned "mirroring" **Instructables and Hackaday**. Instructables is
proprietary (Autodesk): a private ZIM is tolerated, redistribution is not. Hackaday articles are
© Supplyframe. Neither is in the catalog, on purpose.

## F. Sustainability of the project itself

### F1 · Bus factor = 1 — C1
One maintainer, one GitHub account, one key. If Florian stops, the update workflow runs a few months
then everything rots (dead URLs, never-merged PRs).
**Proposal:** (1) a dedicated GitHub org with 2 owners from day one; (2) `catalog-update`
**auto-merges** PRs that only change `size_bytes`/`version`/`url` (not `status`) after 7 days
without objection — *removed by M2-3 (audit, error 7): a URL or a hash never merges without a human;
`catalog-sensitive` label, two-person review*; (3) "everything is in the repo" (no server, no
DB) is already true: a fork suffices to take over; (4) a one-page "succession protocol".

### F2 · Funding — C2
Donations ≠ income. Costs are low (free CI for public repos) but curation time is real.
**Proposal:** aim at **commons** funding (NLnet/NGI, Wikimédia France, municipal "digital
inclusion" calls) — which presupposes D10's tone and a legal structure. Individual donations as a complement.

### F3 · Scope creep — C2
The brief covers everything: robotics, ROS, ArduPilot, KiCad, Klipper… Each domain is a curation
job of its own. The catalog already has 93 entries, 80% `unverified`.
**Proposal:** a **deliberately small** v0.1: `core` + `health` + `ai` verified 100% (URLs,
checksums, real download tests in CI once a month), the rest labelled "community, unverified".
Better 15 resources that work than 93 we're unsure of.

### F4 · GitHub dependency — C3
Actions, releases, auto PRs: all at Microsoft. If GitHub closes the account or changes rules, no
more updates.
**Proposal:** mirror the repo on Codeberg (Forgejo) with `git push --mirror` in the workflow; the
updater is plain TypeScript runnable anywhere (`npm run catalog:update`).

### F5 · The catalog ages faster than the code — C2
Kiwix identifiers change (`wikipedia_fr_all_maxi` is stable, but ZIMs get renamed, merged,
abandoned — WikiHow proves it, and freeCodeCamp went from several GB to 7 MB).
**Proposal:** in place already: `status: missing`, "size drop" alert. To add: a **quarantine** rule
(a resource `missing` 3 weeks in a row is proposed for removal in the PR) and a generated
**catalog changelog** (`catalog/CHANGELOG.md`).

## Summary — the five things to do first

1. **A1 + A4**: make the duplicated disk and the "Arche point" the main path, not an annex; two
   disks by default in the wizard.
2. **F3**: shrink v0.1 to `core + health + ai`, 100% verified, with a monthly real-download CI test.
3. **A2 + A3**: mirror Kiwix/libzim/Zimit sources and a standalone reader; multiple mirrors in the catalog.
4. **B (health)**: childbirth, psychology, sanitation, veterinary — four catalog additions and two
   printable sheets. That's where the project saves lives, not in ROS.
5. **F1**: two owners, Codeberg mirror (the auto-merge of benign PRs was removed, M2-3). One afternoon of work.
