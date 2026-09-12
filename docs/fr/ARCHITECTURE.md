# Architecture d'Arche

> Version anglaise : [docs/en/ARCHITECTURE.md](../en/ARCHITECTURE.md). Décisions détaillées : [docs/adr/](../adr/).

## 1. Le problème en une phrase

Rendre accessible, sur une machine ordinaire et sans réseau, des centaines de gigaoctets de savoir et
d'outils **sans jamais les héberger nous-mêmes**, pour trois publics qui n'ont ni le même matériel ni
le même vocabulaire.

## 2. Principes

1. **Orchestrateur, pas hébergeur.** Le dépôt pèse quelques Mo. Il décrit *où* et *comment* obtenir
   chaque ressource depuis son éditeur officiel. Aucune redistribution de contenu tiers.
2. **Dégradation gracieuse.** Tout ce qui peut fonctionner hors-ligne fonctionne hors-ligne :
   la validation du catalogue, le calcul du plan, la vérification d'intégrité, l'interface web,
   l'import depuis une clé USB. Seul le téléchargement initial exige le réseau.
3. **Le moins de dépendances possible.** Deux dépendances d'exécution (`commander`, `yaml`).
   Pas de framework web, pas de serveur de base de données, pas de bibliothèque de validation : le
   validateur JSON Schema fait 70 lignes. Un kit de survie doit pouvoir être recompilé dans dix ans.
   Le seul format binaire du projet est SQLite — intégré à Node 22 (`node:sqlite`) et lisible par
   tout le reste du monde ([ADR 0014](../adr/0014-format-sqlite.md)).
4. **Un seul fichier d'état, lisible.** `<bibliothèque>/.arche/state.json`. On peut le lire, le
   copier, le corriger à la main.
5. **Chaque choix est expliqué.** Le recommandeur produit une *raison* par ligne
   (« indispensable », « recommandé, tient sur le disque », « remplacé par… »). Pas de magie.
6. **La même logique pour tous les publics.** Le wizard interactif, l'interface web et le fichier
   `arche.yaml` appellent exactement la même fonction `plan()`. Le néophyte et l'expert obtiennent la
   même sélection pour les mêmes réponses.

## 3. Arborescence

```
arche/
├── catalog/                     # LE cœur du projet : la connaissance de « quoi télécharger où »
│   ├── schema/                  # JSON Schema (contrat) : resource.schema.json, profile.schema.json
│   ├── resources/               # une liste YAML par thème (encyclopedia, practical, technical, ai-models,
│   │                            #   software, git-mirrors, toolchains, maps-and-printables)
│   ├── profiles.yaml            # profils utilisateurs, presets matériels, paliers IA
│   └── bundles.yaml             # paquets thématiques (core, health, homestead, ai, maker…)
├── src/
│   ├── cli.ts                   # point d'entrée : `arche` = wizard ; sous-commandes scriptables
│   ├── commands/                # init (wizard), plan, download, verify, serve, export/import, catalog
│   ├── core/
│   │   ├── catalog.ts           # chargement YAML + validation + dépendances
│   │   ├── schema.ts            # validateur JSON Schema minimal (zéro dépendance)
│   │   ├── recommend.ts         # profil + matériel + budget → plan expliqué
│   │   ├── hardware.ts          # détection OS/arch/RAM/GPU/disque/outils/en-ligne
│   │   ├── downloader.ts        # reprise HTTP Range, .part, checksums, dispatch kiwix/github/ollama/git
│   │   ├── kiwix.ts             # client OPDS Kiwix (nom stable → URL datée + taille)
│   │   ├── integrity.ts         # sha256/md5 en streaming, fichiers sidecar
│   │   ├── state.ts             # state.json (écriture atomique)
│   │   ├── config.ts            # arche.yaml (mode expert)
│   │   ├── prompts.ts           # prompts terminal sans dépendance
│   │   ├── i18n.ts              # locales/fr.json, en.json
│   │   └── rag/                 # la base de connaissance : extract, chunk, embed, sqlite (format ADR 0014), build (writer), retrieve (lecteur : FTS5 + cosinus + Xapian), fuse
│   └── web/
│       ├── server.ts            # node:http : API JSON + SSE + fichiers statiques
│       └── static/index.html    # interface web (un fichier, vanilla JS, bilingue)
├── scripts/catalog/             # mise à jour automatique (Kiwix OPDS, GitHub, Ollama/HF, liens morts)
├── .github/workflows/           # ci.yml, catalog-update.yml (PR auto), release.yml (exécutables)
├── locales/                     # chaînes FR/EN de la CLI
├── config/arche.example.yaml    # config déclarative commentée
├── docs/{fr,en}/                # guides par profil, décisions, angles morts
├── docs/printables/{fr,en}/     # fiches imprimables (profil low-tech)
├── docs/adr/                    # Architecture Decision Records
└── tests/                       # node:test
```

Ce qui **n'est jamais** dans le dépôt : `library/` (les téléchargements), `.arche/` (l'état), `*.part`.

## 4. Le catalogue

### 4.1 Une ressource

Chaque entrée de `catalog/resources/*.yaml` est validée par `catalog/schema/resource.schema.json`.
Champs clés :

| Champ | Rôle |
|---|---|
| `id` | slug stable, jamais réutilisé |
| `type` | `zim` · `ai-model` · `git-repo` · `toolchain` · `pdf` · `software` · `dataset` · `map` |
| `category` | thème (medical, water, energy, electronics…) — sert au tri de l'interface |
| `name`, `description`, `notes` | objets `{fr, en}` obligatoires |
| `languages` | codes ISO ou `mul` |
| `profiles` | `bunker` / `lowtech` / `novice` : pour qui cette ressource a du sens |
| `priority` | `essential` (toujours coché) · `recommended` (coché si ça tient) · `optional` |
| `size_bytes` / `size_estimate_gb` | exact (rempli par l'updater) / estimation humaine |
| `source` | `kind` + identifiants stables : `kiwix_name`, `github_repo` + `github_asset_pattern`, `ollama_model`, `hf_repo`/`hf_file`, `url` |
| `checksum` | `algo`, `value`, ou `url` d'un fichier sidecar |
| `license` | `spdx` + `redistribution` (`allowed`, `allowed-nc`, `attribution`, `forbidden`, `unclear`) |
| `requires` | disque, RAM, VRAM, GPU, OS, arch, outils sur le PATH |
| `depends_on` / `provides` | graphe de dépendances (un ZIM dépend de `kiwix-tools`) |
| `printable` | existe-t-il une version papier ? |
| `update.tracker` | quel script d'updater le suit |
| `status` | `active` · `unverified` (saisi à la main) · `deprecated` · `missing` (disparu en amont) |
| `reliability` | confiance éditoriale : `reference`, `curated`, `community`, `unknown` |

Pourquoi YAML et pas JSON : les commentaires. Les fichiers de ressources sont *lus par des humains*
et *réécrits par des robots* ; la bibliothèque `yaml` préserve les commentaires au round-trip.

### 4.2 Profils, presets, paliers IA (`profiles.yaml`)

- **Profils** : ce qu'on montre, ce qu'on cache (`hide_types`, `hide_categories`), quelles priorités
  sont cochées par défaut, et la part de disque libre qu'on s'autorise (`disk_budget_ratio`).
- **Presets matériels** : « portable + SSD USB », « Raspberry Pi 5 », « PC avec GPU », « vieux
  portable ». Ils remplacent la détection quand l'utilisateur prépare un disque pour une autre machine.
- **Paliers IA** : `tiny` (4 Go) → `xlarge` (64 Go RAM ou 24 Go VRAM). Le plus grand palier satisfait
  gagne ; son premier modèle devient le modèle de chat par défaut.

### 4.3 Bundles (`bundles.yaml`)

Des paquets thématiques que le wizard propose d'un bloc. Un bundle n'a pas de priorité : le cocher
coche ses ressources. Le bundle `ai` est *dynamique* : il ajoute les modèles du palier détecté.

## 5. Le recommandeur (`src/core/recommend.ts`)

Entrées : catalogue, matériel (détecté ou preset), options (profil, langues, bundles, include/exclude,
budget). Sortie : une liste d'items `{resource, sizeGb, selected, reason}` + avertissements.

Règles, dans l'ordre :

1. **Filtre dur** : profil, OS/arch, RAM/VRAM requises, `status` ≠ `deprecated|missing`. Ce qui ne
   passe pas n'apparaît pas. Les ressources dans une langue non demandée restent visibles mais
   jamais cochées.
2. **Palier IA** → seuls les modèles du palier apparaissent (les autres via `include` explicite).
3. `include` et bundles explicites → cochés.
4. **Essentiels** → cochés même si le budget explose (on prévient).
5. Modèle IA par défaut du palier.
6. **Recommandés, petits d'abord**, tant que le budget tient. 20 petites ressources utiles valent
   mieux qu'une seule énorme.
7. **Substitutions** : si `wikipedia-fr-maxi` tient dans ce qui reste, il remplace `wikipedia-fr-nopic`.
8. Optionnels (profil bunker seulement, < 30 Go chacun).
9. `exclude` gagne toujours.
10. Dépendances : cocher une ressource coche ses `depends_on`.

Le budget par défaut = espace libre × `disk_budget_ratio` du profil (60 % pour un néophyte : il faut
laisser de la place aux mises à jour et aux modèles qui grossissent).

## 6. Le wizard : trois interfaces, une logique

| Interface | Commande | Public |
|---|---|---|
| **Terminal interactif** | `arche` (ou `arche init`) | néophyte ; questions numérotées, aucune notion technique |
| **Web local** | `arche serve` → http://localhost:8765 | néophyte / famille ; même parcours, plus confortable ; SSE pour la progression |
| **Déclaratif** | `arche plan|download --config arche.yaml -y` | expert ; scriptable, reproductible, CI-able |

Le parcours néophyte pose **trois questions** (profil, cible, langues) plus une case « quels sujets
voulez-vous absolument » ; tout le reste est déduit. Ce qu'on lui cache : les ids, les types, les
licences, les tailles exactes, les URL, le palier IA. Ce qu'on lui montre quand même : le total en Go,
la barre de budget, et *pourquoi* chaque ligne est cochée. Le mode expert (case à cocher dans l'UI,
`--lang`/`--include` dans la CLI) révèle ids, licences, réglages RAM/VRAM et l'export `arche.yaml`.

## 7. Téléchargement, reprise, intégrité, hors-ligne

- **Résolution** : un `kiwix_name` stable est traduit à l'exécution en URL datée via l'OPDS Kiwix
  (`library.kiwix.org/catalog/v2/entries?name=…`). Une release GitHub est résolue via
  `/releases/latest` + `github_asset_pattern` + heuristique de plateforme. Ollama et Git délèguent
  aux binaires (`ollama pull`, `git clone --mirror`).
- **Reprise** : téléchargement dans `<fichier>.part` avec en-tête `Range`. Un serveur qui ignore
  `Range` (200 au lieu de 206) fait repartir de zéro proprement. 5 tentatives avec backoff exponentiel.
- **Intégrité** : sha256 (ou md5) en streaming. Le checksum attendu vient, dans l'ordre, du catalogue,
  d'un fichier sidecar `<url>.sha256` / `.md5`, sinon on compare la taille annoncée. Échec →
  fichier supprimé, erreur remontée. `arche verify` re-hache tout, hors-ligne, et `--fix` purge les
  entrées corrompues pour que `arche download` les reprenne.
- **Atomicité** : `.part` → `rename()` après vérification ; `state.json` écrit via fichier temporaire.
  Une coupure de courant laisse au pire un `.part` reprenable.
- **Ordre** : logiciels d'abord (Kiwix, Ollama), puis du plus petit au plus gros. On a vite quelque
  chose d'utilisable.
- **Git** : `clone --mirror` + `remote update --prune` à la reprise, wiki en dépôt séparé
  (`<repo>.wiki.git`), binaires de release à part, et un `git bundle --all` (fichier unique,
  copiable, restaurable avec `git clone fichier.bundle`).
- **Ollama** : `OLLAMA_MODELS` pointe vers `<bibliothèque>/models/ollama` pour que les poids vivent
  sur le disque externe, pas dans le home.
- **Machine déjà hors-ligne** : `arche export --to /media/usb` copie bibliothèque + état + dépôt
  Arche (et l'exécutable s'il existe) ; `arche import --from /media/usb` sur la machine cible.
  Puis `arche serve` fonctionne sans réseau. La détection `online` est un simple HEAD sur
  library.kiwix.org avec timeout 3 s.

## 8. Choix techniques (résumé — détails dans `docs/adr/`)

| Choix | Pourquoi | Prix à payer |
|---|---|---|
| **Node 22 + TypeScript** | choix de Florian ; `fetch`, `statfs`, `readline/promises`, `node:test` natifs → très peu de dépendances ; Node est déjà partout (Pi inclus) | un runtime de ~100 Mo ; pour le néophyte on livre un **exécutable SEA** (`scripts/build-sea.sh`, workflow `release.yml`) |
| **2 dépendances d'exécution** | résilience : recompilable dans dix ans avec un vieux Node | on a réécrit prompts + validateur (~150 lignes) |
| **YAML pour le catalogue** | commentaires, lisibilité, round-trip par l'updater | un peu plus lent à parser que JSON (non mesurable ici) |
| **JSON Schema comme contrat** | validable par n'importe quel outil, y compris sans Arche | deux validateurs (maison en exécution, Ajv en CI) |
| **Pas de framework web** | `node:http` + un HTML suffisent ; l'UI doit tourner sur un Pi et rester lisible dans dix ans | pas de composants réutilisables |
| **SSE plutôt que WebSocket** | natif, unidirectionnel, suffisant pour la progression | — |
| **state.json** plutôt que SQLite | lisible, copiable, pas de binaire natif | pas de requêtes complexes (inutiles ici) |
| **Une base SQLite par corpus** (`<id>.arche.sqlite`, [ADR 0014](../adr/0014-format-sqlite.md)) | texte des chunks, FTS5, vecteurs par modèle et licence héritée dans un seul fichier lisible avec `sqlite3` seul, en 2040 ; ajouter un modèle d'embedding ne republie rien ; `node:sqlite` est dans Node 22 | le texte est dupliqué hors du ZIM (le disque est bon marché, le couplage non) ; `ExperimentalWarning` sur Node 22 |
| **Portabilité** | Windows/macOS/Linux x64+arm64 : CI matrice 3 OS + job ARM64 ; chemins via `node:path` ; `which`/`where` ; `start`/`open`/`xdg-open` | Windows ARM non testé |

## 9. Mise à jour automatique du catalogue

Voir `scripts/catalog/` et `.github/workflows/catalog-update.yml`. Chaque lundi :
`check-kiwix` (OPDS complet → URL, taille, version, `missing`), `check-github` (releases, commits,
dépôts archivés → `deprecated`), `check-models` (registre Ollama, API HF `paths-info` avec sha256,
liste des nouveaux modèles populaires), `check-links` (HEAD sur toutes les URL ; seuls 404/410
passent en `missing`, les 403/429 sont juste rapportés). Puis validation et PR
`catalog/auto-update` avec un tableau des changements et une checklist de revue. Rien n'est mergé
sans un humain.

## 10. Ce que cette architecture ne résout pas

Voir [ANGLES-MORTS.md](ANGLES-MORTS.md). En particulier : l'absence de ZIM pour plusieurs sources FR
majeures (Low-tech Lab, Open Source Ecology, WikiHow disparu), la dépendance à Kiwix comme point de
défaillance unique, et la lecture du format ZIM dans dix ans — c'est pour ce dernier point que le
texte indexé vit aussi dans une base SQLite par corpus ([ADR 0014](../adr/0014-format-sqlite.md)),
lisible sans Kiwix et sans Arche.
