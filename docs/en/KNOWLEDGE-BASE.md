> **Update (ADR 0013)**: the indexing chain exists — `arche index build | add | fetch`, ZIM/PDF/EPUB extraction, resumable embedding, shards published by `index-build.yml` per `catalog/index-plan.yaml`. Your own documents enter through `arche index add`.

# The self-reliance knowledge base

> Arche is not a download catalogue with a chatbot bolted on. It is an **offline knowledge base
> queryable by a local AI**, whose catalogue is the corpus and whose graphical interface exists only
> to teach you to stop needing it.
> Français : [BASE-CONNAISSANCE.md](../fr/BASE-CONNAISSANCE.md) · Decision: [ADR 0007](../adr/0007-rag-local.md)

## Why the shift

A 1 250 GB library handed to someone with nobody to ask is a warehouse, not help. The 248 resources
answer no question; they wait for you to already know what to look for, in which language, under
which keyword. But the person we are building for types "how do I lift water from my well without
electricity", not "rope pump appropriate technology".

What we now build is the **index**: the thing that turns a pile of documents into someone you can ask
a question at two in the morning, with no network, and get an answer **sourced in the documents
already on your disk**.

Nothing else changes character. The catalogue stays the catalogue, the ZIMs stay ZIMs, and the
printable sheets stay the last resort when there is no electricity at all. The index sits on top.

## How it is built

### One index per resource, never a global one

Every indexable resource carries an `index` block in the catalogue: its **shard** URL, checksum,
embedding model and dimensionality. A shard downloads alone, verifies alone, updates alone. You fetch
a resource's index if and only if you have the resource.

This is not cosmetic. It lets the index be built **in the same CI pipeline that builds the ZIMs**, one
resource at a time, never exceeding GitHub Actions' limits and never running on anyone's personal
machine. An updated resource re-indexes only itself. And someone who chose 40 GB does not download the
index of the 1 200 GB they do not have.

### The index does not hold the text

An indexed chunk is not an excerpt, it is a **locator**: resource id, article path, byte offset,
length — plus its vector, quantised to 8-bit integers. The text stays where it already is, inside the
ZIM, already compressed. That is what keeps the index small instead of doubling the corpus, and it is
also what guarantees a citation always points at the real document, never at a copy that could have
drifted.

### Hybrid retrieval, because dense alone lies

The corpus is full of what a small embedding model handles badly: Latin binomials
(*Amanita phalloides*), standards references, part codes (SO-101), units (kWp, stère, mm/year).
Semantic search pulls them towards plausible neighbours; lexical search finds them exactly.

So we run both and fuse them with **reciprocal rank fusion** — a method that never compares scores,
only ranks, and therefore has no tuning knob to go stale. Kiwix ZIMs already ship a full-text index,
so we query it instead of rebuilding one.

A final filter caps how many passages come from any single resource: on a self-reliance question, an
answer built on one source is almost always worse than one that crosses three.

### The embedding model is a commitment

An index is bound to the model that produced it. Mixing two models raises no error — it produces
silently wrong scores. So the reader **refuses** to fuse shards from different models rather than
guessing.

| Model | Dimensions | RAM | Use |
|---|---|---|---|
| **bge-m3** | 1024 | ~2.5 GB | Arche reference, strong in French |
| granite-embedding:278m | 768 | ~1.2 GB | middle ground, Apache-2.0 |
| multilingual-e5-small | 384 | ~0.5 GB | fallback: runs on a Raspberry Pi |

Everything goes through Ollama, which Arche already installs for generation. No new dependency enters
the project (ADR 0002): the chunker, the shard format, BM25 and the fusion are hand-written, and they
fit in four short files.

### And the files that are not text

The corpus is not only pages. There are STLs to print, SVGs to cut, DXFs, G-code, assembly photos,
PDFs. For someone who makes things, these are often the real answer: "here is the part", not just
"here is the page about it".

An STL has nothing to feed a language model. So it is found two ways. First by its **neighbourhood**:
every file is attached to the passage that links to it, located by its byte position in the article,
so the piston STL always surfaces with the paragraph that explains how to fit it — never one without
the other. Second by **what can be read from the file with no library at all**: a binary STL is an
84-byte header then 50 bytes per triangle, which yields dimensions, triangle count and volume; an SVG
is XML with a title, a description and visible text — dimensions, labels, part names. That becomes a
sentence, indexed like any other passage, French and English in the same string:

```
le piston (piston.stl) — fichier 3D imprimable / printable 3D model (STL).
Dimensions 45.0 × 45.0 × 22.0 mm, 2 340 triangles, volume ≈ 18.4 cm³.
```

That is the question people actually have in front of a file: *does it fit on my bed, and how much
filament?*

Images are found through their caption, alt text and surrounding paragraph — not their content. A
vision model would be an optional layer with its own shard, never a core dependency. Said plainly:
the assistant will find the rocket-stove diagram because the page says "rocket-stove diagram", not
because it has seen it.

## Numbers never go through the model

This is where this project parts ways with ordinary document assistants.

A local model asked "what size cistern for four people?" produces a plausible, wrong number. Since
self-reliance is **entirely** a sizing problem — litres per day, m² per person, cords per winter, kWp
in December, maize plants to let go to seed — an approximate answer is not a degraded answer, it is a
failed winter.

The orders of magnitude therefore live in `knowledge/figures.yaml`, a file anyone can read and
correct, and ten **deterministic calculators** use them: `eau_pluie`, `citerne`, `calories`,
`surface_nourriciere`, `graisses`, `bois_chauffage`, `solaire`, `poules_grain`, `semences_effectif`,
`stock_un_an`. The model is only allowed to call them and explain the result.

Each calculator returns the full working — the arithmetic, the assumptions, the range, and the caveat
that goes with it. We never ask anyone to take a number on trust; we show the sum.

And the figure itself says where it comes from (M4-1, [PROVENANCE.md](PROVENANCE.md)): every value
in `figures.yaml`, `crops.yaml` and `compute.yaml` carries `source: { resource, path, quote }` — a
locator to a corpus article and the sentence that states the number — or, during the grace period,
an explicit `unsourced: true`, counted and published in the README (445 of 445 on 12 September 2026:
the knowledge was written, not extracted, and now that is measured). `verified` is never
hand-written: `arche knowledge verify` establishes it by opening the installed shards, and
`catalog validate` rejects a value without provenance.

## Three things the machine does not settle

The corpus covers mushroom identification, plant dosage and first aid. The model answering is a local
model of a few billion parameters. A hallucination here does not cost an inconvenience, it costs
someone.

The assistant therefore detects four situations and changes behaviour:

**Emergency.** A suspected ingestion, loss of consciousness, haemorrhage: it gives the emergency
number first, recalls the six-hour delay rule and the 12–24 h remission trap, and only then what the
sources say.

**Identification.** It **never** states that a species is edible. It gives the exclusion criteria,
says that identification apps are for ruling out and never for validating, and routes to a pharmacist
or a mycological society.

**Dosage.** It neither computes nor invents a dose. It quotes verbatim or says the corpus does not
give one, and always flags narrow margins — children, pregnancy, elderly, renal or hepatic
impairment.

**Diagnosis.** It describes what the source associates with the signs, lists the danger signs, and
says that telling two causes apart requires examination.

These rules are applied **before** everything else in the prompt, and one detail is worth telling:
they were silent for an hour. In JavaScript `\b` only knows ASCII, so `\bmangé\b` matches nothing —
the emergency guard fired on no French sentence containing an accented past participle. A test caught
it; it stayed in the suite with the comment explaining why. That is the worst failure mode available
here: a safeguard that looks like it exists.

One further rule does not depend on the model at all: **an answer citing no source when passages were
provided is rejected**, not displayed.

## What we measure

Without measurement, "the assistant works well" is an opinion. `knowledge/eval.yaml` fixes a set of
**60 real questions** — as people actually type them, typos included — each with the resources
that should surface, **where the answer is** (a `resource/path#offset` locator, ADR 0014, `pending`
until the shard is published), the **required words** of the answer, the calculator expected when
it is a sizing question, and the guardrail expected when it is a sensitive one. `arche eval` (M1-7)
measures recall — at least one expected resource among the top five passages —, guardrails raised
rightly, and the negatives. The set, its schema and what it has already found are described in
[EVAL.md](EVAL.md).

**Fifteen questions are negative**: outside the base — synthesising antibiotics or insulin,
weapons, explosives, drugs, hacking (black zone, see [GREY-AREAS](GREY-AREAS.md)), weather, prices,
news, personal or local data, online actions. The right answer is "I can't find this in the
library", and a plausible answer instead is a failure. **Twelve** raise an expected guardrail, and
the test checks that the rules really fire on those twelve — and on none of the other 48.

A badly sourced answer is a bug exactly like a dead link.

## What it changes for the user

The interface shows the answer **and the passages that produced it**, side by side, with a link to
open the article in Kiwix. The stated aim is for it to become unnecessary: for the person to learn
where knowledge lives and end up going straight to it. Success is measured by the share of people who
click through to the source, not by time spent in the interface.

And the day the electricity stops for good, the printable sheets are still there — they ask nothing
of anyone.

## What is left to do

The CI indexing pipeline (`index-build.yml`, modelled on `zim-build.yml`), text extraction from ZIMs,
the MCP server (since built, ADR 0011 — no `arche assist` command any more), the fallback that indexes shard-less resources on the
user's machine, and making the evaluation set a blocking CI job. The core — chunking, format,
retrieval, fusion, calculators, guardrails — is in place and tested.
