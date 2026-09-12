# Visuals: harvest, don't draw — and measure

> "For a plant you need many views, sometimes cells under a microscope. Same for every technical
> discipline. That is a monstrous pile of visuals to gather and keep." Yes. This document says how
> that pile becomes finite, measurable and safe. Français : [VISUELS.md](../fr/VISUELS.md)

## The reversal

We will not *create* these visuals. Nobody can, and trying would be a mistake: a mushroom drawn for
the library is a worse image than a field photograph, and a *generated* image is a danger. What we
do is **harvest** from the free image reserves that already exist — and they are immense.

**Wikimedia Commons** holds over a hundred million files, and it is the only reserve where *every*
file carries a machine-readable licence, an author, a description and categories. That is where we
harvest first. Behind it, for botanical and anatomical plates — the 19th-century engravings that
show the section, the pollen, the stamen — the **Biodiversity Heritage Library** (public domain,
millions of plates). For geolocated, expert-validated species photos, the open exports of
**iNaturalist** and **GBIF** (licence per observation). For technical diagrams, what the catalogue
already holds: Open Source Ecology's CAD renders, Appropedia's SVGs, KiCad schematics.

## What makes the pile finite: the view taxonomy

"Many views" — how many, exactly? `knowledge/views.yaml` answers, per domain. For a fungus: in
situ, cap, gills or pores, **whole stem with the base dug up** (ring, volva), longitudinal section,
spore print, spores under the microscope, the **deadly lookalike side by side**, and the young →
mature → old series. Nine views, seven required. For a plant: habit, leaf, flower, fruit and seed,
stem or bark, root, seedling, section, micrograph when diagnostic, dangerous lookalike, plate,
range. And likewise for an animal, a pest, a tool, a machine, a circuit, a building technique, a
procedure.

Once the list is known, "monstrous" becomes a number:

```
$ arche visuals coverage
Visual coverage: 0% — 0/13 required views covered by a verified file, across 2 concept(s).
  fungus            1 concept(s)     0 / 7
  plant             1 concept(s)     0 / 6
  amanita-phalloides             0/7  ∅ habit, cap, hymenium, stem_base, cross_section, spore_print, lookalike
```

That zero is honest — two manifests, no verified file yet — and it is the same principle as
catalogue freshness: a number that can be raised, instead of a worry that cannot be measured.

## The manifest: a concept, its views, its files

Each concept is a YAML file in `catalog/visuals/<domain>/`. It says what it is (Wikidata id,
Commons category, Latin name), which lookalikes to show beside it, and for each view, the files that
cover it — **with licence, author, source, provenance and status**. A file without a licence does
not enter. Neither does an NC or ND file: the library must be copyable hand to hand.

`scripts/visuals/commons.ts` does the harvesting: it reads the concept's Commons category, fetches
each file's URL, hash, normalised licence and description, refuses what is not free, **guesses** the
view from title and categories — "spore print" → spore_print, "volva" → stem_base — and writes
candidates. It decides nothing: everything arrives as `status: candidate`, and a human looks at the
images before promoting the right ones to `verified`. Only a verified file counts towards coverage.
A mislabelled photo of a deadly mushroom is worse than no photo.

## The rule that is not negotiable

Every view is marked `diagnostic` or not. A diagnostic view is one used to **identify** — the
gills, the volva, the leaf, the seed. For those views only three provenances are admitted: `photo`,
`micrograph`, `plate` (a real scientific plate). **Never `generated`.** Validation rejects the
manifest otherwise, with the message spelled out: *you do not identify a death cap from an AI
drawing*.

Generated images have one place: principle diagrams, exploded views, illustrations of a gesture —
the non-diagnostic views of machines, circuits and procedures — and always labelled as such. A
generated, reviewed rope-pump diagram is useful; a generated "photo" of a lepiota can kill.

## Producing, not only harvesting: diagrams are code

Harvesting covers what already exists as a photograph. Everything that must be *produced* remains: a
circuit schematic, a wiring diagram, a board, a dimensioned part, a flowchart. Two ways to get there
with a local AI, and they are not equal ([ADR 0009](../adr/0009-diagrams-as-code.md)).

A **diffusion model** produces a *picture* of a diagram: plausible pixels, a component that does not
exist, a trace going nowhere, a wrong dimension — unverifiable and uneditable. A **deterministic
generator** produces a diagram from a structured description: the description is text, the
rendering is exact, both can be reviewed, corrected and versioned. These tools exist, they are free,
and the language model's job is to **write their input**, not to draw.

| Need | Generator | What gets written |
|---|---|---|
| circuit schematic | **schemdraw** (Python) | `d += elm.Resistor().label('1 kΩ')` |
| real wiring, harness, pinout | **WireViz** (YAML) | connectors, wires, colours, lengths → diagram + BOM |
| circuit → real board | **SKiDL** → **KiCad** (ERC, SVG, gerbers) → **ngspice** | the circuit as a program, checked before soldering |
| procedure, decision tree, calendar | **Mermaid** (Node, already there) | `A --> B{delay > 6 h?}` |
| network, mesh, dependencies | **Graphviz** | `"Node" -> "Access point" -> "Barn"` |
| part to print or cut | **OpenSCAD**, **CadQuery** | `cylinder(d = 20, h = 10)` → STL, DXF, dimensioned projection |
| what no generator describes | **draw.io** | by hand, with its electrical, plumbing, building libraries |

The assistant's prompt enforces it: "a schematic, a wiring, a part: never describe the picture,
write its source in a typed block". Arche renders the source when the tool is installed
(`src/core/rag/diagrams.ts`); otherwise it is shown as is — readable, copyable, renderable
elsewhere. **A diagram without a tool beats a picture without a source.** The `generators` bundle
installs the set; everything in it runs with no daemon.

**Diffusion models** also enter the catalogue — `stable-diffusion.cpp` as a native binary with
FLUX.1-schnell (Apache-2.0) and SDXL — but for what they can do: **illustrate** a sheet, a gesture,
a scene, with `provenance: generated` and the label that goes with it. Never a diagnostic view, never
a technical diagram. An exact generator exists for that, and using it is not a preference: it is the
only honest option.

## What it weighs, and where it lives

A photographic view as WebP at 1 200 px weighs 150–300 KB. A complete concept — ten views, two or
three files each — is 5 MB. Ten thousand concepts, which would amply cover the flora, fungi and
pests of temperate Europe plus the tools and machines in the catalogue, is **50 GB**. That is a
disk, not a data centre.

Verified visuals are assembled per domain into **ZIMs** by the same pipeline as everything else
(`zim-build.yml`, zimwriterfs over an HTML gallery generated from the manifests), hosted on Internet
Archive, and indexed by the knowledge base (ADR 0007) through their captions and manifest — so that
"what does a death cap's volva look like?" returns the image and its source, not a description.

## What we do not claim

Commons is uneven: the *Amanita phalloides* category holds superb photos and blurry, misidentified
or distant ones. Harvesting proposes; sorting is human, and that is where the community matters — a
manifest is a YAML file, and a three-line PR promotes a candidate to verified. View guessing is a
deliberately simple heuristic; it leaves unrecognised files unplaced rather than misplaced. And two
manifests are not a library: the death cap and wild garlic are there because they are the two
confusions that kill most in France, and because they serve as the model for all the others.
