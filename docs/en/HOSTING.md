# Hosting: the ZIMs Arche builds and publishes

> Français : [HEBERGEMENT.md](../fr/HEBERGEMENT.md) · Decision: [ADR 0005](../adr/0005-arche-hosted-zims.md)

## The principle, updated

Arche **never** redistributes a file produced by someone else (Kiwix ZIMs, models, binaries come
from their publisher). But for sources that have no ZIM — Low-tech Lab, Open Source Ecology,
RepRap, e-NABLE… — Arche **builds** the ZIM itself from the website and hosts it, **if and only if
the source's license allows it or its author gave written permission**. The end user never crawls
anything: they tick, they download.

Nothing passes through the maintainer's machine: the build runs in GitHub Actions and the file goes
straight to Internet Archive.

## Why Internet Archive

Free, no size limit, durable (a 30-year-old non-profit), already hosting hundreds of Kiwix ZIMs, and
it automatically generates a **.torrent** per item, which gives peer-to-peer distribution for free
(see [DISTRIBUTION.md](DISTRIBUTION.md)). GitHub Releases (2 GB per file max) and Cloudflare R2
(paid, no egress fees) are the fallbacks, listed in `source.mirrors`.

## The pipeline

```
catalog/zim-recipes.yaml ──► zim-build.yml (GitHub Actions, monthly or on demand)
        │                          │
        │  permission ∈ {license, written} ? otherwise REFUSED
        │                          ▼
        │                 scripts/zim/build.sh  ── mwoffliner (MediaWiki) / zimit (any site) / zimwriterfs (folder)
        │                          ▼
        │                 zimcheck + zimdump info (sanity check)
        │                          ▼
        │                 scripts/zim/upload-ia.sh  ── archive.org/download/<ia_item>/<name>_<YYYY-MM>.zim (+ .sha256, + auto torrent)
        │                          ▼
        └────────────► scripts/zim/update-catalog.ts ── PR "zim: <recipe>": URL, size, sha256, version, built_from
```

A recipe is one YAML block: tool, URL, language, name, license, **`permission`**, schedule
(`monthly` / `quarterly` / `yearly`), IA item id, options. `permission` is the lock: `license`
(the license alone suffices), `written` (agreement archived in `docs/permissions/`), `pending`
(asked), `none` (forbidden). The workflow refuses anything but `license` or `written`.

On the catalog side the resource becomes `source.kind: arche-hosted` with `built_from` (origin
site, tool, recipe, date, legal basis): the user always sees where content comes from.

## Who may publish what

| Source license | Can we publish? | Examples |
|---|---|---|
| CC BY, CC BY-SA, CC0, public domain, GFDL | **Yes**, with attribution (in ZIM and IA metadata) | Open Source Ecology, RepRap, Appropedia, Sésamath, Wikibooks |
| CC BY-NC / BY-NC-SA | **Ask**: a free, ad-free project is "non-commercial" for most authors, not all | Low-tech Lab, InMoov, iFixit, Khan Academy |
| No license, mixed, or © site | **No** without written permission | Farm Hack, e-NABLE (per design), Instructables, Hackaday, WikiHow |
| Medical content | Publish reference sources only (`reliability: reference`) | Hesperian (NC, ask), WHO, IFRC |

## Asking for permission — template email

> Subject: Permission to publish an offline (ZIM) copy of <site>
>
> Hello,
> I maintain Arche (<repo url>), a free (MIT) project that lets anyone build an offline library for
> places without a network. Your content is among the most useful we know for <domain>.
> We would like to publish an offline copy of <site> in ZIM format (the Kiwix / offline Wikipedia
> format), rebuilt <quarterly> from your site, hosted on Internet Archive, with full attribution, a
> link to your site on the home page, no content changes and no commercial use. You could ask for
> its removal at any time.
> Your <CC BY-NC-SA> license leaves this case ambiguous: could you give us written permission, or
> set conditions?
> Thank you for your work.

Archive the reply in `docs/permissions/<recipe>.md` (template provided), then set the recipe to
`permission: written`.

## Limits and fallbacks

- GitHub Actions: 6 h and ~14 GB per job. Enough for wikis of a few GB; beyond that (Khan Academy,
  large forums) a **self-hosted runner** on a €5/month VPS does the same job — only `runs-on` changes.
- Internet Archive throttles per item; for files > 10 GB prefer the torrent as default transport
  (`arche download` will, once the built-in BitTorrent client exists — see DISTRIBUTION.md).
- A site may forbid robots (`robots.txt`): Zimit honours it; mwoffliner uses the API and is not
  affected. A robot-hostile site is a signal to ask first.
- Asking **Kiwix** first (`openzim/zim-requests`) remains the best option whenever possible:
  hosting, updates and legality handled by them, and the resource lands in the OPDS, hence in Arche,
  with no change.

## What changes for the user

Nothing. An `arche-hosted` resource downloads like a Kiwix one, with resume and sha256 check. In
expert mode the card shows "built by Arche from <site> on <date>, legal basis: <license | written permission>".
