# Visuels : glaner, pas dessiner — et mesurer

> « Pour une plante il faut plein de vues, parfois des cellules au microscope. Idem pour toutes les
> disciplines techniques. Ça fait une somme monstrueuse de visuels à glaner et conserver. » Oui.
> Ce document dit comment on rend cette somme finie, mesurable, et sûre.
> English: [VISUALS.md](../en/VISUALS.md)

## Le renversement

On ne va pas *créer* ces visuels. Personne ne le peut, et ce serait une erreur d'essayer : une
image de champignon dessinée pour la bibliothèque est une image de moins bonne qualité qu'une
photo de terrain, et une image *générée* est un danger. Ce qu'on fait, c'est **glaner** dans les
réserves d'images libres qui existent déjà — et elles sont immenses.

**Wikimedia Commons** compte plus de cent millions de fichiers, et c'est la seule réserve où
*chaque* fichier porte une licence lisible par machine, un auteur, une description et des
catégories. C'est là qu'on glane d'abord. Derrière, pour les planches botaniques et anatomiques —
les gravures du XIXe qui montrent la coupe, le pollen, l'étamine — la **Biodiversity Heritage
Library** (domaine public, des millions de planches). Pour les photos d'espèces géolocalisées et
validées par des experts, les exports ouverts d'**iNaturalist** et **GBIF** (licence par
observation). Pour les schémas techniques, ce que le catalogue contient déjà : les rendus CAO
d'Open Source Ecology, les SVG d'Appropedia, les schémas KiCad.

## Ce qui rend la somme finie : la taxonomie des vues

« Il faut plein de vues » — combien, exactement ? `knowledge/views.yaml` répond, par domaine.
Pour un champignon : in situ, chapeau, lames ou pores, **pied entier avec la base déterrée** (anneau,
volve), coupe longitudinale, sporée, spores au microscope, la **confusion mortelle côte à côte**, et
la série jeune → mûr → vieux. Neuf vues, dont sept requises. Pour une plante : port, feuille, fleur,
fruit et graine, tige ou écorce, racine, plantule, coupe, microscopie quand c'est discriminant,
sosie dangereux, planche, aire. Et de même pour un animal, un ravageur, un outil, une machine, un
circuit, une technique de construction, un geste.

Une fois la liste connue, « monstrueux » devient un chiffre :

```
$ arche visuals coverage
Couverture visuelle : 0 % — 0/13 vues requises couvertes par un fichier vérifié, sur 2 concept(s).
  fungus            1 concept(s)     0 / 7
  plant             1 concept(s)     0 / 6
  amanita-phalloides             0/7  ∅ habit, cap, hymenium, stem_base, cross_section, spore_print, lookalike
```

Ce zéro est honnête — deux manifestes, aucun fichier vérifié encore — et c'est le même principe que
la fraîcheur du catalogue : un chiffre qu'on peut faire monter, plutôt qu'une inquiétude qu'on ne
peut pas mesurer.

## Le manifeste : un concept, ses vues, ses fichiers

Chaque concept est un fichier YAML dans `catalog/visuals/<domaine>/`. Il dit ce qu'il est
(identifiant Wikidata, catégorie Commons, nom latin), quels sosies montrer à côté, et pour chaque
vue, les fichiers qui la couvrent — **avec licence, auteur, source, provenance et statut**. Un
fichier sans licence n'entre pas. Un fichier en NC ou ND n'entre pas non plus : la bibliothèque doit
pouvoir être copiée de main en main.

`scripts/visuals/commons.ts` fait le glanage : il lit la catégorie Commons du concept, récupère
pour chaque fichier l'URL, le hash, la licence normalisée et la description, refuse ce qui n'est pas
libre, **devine** la vue à partir du titre et des catégories — « spore print » → sporée, « volva »
→ base du pied — et écrit des candidats. Il ne décide rien : tout arrive en `status: candidate`, et
un humain regarde les images avant de passer les bonnes en `verified`. Seul un fichier vérifié
compte dans la couverture. Une photo mal étiquetée d'un champignon mortel est pire que pas de photo.

## La règle qui ne se négocie pas

Chaque vue est marquée `diagnostic` ou non. Une vue diagnostique est une vue qui sert à
**identifier** — les lames, la volve, la feuille, la graine. Pour ces vues, seules trois provenances
sont admises : `photo`, `micrograph`, `plate` (planche scientifique réelle). **Jamais `generated`.**
La validation refuse le manifeste sinon, avec le message en clair : *on n'identifie pas une amanite
sur un dessin d'IA*.

Les images générées ont une place, et une seule : les schémas de principe, les éclatés, les
illustrations d'un geste — les vues non diagnostiques des machines, des circuits, des procédures —
et toujours étiquetées comme telles. Un schéma de pompe à corde généré et relu est utile ; une
« photo » de lépiote générée peut tuer.

## Produire, pas seulement glaner : les schémas sont du code

Glaner couvre ce qui existe déjà en photo. Il reste tout ce qu'il faut *produire* : un schéma
électrique, un câblage, une carte, une pièce cotée, un organigramme. Deux façons d'y arriver avec
une IA locale, et elles ne se valent pas ([ADR 0009](../adr/0009-diagrams-as-code.md)).

Un **modèle de diffusion** produit une *image* de schéma : des pixels plausibles, un composant qui
n'existe pas, une piste qui ne va nulle part, une cote fausse — invérifiable et inmodifiable. Un
**générateur déterministe** produit un schéma à partir d'une description structurée : la
description est du texte, le rendu est exact, l'un et l'autre se relisent, se corrigent et se
versionnent. Ces outils existent, ils sont libres, et le rôle du modèle de langue est d'**écrire
leur entrée**, pas de dessiner.

| Besoin | Générateur | Ce qu'on écrit |
|---|---|---|
| schéma électrique, montage | **schemdraw** (Python) | `d += elm.Resistor().label('1 kΩ')` |
| câblage réel, faisceau, brochage | **WireViz** (YAML) | connecteurs, fils, couleurs, longueurs → schéma + nomenclature |
| circuit → carte réelle | **SKiDL** → **KiCad** (ERC, SVG, gerbers) → **ngspice** | le circuit comme programme, vérifié avant d'être soudé |
| procédure, arbre de décision, calendrier | **Mermaid** (Node, déjà là) | `A --> B{délai > 6 h ?}` |
| réseau, mesh, dépendances | **Graphviz** | `"Nœud" -> "Point d'accès" -> "Grange"` |
| pièce à imprimer ou découper | **OpenSCAD**, **CadQuery** | `cylinder(d = 20, h = 10)` → STL, DXF, projection cotée |
| ce qu'aucun générateur ne décrit | **draw.io** | à la main, avec ses bibliothèques électrique, plomberie, bâtiment |

Le prompt de l'assistant l'impose : « un schéma, un câblage, une pièce : tu n'en décris jamais
l'image, tu écris sa source dans un bloc typé ». Arche rend la source si l'outil est installé
(`src/core/rag/diagrams.ts`) ; sinon elle est montrée telle quelle — lisible, copiable, rendable
ailleurs. **Un schéma sans outil vaut mieux qu'une image sans source.** Le bloc `generators` du
catalogue installe la panoplie ; tout y tourne sans démon.

Les **modèles de diffusion** entrent aussi au catalogue — `stable-diffusion.cpp` en binaire natif
avec FLUX.1-schnell (Apache-2.0) et SDXL — mais pour ce qu'ils savent faire : **illustrer** une
fiche, un geste, une scène, avec `provenance: generated` et l'étiquette qui va avec. Jamais une vue
diagnostique, jamais un schéma technique. Pour ça un générateur exact existe, et l'utiliser n'est
pas une préférence : c'est la seule option honnête.

## Ce que ça pèse, et où ça vit

Une vue photographique en WebP à 1 200 px pèse 150 à 300 Ko. Un concept complet — dix vues, deux ou
trois fichiers par vue — fait 5 Mo. Dix mille concepts, ce qui couvrirait largement la flore, les
champignons et les ravageurs d'Europe tempérée plus l'outillage et les machines du catalogue, font
**50 Go**. C'est un disque, pas un data center.

Les visuels vérifiés sont assemblés par domaine en **ZIM** par la même chaîne que le reste
(`zim-build.yml`, zimwriterfs sur une galerie HTML générée depuis les manifestes), hébergés sur
Internet Archive, et indexés par la base de connaissance (ADR 0007) via leurs légendes et leur
manifeste — ce qui fait que « à quoi ressemble la volve d'une amanite ? » renvoie l'image et sa
source, pas une description.

## Ce qu'on ne prétend pas

Commons est inégal : la catégorie *Amanita phalloides* contient des photos superbes et des photos
floues, mal identifiées ou prises de trop loin. Le glanage propose ; le tri est humain, et c'est là
que la communauté compte — un manifeste est un fichier YAML, une PR de trois lignes passe un
candidat en vérifié. La devinette de vue est une heuristique volontairement simple ; elle laisse
sans vue ce qu'elle ne reconnaît pas plutôt que de se tromper. Et deux manifestes ne font pas une
bibliothèque : l'amanite phalloïde et l'ail des ours sont là parce que ce sont les deux confusions
qui tuent le plus en France, et parce qu'ils servent de modèle à tous les autres.
