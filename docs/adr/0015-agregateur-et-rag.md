# ADR 0015 — Arche assume son rôle : un agrégateur, plus un RAG

**Statut** : accepté (décision de Florian, 12 septembre 2026, après l'analyse concurrentielle
[CONCURRENCE.md](../fr/CONCURRENCE.md)). Précise l'ADR 0013 (la base, pas le logiciel) et
l'ADR 0003 (orchestrateur, pas hébergeur). Par D22, les ADR à venir s'écrivent en anglais ;
celui-ci reste en français pour la cohérence du dossier jusqu'à M3-5.

**Contexte.** Le secteur a trois familles : les boîtiers de lecture (Kiwix Hotspot,
Internet-in-a-Box, RACHEL, PrepperDisk, PrepperPi), les serveurs tout-en-un avec IA (Project
NOMAD, 36 400 étoiles ; Personal Codex), et les index pré-calculés de Wikipédia (txtai,
Cohere, wikilite). Chacun a ce qu'Arche n'a pas — des utilisateurs, une expérience « je
branche », des cartes, un score — et aucun n'a ce qu'Arche vise : des centaines de corpus
indexés au-delà de Wikipédia, en shards indépendants du modèle, servis par MCP, à côté des
outils, miroirs, modèles et méthodes qu'il faut pour *faire*. La tentation, après une telle
analyse, est de combler chaque manque. Ce serait redevenir un logiciel de plus.

**Décision.** Arche est deux choses, et seulement deux.

1. **Un agrégateur.** Le catalogue sait où chaque ressource se trouve chez son éditeur — ZIM,
   logiciels, toolchains, modèles, miroirs git, jeux de données, cartes — et va chercher **la
   dernière version stable** au moment où on la demande (ADR 0003, tickets M2-7 et M2-8). Il
   n'héberge rien qui existe ailleurs. Il ne redistribue rien. Il n'écrit pas de recette shell
   pour ce qu'un gestionnaire (pip, npm, apt, cargo, `go-pmtiles`) sait déjà faire : il le
   catalogue et lui passe la liste.
2. **Un RAG.** Pour ce qui n'existe nulle part — les index de recherche des corpus de
   l'autonomie — Arche les fabrique en CI, les publie sur Internet Archive et ses miroirs, et
   les sert par MCP (ADR 0011, ADR 0014). Un SQLite par corpus, texte + FTS5 + une table de
   vecteurs par modèle, lisible sans Arche. C'est le seul artefact qu'Arche produit.

Ce qu'Arche **n'est pas**, et ne cherchera pas à devenir : un boîtier ou une image disque (pas
de démon, ADR 0008) ; un client ou une interface de conversation (ADR 0011) ; un moteur de
cartes, un lecteur, une visionneuse ; un dépôt de contenu ; un gestionnaire de paquets de plus.
Quand un manque de l'analyse concurrentielle relève d'une de ces catégories, la réponse est
*cataloguer ce qui le fait* et, s'il le faut, *se distribuer à travers lui*.

**Conséquences.**

- **Les cartes (M4-11)** sont de l'agrégation : le catalogue référence la planète Protomaps,
  `go-pmtiles`, MapLibre, Organic Maps, et la recette dit comment extraire une région ;
  Arche n'affiche pas de carte.
- **La distribution (M4-12)** passe par les boîtiers existants : `arche mcp` et les shards
  livrés comme app du Supply Depot de NOMAD et comme rôle IIAB. Leurs utilisateurs, nos index.
- **Le mode simple (M1-11)** et **le score (M4-13)** servent le RAG et l'estimation ; ils ne
  sont pas une interface.
- **Les packs (M4-8)** sont des profils du catalogue avec un manifeste, pas des images.
- **La mesure de succès** n'est pas le nombre d'étoiles du dépôt mais le nombre de corpus
  indexés, le recall mesuré par `arche eval`, et le nombre de clients et de boîtiers tiers qui
  branchent Arche.
- Tout ticket futur doit répondre à la question : *est-ce de l'agrégation, ou du RAG ?* Si ni
  l'un ni l'autre, il n'est pas pour Arche.

**Rejeté.** *Construire notre boîtier* : NOMAD y a mis un an et deux personnes, et il gagnera.
*Une interface pour « apprendre à se servir de la base »* : ce rôle revient au client de
l'utilisateur et aux méthodes (M4-4), pas à un logiciel de plus. *Héberger les ZIM nous-mêmes
pour aller plus vite* : Kiwix et ses miroirs le font depuis vingt ans.
