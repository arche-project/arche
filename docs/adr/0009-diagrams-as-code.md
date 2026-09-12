# ADR 0009 — Les schémas sont du code ; les modèles de diffusion illustrent, ils ne produisent pas

**Statut** : accepté (décision de Florian, 2026-09-11). Complète l'ADR 0007 (§6 : les chiffres ne
passent pas par le modèle) et la règle visuelle de `docs/fr/VISUELS.md`.

**Contexte.** Une bibliothèque d'autonomie a besoin de schémas techniques : un schéma électrique,
un câblage, une carte, un plan coté, un éclaté, un organigramme. Deux façons de les obtenir avec une
IA locale, et elles ne se valent pas. Un **modèle de diffusion** produit une image de schéma : des
pixels plausibles, un composant qui n'existe pas, une piste qui ne va nulle part, une cote fausse —
invérifiable et inmodifiable. Un **générateur déterministe** produit un schéma à partir d'une
description structurée : la description est du texte, le rendu est exact, et l'un comme l'autre se
relisent, se corrigent et se versionnent. La question de Florian — « on aura surtout besoin d'outils
qui savent produire des schémas techniques, des cartes, des schémas » — a une réponse précise :
ces outils existent, ils sont libres, et le rôle du modèle de langue est d'**écrire leur entrée**,
pas de dessiner.

**Décision.**

1. **Un schéma est un fichier source, et le rendu en est une vue.** Le livrable est le code
   (schemdraw, WireViz, Mermaid, Graphviz, OpenSCAD, CadQuery, un `.kicad_sch`) ; le SVG ou le PNG
   est dérivé et régénérable. Le même principe que pour les chiffres (ADR 0007) : le modèle de
   langue n'a pas le droit de produire des pixels techniques, seulement la source qu'un outil
   déterministe rend.

2. **Un registre de générateurs** (`src/core/rag/diagrams.ts`) décrit chaque outil : langage
   d'entrée, commande de rendu, formats de sortie, ce qu'il sait faire. L'assistant l'expose comme
   outil : il choisit le générateur selon le besoin — schéma électrique → schemdraw, câblage →
   WireViz, organigramme → Mermaid, pièce → OpenSCAD — écrit la source dans un bloc typé, et Arche
   rend si l'outil est installé. **S'il ne l'est pas, la source est montrée telle quelle** : elle
   reste lisible, copiable et rendable ailleurs. Un schéma sans outil vaut mieux qu'une image sans
   source.

3. **Pour l'électronique, la chaîne va jusqu'à la vérification.** Un circuit écrit en skidl ou en
   `.kicad_sch` passe par `kicad-cli` (ERC, export SVG, gerbers) et, quand c'est pertinent, par
   ngspice pour simuler. Un schéma qui ne passe pas l'ERC n'est pas livré : on ne donne pas à
   quelqu'un hors ligne une carte qui ne peut pas marcher.

4. **Les modèles de diffusion entrent au catalogue, en illustration uniquement.**
   `stable-diffusion.cpp` (binaire statique, CPU ou GPU — cohérent avec l'ADR 0008) avec
   FLUX.1-schnell et SDXL en poids libres. Usage : illustrer un geste, une scène, une fiche — avec
   `provenance: generated`, étiqueté. La règle visuelle reste entière : **jamais pour une vue
   diagnostique, jamais pour un schéma technique**. Un générateur exact existe pour ça ; l'utiliser
   n'est pas une préférence, c'est la seule option honnête.

5. **Tout générateur retenu tourne sans démon** (ADR 0008) : binaires statiques (Graphviz,
   OpenSCAD, draw.io, ngspice, KiCad), Node (Mermaid, netlistsvg) ou Python autonome (schemdraw,
   skidl, WireViz, CadQuery). PlantUML demande une JVM : il entre avec le JDK Temurin en dépendance
   déclarée, ou pas du tout.

**Alternatives écartées.** Un modèle de diffusion « spécialisé schémas » (il n'existe pas de modèle
libre qui produise un schéma électriquement juste, et il ne pourrait pas être vérifié). Un modèle
multimodal qui lit une image de schéma (utile pour *comprendre* un schéma existant — pas exclu
plus tard, autre sujet). Kroki (rend tous les langages de diagramme, mais c'est un serveur : un
démon de plus).

**Conséquences.** L'assistant gagne un vocabulaire : quand on lui demande « un schéma de… », il
répond par une source dans un bloc typé, et le prompt le lui impose. Le catalogue gagne une famille
`generators` avec un paquet dédié. Les manifestes visuels peuvent porter des rendus de générateurs
avec `provenance: render` et le chemin de la source — ce qui les rend régénérables quand un
composant change. Et une limite à dire : ces outils produisent ce qu'on leur décrit ; la
compétence de décrire un circuit correctement reste humaine, et le modèle local de 8 milliards de
paramètres se trompera sur les valeurs de composants. L'ERC attrape la topologie, pas le
dimensionnement — d'où le renvoi systématique aux calculateurs et aux sources.

---

**Status**: accepted. **Decision**: a diagram is source code; the rendering is a derived view. A
generator registry (schemdraw, WireViz, Mermaid, Graphviz, OpenSCAD, CadQuery, KiCad CLI, ngspice,
draw.io) is exposed to the assistant as a tool: it writes the source in a typed block, Arche renders
it when the tool is installed and shows the source otherwise. Electronics goes through ERC and,
where relevant, simulation. Diffusion models (stable-diffusion.cpp with FLUX.1-schnell and SDXL)
enter the catalogue for labelled illustration only — never for diagnostic views, never for technical
diagrams. Every generator runs with no daemon (ADR 0008).
