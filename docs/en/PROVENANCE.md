# Provenance or nothing — `knowledge/` says where every number comes from

> The [architecture audit](../fr/AUDIT-ARCHITECTURE.md) (error 4): "the knowledge was written, not
> extracted — hundreds of figures drafted by an AI in a day, marked `verified: false`". That is the
> very mechanism the project exists to prevent, in YAML. Decision 2: **no line of `knowledge/`
> without a verifiable locator; `verified` computed, never declared.** This is the rule, the format
> and the command that enforces it (ticket M4-1). Français : [PROVENANCE.md](../fr/PROVENANCE.md)

## The rule

Every **numeric value** in `knowledge/*.yaml` carries `source: { resource, path, quote }` — a locator
to a corpus article plus the sentence that states the figure — or, during the grace period,
`unsourced: true`: explicit, counted, published in the README. Nothing else is accepted:
`npm run catalog:validate` and `tests/knowledge.test.ts` reject a bare value, and `verified` is
**never** hand-written — `arche knowledge verify` computes it by opening the installed shards.

## The format

```yaml
water:
  litres_per_person_day:
    sphere_minimum:
      value: 15
      source:
        resource: pdf-sanitation-sphere-handbook        # catalog id
        path: p12                                       # article in the shard (articles.path)
        quote: "minimum of 15 litres per person per day"  # ≥ 12 characters, verbatim
        where: "WASH, standard 2.1"                     # optional human hint
    frugal: { lo: 30, hi: 50, unsourced: true }         # grace period: explicit, counted

stores_kg_per_person_year:   # a block covers the numbers below it; a nearer declaration wins
  unsourced: true
  grain: 180
```

What the validator (`src/core/knowledge.ts`) enforces: a value is any number, bare or inside a
range object (`value`, `lo`, `hi`, `planning`); strings and booleans are not checked. Provenance is
declared on an object and covers every number beneath it, never at the file root. `source` needs
`resource` (a catalog id), `path` and a `quote` of at least 12 characters; free-text sources are
rejected. `unsourced` is exactly `true` and excludes `source`. A hand-written `verified` is rejected
anywhere. Root keys that are not facts are skipped: `version`, `updated`, `climate`, `uncertainty`,
`defaults`, `sources` (a reading list), `aliases`. Every top-level `knowledge/*.yaml` is scanned
except `eval.yaml` (its own schema and per-question locators, [EVAL.md](EVAL.md));
`knowledge/projects/` are recipes (ADR 0010), not facts.

## Writing a locator

Find the article with `search` or `arche eval` — passage ids are `resource/path#offset` locators
(ADR 0014); take `resource` and `path`. Copy the sentence verbatim from `read_article` (case, accents
and repeated whitespace are ignored at verification, nothing else). Replace `unsourced: true` with
the `source` block. If no corpus article states the figure, the value does not belong in
`knowledge/`: remove it (M4-2 lists which and why). A quote that resolves proves **where** the figure
comes from, not that it is right — the corpus answers for that, which is exactly the point.

## `arche knowledge verify`

```
$ arche knowledge verify [--library <dir>] [--json] [--write README.md]
```

For each distinct `source`, opens `<library>/index/<resource>.arche.sqlite`, rebuilds the article and
looks for the quote. States: `verified` (exit 0), `mismatch` — quote absent (exit 1), `no-article` —
path not in the shard (exit 1), `no-shard` — corpus not installed: counted, not a failure (exit 0).
A value without provenance is a structural problem: exit 1 here and in `catalog validate`. `--json`
prints the full report; `--write README.md` rewrites only the `<!-- knowledge -->` block (*N sourced
values / total*), and the test suite checks the README is not stale.

## Status

12 September 2026: **0 sourced values out of 445**, all under explicit grace — the audit's finding,
now measured and published rather than stated. M4-2 attaches `figures.yaml`, `crops.yaml` and
`compute.yaml` to their sources or removes the values; M4-4 (`knowledge/methods/`) is born under the
same rule.
