# Arche

[![CI](https://github.com/arche-project/arche/actions/workflows/ci.yml/badge.svg)](https://github.com/arche-project/arche/actions/workflows/ci.yml) [![Licence MIT](https://img.shields.io/badge/licence-MIT-green.svg)](LICENSE)

**FR** — Votre web local, sans internet. · **EN** — Your local web, no internet required.

[Français](#français) · [English](#english)

---

## Français

Arche construit sur un disque ordinaire un **« web local »** : une bibliothèque du savoir humain
(Wikipédia, médecine, réparation, agriculture, énergie…), des **IA locales** et des **outils**, tous
utilisables **sans aucune connexion**. Pour une coupure prolongée, une zone blanche, ou simplement
pour ne plus dépendre du réseau.

Le principe : **le logiciel au service du monde physique** — cultiver, soigner, réparer, construire,
communiquer. Pas l'inverse.

### Ce que ce dépôt contient (et ne contient pas)

Arche n'est pas un logiciel de plus : c'est une **base de connaissance** — des centaines de corpus de
référence indexés et hébergés sur Internet Archive, plus vos propres documents — servie par MCP à
n'importe quel modèle léger tournant hors ligne (ADR 0013). Arche assume deux rôles et seulement deux — **un agrégateur, plus un RAG** (ADR 0015) : pas de boîtier, pas de client, rien d'hébergé qui existe ailleurs, toujours la dernière version stable chez l'éditeur. Ce dépôt est un **orchestrateur** : un
catalogue de ressources + ce qu'il faut pour télécharger depuis les **sources officielles** (Kiwix,
GitHub, Ollama, Hugging Face…), indexer, servir et exposer. Il ne contient **aucun** contenu. Pour les sources qui n'existent pas en ZIM, Arche construit et héberge lui-même
le fichier (sur Internet Archive) — uniquement quand la licence ou l'auteur l'autorise, jamais
autrement. L'utilisateur n'a jamais rien à crawler. Détails : [HEBERGEMENT.md](docs/fr/HEBERGEMENT.md).

**Le noyau se mesure.** Lignes de code (TypeScript/JavaScript, hors tests) : <!-- loc -->`src/` 6998 · `examples/` 0 · `vendor/` 0<!-- /loc -->
— chiffre produit par `npm run loc -- --readme`. Cible : `src/` sous **3 000** lignes
([audit](docs/fr/AUDIT-ARCHITECTURE.md), décision 4) ; seuil CI courant **7 000**, puis 5 000, puis
3 000 à mesure que solveurs, miroirs et visuels sortent du noyau. Détails : [NOYAU.md](docs/fr/NOYAU.md).

**La connaissance dit d'où elle vient.** <!-- knowledge -->
`knowledge/` : **0 valeurs sourcées / 445** (445 en période de grâce `unsourced: true`)
<!-- /knowledge -->
— chiffre produit par `arche knowledge verify --write README.md`. Chaque nombre de `figures.yaml`,
`crops.yaml`, `compute.yaml` porte un locator vers le corpus (`source: {resource, path, quote}`) ou une
grâce explicite ; `verified` n'est jamais écrit à la main, la commande le calcule contre les shards
installés (audit, décision 2). Détails : [PROVENANCE.md](docs/fr/PROVENANCE.md).

### Trois façons de s'en servir

| Vous êtes… | Faites… |
|---|---|
| **Débutant, jamais ouvert un terminal** | Téléchargez l'exécutable de la [dernière release](../../releases), double-cliquez, répondez à trois questions. → [Guide débutant](docs/fr/guide-debutant.md) |
| **À l'aise en informatique** | `npx arche` ou `git clone` + `npm i && npm run build`, puis `arche plan` / `arche download` avec un `arche.yaml`. → [Guide expert](docs/fr/guide-expert.md) |
| **Low-tech / papier** | Le profil *low-tech* liste ce qui s'imprime et se relie. → [Guide low-tech](docs/fr/guide-low-tech.md) et [fiches imprimables](docs/printables/fr/) |

```bash
# En trois commandes (machine connectée) :
npm install && npm run build
node dist/cli.js                 # wizard interactif
node dist/cli.js serve --open    # interface web + kiwix-serve, Ollama, Gitea supervisés (sans Docker)
node dist/cli.js project plan examples/inventaire-potager.yaml --year 2027   # « j'ai X semences et telles parcelles » → calendrier + parcelles + rendements
node dist/cli.js mcp             # serveur MCP : branchez VOTRE client IA hors ligne (Open WebUI, OpenCode, Jan…)
node dist/cli.js compute estimate --model qwen3.6:27b --ram 8   # « ≈ 1 h 27 et 65 Wh sur cette machine » — jamais « impossible »
node dist/cli.js index add ~/Livres/manuel-apiculture.pdf        # vos PDF, ebooks, notes : indexés, cherchables hors ligne
node dist/cli.js index fetch                                     # les shards publiés des corpus installés (Internet Archive)
node dist/cli.js eval                                            # ce que la recherche retrouve, mesuré : rappel@5 par canal, garde-fous, négatives
```

### Ce qu'il y a dedans

Encyclopédies (Wikipédia FR/EN, Wiktionnaire, Vikidia, Wikilivres, Gutenberg), **santé** (WikiMed,
WikEM, *Là où il n'y a pas de docteur*), **pratique** (iFixit, Appropedia, Energypedia, Low-tech Lab,
conservation alimentaire, eau potable, post-catastrophe), **technique** (StackExchange électronique /
radio / jardinage / bricolage, ArchWiki, DevDocs), **IA locale** (Ollama + Qwen3.5/3.6 choisis selon votre
RAM/GPU, reclasseur, OCR, voix en français, interface Arche — sans Docker), **atelier** (PlatformIO, ESP-IDF, Arduino, KiCad, FreeCAD, Klipper, Marlin), **schémas et pièces en code** (schemdraw, WireViz, Mermaid, Graphviz, OpenSCAD, draw.io, ngspice),
**matériel libre** (LeRobot et bras SO-101, Reachy Mini, Voron, Precious Plastic, FarmBot, Libre Solar, prothèses e-NABLE), **communiquer & prévoir** (Meshtastic, SatDump), **cartes** (OpenStreetMap France, Organic Maps),
**entraîner en local** (PyTorch CPU, scikit-learn, PEFT, LeRobot, tinygrad, TFLite Micro), **dev hors-ligne** (Gitea, Aider, miroirs Git), **automatiser sans réseau** (Node-RED, Hermes Agent — branchés sur `arche mcp`, jamais dans une boucle d'actionneur), **terrain** (OpenDroneMap, PDAL, CloudCompare, QGIS, Mosquitto : drone, LiDAR, satellite, caméras, capteurs). Le [catalogue](catalog/resources/) est la liste exacte.

### Documentation

- [La base de connaissance](docs/fr/BASE-CONNAISSANCE.md) — l'index interrogeable par IA locale : ce qu'Arche fabrique vraiment
- [MVP](docs/fr/MVP.md) — le plus court chemin : des centaines de corpus indexés et hébergés, servis par MCP à un modèle léger hors ligne ; ce qui manque, dans quel ordre
- [Architecture](docs/fr/ARCHITECTURE.md) — comment c'est construit et pourquoi · [Audit d'architecture](docs/fr/AUDIT-ARCHITECTURE.md) — les erreurs stratégiques du dépôt tel qu'il est, et la cible en six décisions · [Orchestration](docs/fr/ORCHESTRATION.md) — les tickets (`backlog/tickets.yaml`), le board Trello et l'orchestrateur qui les exécute · [Publication](docs/fr/PUBLICATION.md) — publier le dépôt, les secrets, la protection de branche (M0-1) · [Concurrence](docs/fr/CONCURRENCE.md) — NOMAD, Kiwix, IIAB, RACHEL, PrepperDisk, les index pré-calculés : ce qu'Arche a de plus, de moins, et ce qu'on ajoute
- [Le noyau, mesuré](docs/fr/NOYAU.md) — `npm run loc` : ce qui compte comme noyau, le seuil CI et son calendrier (7 000 → 5 000 → 3 000)
- [Provenance ou rien](docs/fr/PROVENANCE.md) — `knowledge/*.yaml` : chaque valeur porte `source: {resource, path, quote}` ou une grâce explicite `unsourced: true`, comptée ; `arche knowledge verify` calcule `verified` en ouvrant les shards ; `catalog validate` refuse le reste
- [Évaluation](docs/fr/EVAL.md) — `knowledge/eval.yaml` : 60 questions (12 garde-fous, 15 négatives) avec corpus attendu, locator et mots obligatoires ; `arche eval` les joue par canal (xapian / sqlite / fusion / rerank), publie le tableau et bloque la CI sous le seuil — mesurer avant d'ajouter
- [Décisions à arbitrer](docs/fr/DECISIONS.md) — ce qui n'est pas tranché
- [Angles morts](docs/fr/ANGLES-MORTS.md) — ce que le projet ne couvre pas (encore), avec criticité
- [Les trous pour un autonomiste](docs/fr/TROUS-AUTONOMIE.md) — critique du catalogue pour qui vit hors système en régime permanent
- [Fiches imprimables](docs/printables/fr/) — 8 fiches à plastifier, dont [les chiffres de l'autonomie](docs/printables/fr/08-chiffres.md)
- [Fraîcheur : dernière version stable, mesurée](docs/fr/FRAICHEUR.md) — le catalogue ne vaut que par sa date
- [Systèmes d'exploitation : un usage, une distribution](docs/fr/SYSTEMES.md) — réinstaller une machine sans réseau
- [Sans Docker](docs/fr/SANS-DOCKER.md) — binaires natifs, superviseur `arche serve`, démarrage au boot sans démon
- [Miroirs de paquets](docs/fr/MIROIRS.md) — ajouter n'importe quelle distribution en trente lignes, fermeture de dépendances calculée
- [Modèles : par capacité, pas par nationalité](docs/fr/MODELES.md) — Qwen3.5/3.6, MoE pour CPU, reclasseur, OCR, voix en français
- [Visuels](docs/fr/VISUELS.md) — glaner, pas dessiner : taxonomie des vues, licences, couverture mesurée ; et produire : les schémas sont du code (schemdraw, WireViz, KiCad, OpenSCAD), la diffusion illustre seulement
- [Hébergement des ZIM construits par Arche](docs/fr/HEBERGEMENT.md) · [Distribution décentralisée](docs/fr/DISTRIBUTION.md) · [Communauté](docs/fr/COMMUNAUTE.md)
- [Zones grises : ce que la loi permet pour soi](docs/fr/ZONES-GRISES.md) · [Sauvegarde d'urgence](docs/fr/SAUVEGARDE-URGENTE.md)
- [Le terrain et le calcul](docs/fr/TERRAIN-ET-CALCUL.md) — cartes drone, LiDAR, satellite, caméras, capteurs dans l'inventaire ; le temps s'adapte à la machine, jamais les capacités ; la file de tâches qui survit aux coupures
- [Brancher votre client IA (MCP)](docs/fr/CLIENTS-IA.md) — Arche est un serveur pour Open WebUI, OpenCode, Jan… (hors ligne, modèle local) — pas un client de plus
- [L'IA locale comme interface](docs/fr/assistant-ia.md)
- [Contribuer](CONTRIBUTING.md)

### Licence

Le code et le catalogue sont sous [licence MIT](LICENSE). Chaque ressource téléchargée garde **sa
propre licence**, indiquée dans le catalogue (`license.spdx`, `license.redistribution`).

Le projet est gratuit. Si Arche vous est utile : ☕ *(lien de don à ajouter)*.

---

## English

Arche builds a **"local web"** on an ordinary disk: a library of human knowledge (Wikipedia,
medicine, repair, farming, energy…), **local AI** and **tools**, all usable **without any
connection**. For a long outage, a dead zone, or simply to stop depending on the network.

The principle: **software in service of the physical world** — grow, heal, repair, build,
communicate. Not the other way round.

### What this repository contains (and doesn't)

Arche is not one more piece of software: it is a **knowledge base** — hundreds of reference corpora,
indexed and hosted on Internet Archive, plus your own documents — served over MCP to any lightweight
model running offline (ADR 0013). Arche owns two roles and only two — **an aggregator, plus a RAG** (ADR 0015): no appliance, no client, nothing hosted that exists elsewhere, always the latest stable from upstream. This repository is an **orchestrator**: a catalog of resources plus
what it takes to download from the **official sources** (Kiwix, GitHub, Ollama, Hugging Face…), index,
serve and expose. It contains **no** content. For sources that don't exist as ZIMs, Arche builds and hosts the file itself (on Internet
Archive) — only when the license or the author allows it, never otherwise. Users never crawl
anything. Details: [HOSTING.md](docs/en/HOSTING.md).

### Three ways to use it

| You are… | Do… |
|---|---|
| **A beginner, never opened a terminal** | Download the executable from the [latest release](../../releases), double-click, answer three questions. → [Beginner guide](docs/en/guide-beginner.md) |
| **Comfortable with computers** | `npx arche` or `git clone` + `npm i && npm run build`, then `arche plan` / `arche download` with an `arche.yaml`. → [Expert guide](docs/en/guide-expert.md) |
| **Low-tech / paper** | The *low-tech* profile lists what can be printed and bound. → [Low-tech guide](docs/en/guide-low-tech.md) and [printable sheets](docs/printables/en/) |

```bash
npm install && npm run build
node dist/cli.js                 # interactive wizard
node dist/cli.js serve --open    # web UI + supervised kiwix-serve, Ollama, Gitea (no Docker)
node dist/cli.js project plan examples/inventaire-potager.yaml --year 2027   # "these seeds, these plots" → calendar + plots + yields
node dist/cli.js mcp             # MCP server: plug in YOUR offline AI client (Open WebUI, OpenCode, Jan…)
node dist/cli.js compute estimate --model qwen3.6:27b --ram 8   # "≈ 1 h 27 and 65 Wh on this machine" — never "impossible"
node dist/cli.js index add ~/Books/beekeeping-manual.pdf         # your PDFs, ebooks, notes: indexed, searchable offline
node dist/cli.js index fetch                                     # published shards of installed corpora (Internet Archive)
node dist/cli.js eval                                            # what retrieval actually finds, measured: recall@5 per channel, guard rails, negatives
```

### Documentation

- [Knowledge base](docs/en/KNOWLEDGE-BASE.md) · [Provenance or nothing](docs/en/PROVENANCE.md) · [Evaluation](docs/en/EVAL.md) · [MVP](docs/en/MVP.md) · [Competition](docs/en/COMPETITION.md) · [Architecture](docs/en/ARCHITECTURE.md) · [Decisions needed](docs/en/DECISIONS.md) · [Blind spots](docs/en/BLIND-SPOTS.md) · [Self-reliance gaps](docs/en/SELF-RELIANCE-GAPS.md) · [Printable sheets](docs/printables/en/) · [Freshness](docs/en/FRESHNESS.md) · [Operating systems](docs/en/OPERATING-SYSTEMS.md) · [No Docker](docs/en/NO-DOCKER.md) · [Mirrors](docs/en/MIRRORS.md) · [Models](docs/en/MODELS.md) · [Visuals](docs/en/VISUALS.md) · [Hosting](docs/en/HOSTING.md) · [Distribution](docs/en/DISTRIBUTION.md) · [Community](docs/en/COMMUNITY.md) · [Grey areas](docs/en/GREY-AREAS.md) · [Emergency rescue](docs/en/EMERGENCY-RESCUE.md) · [Field & compute](docs/en/FIELD-AND-COMPUTE.md) · [AI clients (MCP)](docs/en/AI-CLIENTS.md) · [Local AI as an interface](docs/en/ai-assistant.md) · [Contributing](CONTRIBUTING.md)

### License

Code and catalog are [MIT](LICENSE). Every downloaded resource keeps **its own license**, stated in
the catalog (`license.spdx`, `license.redistribution`).
