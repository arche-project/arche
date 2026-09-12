# Emergency rescue — sites that may disappear

> Priority order as of 11 September 2026. Français : [SAUVEGARDE-URGENTE.md](../fr/SAUVEGARDE-URGENTE.md)

| Priority | Site | Why urgent | Recipe | What we may do |
|---|---|---|---|---|
| **1** | **L'Atelier Paysan** — latelierpaysan.org/Outils-et-plans | cooperative **in liquidation since April 2026**; site still up, domain and hosting may stop any day | `atelierpaysan-fr` | CC BY-NC-SA: private copy **yes**, publishing **after written permission** |
| **2** | **Practical Plants** — practicalplants.org | **read-only since a 2022 server failure**, unmaintained; ~7,400 useful-plant pages | `practicalplants-en` | CC BY-NC-SA: same |
| 3 | Plants For A Future — pfaf.org | small living charity; CC BY text | `pfaf-en` | copy and publish **yes** (text only) |
| 4 | Farm Hack — farmhack.org | alive (June 2026 updates) but per-tool license | `farmhack-en` | private copy yes; publishing: ask |
| 5 | Solar Cooking wiki (Fandom) | Fandom is stable; license to confirm | `solarcooking-en` | private copy yes |

Everything on GitHub is not urgent: a `git clone --mirror` can wait. The urgency is **websites without a repo**, run by fragile organisations.

## Tonight, in order

1. **Run the rescue in CI** (10 minutes, nothing on your Mac): push the repo, then GitHub → Actions → `rescue` → Run workflow with `recipe = atelierpaysan-fr`. It crawls (up to 6 h), produces a wget mirror of the PDFs **and** a ZIM, and stores them as a **90-day artifact**. Repeat with `practicalplants-en`. No Internet Archive account needed. Once the IA account exists and permission is recorded, `scripts/zim/upload-ia.sh` publishes.
2. **Ask Internet Archive to save it too** (5 minutes): Wayback Machine *Save Page Now* (https://web.archive.org/save, tick *Save outlinks*, needs a free archive.org login), and report the site to **Archive Team** (https://wiki.archiveteam.org/index.php/Deathwatch or IRC `#archivebot` on hackint) with "cooperative in liquidation since April 2026".
3. **Send the permission request** (5 minutes): ready in `docs/permissions/atelierpaysan-fr.md`. For a company in liquidation write both to the cooperative's generic address and to the **liquidator** named in the BODACC notice — they hold the rights during the procedure. Offer to host an as-is copy on Internet Archive: that is what liquidators accept most easily.
4. **Optional local copy** on any machine with Docker: `scripts/rescue/rescue.sh atelierpaysan-fr /Volumes/SSD/rescue` (add `--pdf-only` for documents only, no Docker). Two copies, two disks; `sha256sum -c SHA256SUMS`.

## Catalog changes

Urgent recipes carry `schedule: asap` (built at every `zim-build.yml` run once permission is `written`); the resources carry the `urgent` tag and are checked weekly. The day the site dies the resource goes `missing`, and the Arche-hosted ZIM (once published) takes over via `source.kind: arche-hosted` — exactly the scenario this project exists for.
