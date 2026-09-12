# Freshness: the catalogue is only worth its date

> "Our work is only worth something if it is updated often." This document says how that sentence is
> made true, measurable, and impossible to let drift quietly.
> Français : [FRAICHEUR.md](../fr/FRAICHEUR.md)

## The problem

A catalogue of 260 resources pointing at eighteen-month-old versions is not "a bit old": it is wrong.
The ZIM changed URL, the release was pulled, the Ollama model was republished with different weights,
the ROS distribution reached end of life. And nobody notices, because a stale catalogue looks
exactly like a current one — until someone, offline, finds that what they downloaded matches nothing.

Three things are needed and none suffices alone: a clear **policy** for what "current" means,
**checkers** that apply it per ecosystem, and a **measurement** that fails loudly when they stop
running.

## "Latest" is not "latest stable"

This nuance decides everything. A project's newest version is often an `rc`, a `beta`, a `nightly`,
a `rolling`. Putting that on the disk of someone with no network to fix it is a mistake, not
boldness.

The policy is written once, in `src/core/versions.ts`, and shared by every checker — so none has its
own idea of "stable":

| `update.stability` | What is kept |
|---|---|
| **`stable`** (default) | the highest version without a prerelease marker — `rc`, `beta`, `alpha`, `dev`, `a1`/`b2` (PEP 440), `nightly`, `preview`, `rolling`, `testing`… |
| `lts` | the highest LTS where the ecosystem has the notion (Node, ROS 2, Ubuntu); otherwise falls back to `stable`, **flagged** |
| `any` | the highest, prereleases included — only for resources that explicitly ask for it |

Two cases raise a note in the PR instead of an automatic decision: a project that has **never**
shipped a final version (we return the highest prerelease and say so), and an LTS requested but not
found. The automation proposes; it never ships a beta on its own.

Comparison is numeric, not lexical: `1.10` comes after `1.9`, and a final version beats its own
`rc`. Obvious — and the most common bug in update scripts.

## One checker per ecosystem

| `update.tracker` | Reads | Does |
|---|---|---|
| `kiwix-opds` | the Kiwix OPDS catalogue | dated URL, size, ZIM version |
| `github-release` | `/releases/latest` (already excludes prereleases) | tag, date, asset size |
| `github-commit` | latest commit on the default branch | SHA, date; **archived** → `deprecated` |
| `ollama`, `huggingface` | the model registry | weights digest, size, sha256 |
| **`npm`** | `registry.npmjs.org` | `dist-tags.latest`, **verified** (some packages put rcs there), else highest stable |
| **`pypi`** | PyPI's JSON API | highest stable, yanked releases excluded |
| **`crates`** | crates.io | same, yanked excluded |
| **`dockerhub`** | the image's tags | numeric tags only — `latest`, `stable`, `edge` do not say what you download |
| **`rosdistro`** | `index-v4.yaml` from ros/rosdistro | is the tracked distribution still `active`? is a newer LTS out? |
| **`node-lts`** | `nodejs.org/dist/index.json` | the promoted LTS line, not "current" |
| **`debian`** | the `Release` file of `stable` | version and codename |
| **`ubuntu-lts`** | `meta-release-lts` | last still-supported LTS |
| **`raspios`** | the Raspberry Pi Imager list | URL, date and sha256 of the named image |
| **`github-tag`** | Git tags of a repo without releases | highest stable tag (OpenWrt…) |
| `http-head` | the source URL | presence, size; 403/429 are **not** disappearances |

The seven in bold are new and come with the development libraries
(`catalog/resources/dev-registries.yaml`): Node LTS, standalone Python, Rust, Verdaccio (offline
npm), devpi (offline PyPI), panamax (crates), Athens (Go), the Arduino index, the ROS 2 apt mirror of
the current LTS and its documentation as a ZIM, and two Docker images. A code repository without its
dependencies does not build; that is the gap they close.

ROS 2 deserves a word: its stable unit is not a number but a **distribution** (Humble, Jazzy…), and
`index-v4.yaml` does not mark which are LTS. So we keep an explicit, short, commented list
(`ROS2_LTS` in `scripts/catalog/registries-parse.ts`) rather than a naming heuristic. It will need an
entry when the next LTS ships in 2026; the checker says so itself if no active LTS is recognised.

## `checked`: the date that makes freshness measurable

Every resource now carries two dates not to be confused. `updated` is the upstream version's date —
the ZIM's, the release's, the weights'. `checked` is when **we** last verified upstream. A checker
sets `checked` only when upstream actually answered: a network error, an exhausted quota, a 403 are
not verifications.

That field, compared with `check_interval_days` (7 by default, 14–30 for quiet registries), gives the
measurement:

```
$ arche catalog freshness
Catalog freshness: 0% — 0/258 resources verified within their interval (0 stale, 258 never checked).
  http-head           0 / 79
  kiwix-opds          0 / 64
  github-release      0 / 58
  …
```

That zero is the true value today: the pipeline has never run. Which is exactly what we want visible
— a catalogue that *looks* current and one that *is* current differ by this number and nothing else.

## What fails when it drifts

The measurement is a gate, not a dashboard. Three places use it:

- **`catalog-update.yml`** now runs **twice a week** (Monday and Thursday). After running every
  checker it requires `catalog freshness --min 70`: if fewer than 70 % of tracked resources were
  verified, the workflow **fails**. An exhausted GitHub quota, a changed upstream format, a registry
  blocking the agent — none of it stays silent any more.
- **`ci.yml`** checks that the command works (`--min 0`) without blocking: the threshold only makes
  sense after the checkers.
- **`catalog-update.yml`** opens the PR and never merges it (M2-3, audit error 7). `checked`,
  `version`, `updated` are facts a reviewer skims; `source.url`, `checksum`, `size_bytes`, `license`,
  `index.*` are sensitive fields, listed at the top of the PR and labelled `catalog-sensitive` —
  two-person review ([CONTRIBUTING.md](../../CONTRIBUTING.md)). Notes such as
  `[updater …: no stable version]` or `[… end of life]` are decisions and wait for a human.

## What it does not do

Verifying is not downloading: catalogue freshness says our pointers are right, not that the user's
disk is. `arche verify` remains what compares the local library with the catalogue. And freshness
does not judge quality: a resource can be verified weekly and remain mediocre — that is the job of
[SELF-RELIANCE-GAPS](SELF-RELIANCE-GAPS.md).

Finally, the measurement assumes the repository lives on GitHub with its workflows enabled. Until it
does, `freshness` will stay at zero, and it will be right.
