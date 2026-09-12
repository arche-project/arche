// Les schémas sont du code (ADR 0009) : registre de générateurs déterministes et rendu.
// Diagrams as code (ADR 0009): registry of deterministic generators and rendering.
//
// Le modèle de langue n'a pas le droit de produire des pixels techniques. Il écrit la SOURCE d'un
// schéma dans un bloc typé — ```schemdraw, ```wireviz, ```mermaid, ```openscad… — et un outil
// déterministe la rend. Si l'outil n'est pas installé, la source est montrée telle quelle : elle
// reste lisible, copiable, rendable ailleurs. Un schéma sans outil vaut mieux qu'une image sans source.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findBinary } from '../supervisor.js';
import type { I18n } from '../types.js';

const run = promisify(execFile);

export type DiagramKind = 'schemdraw' | 'wireviz' | 'mermaid' | 'graphviz' | 'openscad' | 'cadquery' | 'kicad-sch' | 'plantuml';

export interface Generator {
  kind: DiagramKind;
  name: string;
  /** Ce qu'il sait produire — c'est ce que lit le modèle pour choisir. */
  produces: I18n;
  /** Quand l'utiliser plutôt qu'un autre. */
  when: I18n;
  /** Langage de la source (pour le bloc typé et la coloration). */
  language: string;
  /** Ressource du catalogue qui l'installe. */
  resource: string;
  /** Binaire cherché dans la bibliothèque puis le PATH. */
  binary: string;
  /** Formats de sortie possibles ; le premier est le défaut. */
  outputs: Array<'svg' | 'png' | 'pdf' | 'stl' | 'dxf'>;
  /** Extension du fichier source. */
  ext: string;
  /** Construit la commande : (binaire, source, sortie) → argv. */
  argv: (bin: string, src: string, out: string) => string[];
  /** Le rendu passe par un interpréteur (python) plutôt qu'un binaire dédié. */
  via?: 'python';
  /** Un exemple minimal et juste, donné au modèle comme gabarit. */
  example: string;
}

export const GENERATORS: Record<DiagramKind, Generator> = {
  schemdraw: {
    kind: 'schemdraw', name: 'schemdraw', language: 'python', resource: 'schemdraw', binary: 'python3', via: 'python',
    produces: { fr: 'schémas électriques et électroniques (composants, fils, étiquettes, valeurs), diagrammes logiques', en: 'electrical and electronic schematics (parts, wires, labels, values), logic diagrams' },
    when: { fr: 'dès qu’il y a un circuit à montrer : régulateur, pont de diodes, montage à transistor, chargeur solaire', en: 'whenever a circuit must be shown: regulator, bridge rectifier, transistor stage, solar charger' },
    outputs: ['svg', 'png'], ext: '.py',
    argv: (bin, src, out) => [bin, src, out],
    example: `import schemdraw, schemdraw.elements as elm, sys
with schemdraw.Drawing(file=sys.argv[1], show=False) as d:
    d += elm.SourceV().label('12 V')
    d += elm.Resistor().right().label('1 kΩ')
    d += elm.LED().down().label('LED')
    d += elm.Line().left()`,
  },
  wireviz: {
    kind: 'wireviz', name: 'WireViz', language: 'yaml', resource: 'wireviz', binary: 'wireviz',
    produces: { fr: 'schémas de câblage et faisceaux : connecteurs, brochages, couleurs de fils, longueurs, nomenclature', en: 'wiring and harness diagrams: connectors, pinouts, wire colours, lengths, BOM' },
    when: { fr: 'câbler réellement quelque chose : panneau → régulateur → batterie, capteur → carte, moteur → contrôleur', en: 'actually wiring something: panel → controller → battery, sensor → board, motor → driver' },
    outputs: ['svg', 'png'], ext: '.yml',
    argv: (bin, src, out) => [bin, src, '-o', path.dirname(out), '-f', 's'],
    example: `connectors:
  Panneau: { type: MC4, pins: [+, -] }
  Regulateur: { type: bornier, pinlabels: [PV+, PV-, BAT+, BAT-] }
cables:
  W1: { colors: [RD, BK], gauge: 4 mm2, length: 3 m }
connections:
  - - Panneau: [1-2]
    - W1: [1-2]
    - Regulateur: [1-2]`,
  },
  mermaid: {
    kind: 'mermaid', name: 'Mermaid', language: 'mermaid', resource: 'mermaid-cli', binary: 'mmdc',
    produces: { fr: 'organigrammes, séquences, arbres de décision, calendriers (Gantt), diagrammes d’états', en: 'flowcharts, sequences, decision trees, Gantt timelines, state diagrams' },
    when: { fr: 'une procédure, un « si… alors », un calendrier de saison, un plan de secours', en: 'a procedure, an if/then, a seasonal calendar, a contingency plan' },
    outputs: ['svg', 'png', 'pdf'], ext: '.mmd',
    argv: (bin, src, out) => [bin, '-i', src, '-o', out, '-b', 'transparent'],
    example: `flowchart TD
  A[Symptômes après un repas de champignons] --> B{Délai > 6 h ?}
  B -- oui --> C[URGENCE : 15 / 112]
  B -- non --> D[Appeler le centre antipoison]`,
  },
  graphviz: {
    kind: 'graphviz', name: 'Graphviz', language: 'dot', resource: 'graphviz', binary: 'dot',
    produces: { fr: 'graphes : dépendances, réseaux (électrique, hydraulique, mesh), arbres', en: 'graphs: dependencies, networks (electrical, hydraulic, mesh), trees' },
    when: { fr: 'des nœuds et des liens sans mise en page manuelle — un réseau de hameau, une topologie mesh, un arbre de pannes', en: 'nodes and links without manual layout — a hamlet network, a mesh topology, a fault tree' },
    outputs: ['svg', 'png', 'pdf'], ext: '.dot',
    argv: (bin, src, out) => [bin, `-T${path.extname(out).slice(1)}`, src, '-o', out],
    example: `digraph mesh {
  rankdir=LR; node [shape=box];
  "Nœud Arche" -> "Point d'accès" -> "Maison A";
  "Point d'accès" -> "Maison B" -> "Pont 2,4 GHz" -> "Grange";
}`,
  },
  openscad: {
    kind: 'openscad', name: 'OpenSCAD', language: 'openscad', resource: 'openscad', binary: 'openscad',
    produces: { fr: 'pièces mécaniques paramétriques : STL à imprimer, DXF à découper, projections 2D cotées', en: 'parametric mechanical parts: STL to print, DXF to cut, dimensioned 2D projections' },
    when: { fr: 'une pièce à fabriquer dont on connaît les dimensions : bride, entretoise, boîtier, gabarit', en: 'a part to make whose dimensions are known: bracket, spacer, enclosure, jig' },
    outputs: ['stl', 'svg', 'dxf', 'png'], ext: '.scad',
    argv: (bin, src, out) => [bin, '-o', out, src],
    example: `// Entretoise : diamètre extérieur, trou, hauteur — tout est paramétrable
d_ext = 20; d_trou = 6.5; h = 10;
difference() { cylinder(d = d_ext, h = h, $fn = 64); cylinder(d = d_trou, h = h * 3, center = true, $fn = 48); }`,
  },
  cadquery: {
    kind: 'cadquery', name: 'CadQuery', language: 'python', resource: 'cadquery', binary: 'python3', via: 'python',
    produces: { fr: 'pièces et assemblages CAO en Python, export STEP/STL/SVG, plans cotés', en: 'CAD parts and assemblies in Python, STEP/STL/SVG export, dimensioned drawings' },
    when: { fr: 'quand OpenSCAD ne suffit plus : congés, filetages, assemblages, export STEP pour FreeCAD', en: 'when OpenSCAD is not enough: fillets, threads, assemblies, STEP export for FreeCAD' },
    outputs: ['stl', 'svg'], ext: '.py',
    argv: (bin, src, out) => [bin, src, out],
    example: `import cadquery as cq, sys
part = cq.Workplane("XY").box(40, 20, 8).edges("|Z").fillet(3).faces(">Z").workplane().hole(6.5)
cq.exporters.export(part, sys.argv[1])`,
  },
  'kicad-sch': {
    kind: 'kicad-sch', name: 'KiCad', language: 'lisp', resource: 'toolchain-kicad', binary: 'kicad-cli',
    produces: { fr: 'schéma KiCad natif : ERC, export SVG/PDF, netliste, puis carte et gerbers', en: 'native KiCad schematic: ERC, SVG/PDF export, netlist, then board and gerbers' },
    when: { fr: 'quand le circuit doit devenir une carte réelle — on part du schéma vérifié par ERC', en: 'when the circuit must become a real board — start from an ERC-checked schematic' },
    outputs: ['svg', 'pdf'], ext: '.kicad_sch',
    argv: (bin, src, out) => [bin, 'sch', 'export', 'svg', '-o', path.dirname(out), src],
    example: `(kicad_sch (version 20231120) (generator "arche")
  (symbol (lib_id "Device:R") (at 100 100 0) (property "Reference" "R1") (property "Value" "1k"))
  ; utiliser le fichier de skidl ou de l'éditeur ; ce gabarit n'est pas un circuit complet
)`,
  },
  plantuml: {
    kind: 'plantuml', name: 'PlantUML', language: 'plantuml', resource: 'plantuml', binary: 'plantuml',
    produces: { fr: 'diagrammes UML, réseau, déploiement, mind maps, Gantt', en: 'UML, network, deployment diagrams, mind maps, Gantt' },
    when: { fr: 'architecture logicielle ou réseau détaillée ; sinon préférer Mermaid (pas de JVM)', en: 'detailed software or network architecture; otherwise prefer Mermaid (no JVM)' },
    outputs: ['svg', 'png'], ext: '.puml',
    argv: (bin, src, out) => [bin, `-t${path.extname(out).slice(1)}`, '-o', path.dirname(out), src],
    example: `@startmindmap
* Autonomie
** Eau
** Chaleur
** Calories
@endmindmap`,
  },
};

export interface RenderResult {
  kind: DiagramKind;
  /** Fichier source écrit — c'est le livrable. */
  sourceFile: string;
  /** Rendu, ou null si l'outil est absent. */
  outputFile: string | null;
  /** Pourquoi il n'y a pas de rendu, le cas échéant. */
  reason?: string;
}

/**
 * Écrit la source, rend si l'outil est là. Ne lance JAMAIS d'erreur pour un outil absent : la
 * source seule est déjà un résultat.
 */
export async function renderDiagram(kind: DiagramKind, source: string, o: { lib: string; outDir: string; format?: string; name?: string }): Promise<RenderResult> {
  const g = GENERATORS[kind];
  fs.mkdirSync(o.outDir, { recursive: true });
  const base = o.name ?? `${kind}-${Date.now().toString(36)}`;
  const sourceFile = path.join(o.outDir, base + g.ext);
  fs.writeFileSync(sourceFile, source.endsWith('\n') ? source : source + '\n');
  const format = (o.format ?? g.outputs[0]) as string;
  if (!g.outputs.includes(format as never)) return { kind, sourceFile, outputFile: null, reason: `format ${format} non supporté par ${g.name} (${g.outputs.join(', ')})` };
  const bin = findBinary(o.lib, g.binary);
  if (!bin) return { kind, sourceFile, outputFile: null, reason: `${g.name} n'est pas installé (ressource « ${g.resource} ») — la source est fournie telle quelle` };
  const outputFile = path.join(o.outDir, `${base}.${format}`);
  try {
    await run(bin === g.binary ? bin : bin, g.argv(bin, sourceFile, outputFile).slice(1), { timeout: 120_000, cwd: o.outDir, env: { ...process.env, TMPDIR: os.tmpdir() } });
    if (!fs.existsSync(outputFile)) {
      // WireViz et kicad-cli nomment la sortie eux-mêmes : on cherche ce qui vient d'apparaître.
      const produced = fs.readdirSync(o.outDir).filter(f => f.startsWith(base) && f.endsWith(`.${format}`)).map(f => path.join(o.outDir, f));
      if (produced.length) return { kind, sourceFile, outputFile: produced[0]! };
      return { kind, sourceFile, outputFile: null, reason: `${g.name} a terminé sans produire ${format}` };
    }
    return { kind, sourceFile, outputFile };
  } catch (e) {
    return { kind, sourceFile, outputFile: null, reason: `${g.name} a échoué : ${String((e as Error).message).split('\n')[0]}` };
  }
}

/** Description des générateurs pour le prompt MCP (`arche_rules`) et l'outil `render_diagram`. */
export function generatorsPrompt(lang: 'fr' | 'en'): string {
  const lines = Object.values(GENERATORS).map(g => `- \`\`\`${g.kind} → ${g.name} : ${g.produces[lang]} — ${g.when[lang]}`);
  return (lang === 'fr'
    ? 'Pour tout schéma, câblage, pièce ou diagramme : n’en DÉCRIS pas l’image, écris sa SOURCE dans un bloc typé. Le livrable est la source ; Arche la rend si l’outil est installé. Générateurs disponibles :\n'
    : 'For any schematic, wiring, part or diagram: do not DESCRIBE the picture, write its SOURCE in a typed block. The source is the deliverable; Arche renders it when the tool is installed. Available generators:\n')
    + lines.join('\n');
}
