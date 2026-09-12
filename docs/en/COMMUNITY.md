# Community: how the catalog stays current without depending on one person

> Français : [COMMUNAUTE.md](../fr/COMMUNAUTE.md)

## The problem

A 110-resource catalog ages every week: moving URLs, renamed ZIMs, changed licenses, new models.
Robots (`catalog-update.yml`, `zim-build.yml`) do 80% of the mechanical work. The remaining 20% —
*should we add this, drop that, is this content reliable?* — needs humans, and must not depend on
a single one (bus factor, blind spot F1).

## Three circles, three trust levels

| Circle | Who | Can | How to join |
|---|---|---|---|
| **Users** | everyone | report a dead link, propose a resource, 👍 a proposal, test a release | nothing to do: a GitHub issue form |
| **Curators** | 5 to 15 people, one per domain (health, farming, energy, electronics, AI, education, legal, maps…) | review and approve catalog PRs in their domain; `CODEOWNERS` routes automatically | nominated by an existing curator after 3 accepted contributions, confirmed by a maintainer |
| **Maintainers** | 2 minimum (bus factor), 4 ideally | merge, cut releases, manage secrets, set rules | co-optation, a curators' vote |

No committee, no DAO, no token-weighted vote: a GitHub repo with written rules, like Debian, Home
Assistant or Kiwix. It has worked for thirty years.

## A contribution's flow

```
Issue "Propose a resource" (form: URL, license, why offline, profile)
   → auto label `proposal` + domain
   → user 👍 (signal, not decision)
   → a domain curator answers within 30 days: accept / refuse / ask for details
   → if accepted: PR (by proposer or curator) = one YAML entry, status: unverified
   → CI: schema, validate, links; robots: size, version
   → second-curator review for health/safety domains (four-eyes rule)
   → merge → the updater verifies it next week → status: active
```

A resource `missing` three weeks in a row is proposed for removal by the robot in its weekly PR; a
curator decides.

## What robots never merge

Robots propose, humans merge — **no workflow merges a PR**. The first version of this document
planned an automatic merge of "facts" (size, version, dated URL, hash) after seven days without
objection; the architecture audit (error 7) removed it (M2-3): a URL or a hash merged without a
human looking is exactly what an attacker wants, and a catalog that keeps itself alive is worthless
if it can poison itself.

- **Sensitive fields**: `source.*` (url, mirrors, torrent, magnet, ia_item…), `checksum.*`,
  `size_bytes`, `license.*`, `index.url` / `index.sha256` / `index.size_bytes` — everything that
  decides what is downloaded and from where. `scripts/catalog/sensitive-diff.ts` diffs them against
  the base branch; `catalog-review.yml` puts the **`catalog-sensitive`** label on any PR changing
  one, and `catalog-update.yml`, `zim-build.yml`, `index-build.yml` label their own PRs, with the
  table of fields at the top of the body.
- **Two-person review**: a `catalog-sensitive` PR waits for two humans (author + reviewer, or two
  reviewers for a robot PR). The reviewer opens the URL at the official source and cross-checks the
  hash. The exact rule is in [CONTRIBUTING.md](../../CONTRIBUTING.md).
- **The catalog stays alive another way**: the checkers run twice a week and update the PR;
  freshness ([FRESHNESS.md](FRESHNESS.md)) measures what has not been reviewed. A robot PR waiting
  a month is a signal to find a second curator, not a reason to merge it unseen.

## Editorial rules, written once

1. **Useful offline**: no disguised online service, no content that assumes a connection.
2. **Official source, or built by Arche on a legal basis** — never pirate re-hosting.
3. **Honest license**: `unclear` beats an invented `allowed`.
4. **Health and safety = reference sources only** (`reliability: reference`), two reviewers.
5. **Bilingual**: `name` and `description` in FR and EN, or CI refuses.
6. **Small and safe before big and doubtful**: a reliable 200 MB resource comes before an unverified 100 GB ZIM.
7. **No weapons, no explosives, no security bypass**: the project's line, non-negotiable.

## Arche points

The community isn't only on GitHub. An **Arche point** is a physical place (fablab, library,
association, farm, school) that:

- keeps an up-to-date disk (monthly `arche download`) and **duplicates** it for whoever comes with an empty one;
- runs a Pi that **seeds** the torrents and serves the LAN (see DISTRIBUTION.md);
- keeps a **logbook**: what was useful, what is missing → feeds proposals.

The repo lists volunteer Arche points in `docs/points-arche.md` (town, place, contact, hours), no
obligation. It is also the answer to blind spot A1 ("I didn't download before the outage").

## Tooling in the repo

- `.github/ISSUE_TEMPLATE/`: *Propose a resource*, *Report a dead link*, *Request a ZIM* (site
  without a ZIM → recipe + permission request), *Become an Arche point*.
- `.github/CODEOWNERS`: routes PRs per catalog file to the domain's curators.
- `catalog-review.yml`: the `catalog-sensitive` label (above); nothing merges.
- `docs/GOVERNANCE.md` (to write together): how we decide, how we part ways, who holds the keys
  (IA secrets, minisign key), a one-page succession protocol.

## What I don't recommend

- **A token or a DAO** to govern: it turns a human-trust problem (who reviews a medical sheet?)
  into a treasury problem, and excludes precisely the contributors we want (nurses, farmers, teachers).
- **A write-open wiki** for the catalog: CI-validated YAML + reviewed PRs is slower, but it is what
  makes the health sheet trustworthy.
- **Waiting for a community before writing rules**: the rules above are the minimum; writing them
  before conflicts arrive is what prevents them.
