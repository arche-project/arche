# Provenance ou rien — `knowledge/` dit d'où vient chaque nombre

> L'[audit](AUDIT-ARCHITECTURE.md) (erreur 4) : « la connaissance a été écrite, pas extraite — des
> centaines de chiffres rédigés par une IA en une journée, marqués `verified: false` ». C'est le
> mécanisme que le projet existe pour empêcher, en YAML. Décision 2 : **aucune ligne de `knowledge/`
> sans locator vérifiable ; `verified` calculé, pas déclaré.** Ce document est la règle, le format,
> et la commande qui l'applique (ticket M4-1). English: [PROVENANCE.md](../en/PROVENANCE.md)

## La règle, en une phrase

Toute **valeur numérique** de `knowledge/*.yaml` porte `source: { resource, path, quote }` — un locator
vers un article du corpus et la phrase qui y donne le chiffre — ou, en période de grâce,
`unsourced: true`, explicite, compté et publié dans le README. Rien d'autre n'est admis :
`npm run catalog:validate` et `tests/knowledge.test.ts` refusent une valeur nue, et `verified` n'est
**jamais** écrit à la main — `arche knowledge verify` le calcule en ouvrant les shards installés.

## Le format

```yaml
water:
  litres_per_person_day:
    # Une valeur porte sa provenance : un locator + la citation qui donne le chiffre.
    sphere_minimum:
      value: 15
      source:
        resource: pdf-sanitation-sphere-handbook        # id du catalogue (catalog/resources/)
        path: p12                                       # article dans le shard (articles.path)
        quote: "minimum of 15 litres per person per day"  # ≥ 12 caractères, telle qu'elle est dans l'article
        where: "WASH, standard 2.1"                     # facultatif : repère humain
    # Période de grâce : explicite, comptée. À remplacer par un locator, ou retirer (M4-2).
    frugal: { lo: 30, hi: 50, unsourced: true }

# Un bloc couvre les valeurs qu'il contient — utile pour des nombres nus ou une fiche entière
# tirée d'un même article. Une déclaration plus proche l'emporte.
stores_kg_per_person_year:
  unsourced: true
  grain: 180
  pulses: 30
```

Ce que le validateur (`src/core/knowledge.ts`) applique, mécaniquement :

- **Une valeur** = un nombre, nu (`grain: 180`) ou dans un objet de fourchette (`value`, `lo`, `hi`,
  `planning`). Les chaînes et les booléens ne sont pas vérifiés : on ne sait pas juger une phrase
  à la machine ; un chiffre, si. Une affirmation qui compte se réécrit comme une valeur, ou va dans
  une `note` sous un bloc sourcé.
- **La provenance se déclare sur un objet** (`source` ou `unsourced`) et couvre tous les nombres
  en dessous, sauf déclaration plus proche. Pas à la racine du fichier : la grâce doit être visible
  à côté de ce qu'elle couvre.
- `source` = `{ resource, path, quote }` ; `resource` existe dans le catalogue ; `quote` fait au
  moins 12 caractères (une citation trop courte se retrouve partout et ne prouve rien). `where` est
  libre. `source` en texte libre (`source: "Sphere 2018"`) est refusé : ce n'est pas un locator.
- `unsourced` vaut exactement `true` ; `source` et `unsourced` s'excluent.
- `verified` écrit à la main, n'importe où : refusé.
- Clés de tête qui ne sont pas des faits et ne sont pas parcourues : `version`, `updated`,
  `climate`, `uncertainty`, `defaults`, `sources` (bibliographie de lecture), `aliases`.
- Fichiers concernés : tous les `knowledge/*.yaml` de tête, sauf `eval.yaml` (son propre schéma et
  ses propres locators par question, [EVAL.md](EVAL.md)). `knowledge/projects/` sont des recettes
  (ADR 0010), pas des faits. `views.yaml` est parcouru et ne porte aucun nombre.

## Écrire un locator

1. Trouver l'article : `search` (MCP) ou `arche eval` rendent des passages dont l'identifiant est le
   locator `resource/path#offset` de la vue `passages` ([ADR 0014](../adr/0014-format-sqlite.md)).
   `resource` et `path` sont les deux premiers morceaux ; l'offset n'est pas demandé, la citation
   suffit et survit à un rechunking.
2. Copier la phrase **telle qu'elle est** dans l'article (`read_article`, ou
   `sqlite3 corpus.arche.sqlite "SELECT text FROM passages WHERE path = '…'"`). La vérification
   ignore la casse, les accents et les espaces multiples — rien d'autre.
3. Remplacer `unsourced: true` par le bloc `source`. Si aucun article du corpus ne donne le chiffre,
   la valeur n'a rien à faire dans `knowledge/` : on la retire (M4-2 dit lesquelles et pourquoi).

Une citation qui résout prouve **d'où vient** le chiffre, pas qu'il est juste : c'est le corpus qui
répond de ça, et c'est exactement ce qu'on veut — un modèle qui cite, pas un modèle qui sait.

## `arche knowledge verify`

```
$ arche knowledge verify [--library <dir>] [--json] [--write README.md]
`knowledge/` : 0 valeurs sourcées / 445 (445 en période de grâce `unsourced: true`)
  compute.yaml     47 valeurs · 0 sourcées · 47 unsourced
  crops.yaml      218 valeurs · 0 sourcées · 218 unsourced
  figures.yaml    180 valeurs · 0 sourcées · 180 unsourced
  views.yaml        0 valeurs · 0 sourcées · 0 unsourced
sources : 0 déclarées · 0 vérifiées · 0 fausses · 0 sans shard installé
```

Pour chaque `source` distincte, la commande ouvre `<bibliothèque>/index/<resource>.arche.sqlite`,
reconstitue l'article `path` et cherche `quote`. Quatre états, tous affichés sauf le premier :

| État | Sens | Code de sortie |
|---|---|---|
| `verified` | article trouvé, citation trouvée | 0 |
| `mismatch` | article trouvé, citation absente : la source ment ou l'article a changé | **1** |
| `no-article` | le shard est installé mais `path` n'y est pas | **1** |
| `no-shard` | corpus non installé : compté, pas un échec (on ne peut pas savoir) | 0 |

Une valeur sans provenance est un problème structurel : code 1 aussi, ici comme dans
`catalog validate`. `--json` rend le rapport complet (valeurs par fichier, sources et leur état,
problèmes). `--write README.md` réécrit le bloc `<!-- knowledge --> … <!-- /knowledge -->` du README
— *N valeurs sourcées / total* — et rien d'autre ; `tests/knowledge.test.ts` vérifie que le README
n'est pas en retard sur les fichiers.

`verified` n'est donc écrit nulle part dans `knowledge/` : c'est une sortie de commande, différente
sur chaque machine selon les shards qu'elle a. La CI n'a pas de shard publié avant M4-3 ; elle
applique la règle structurelle (chaque valeur a un locator ou une grâce) et rejouera `verify` sur les
vingt premiers shards dès qu'ils existent.

## Ce que ça change pour le code qui lit ces fichiers

Les lecteurs (`figures.ts`, `compute.ts`, `garden.ts`) lisent les mêmes clés qu'avant ; un marqueur de
bloc est une clé de plus qu'ils ignorent (`stock_un_an` ne somme que les nombres). Deux nombres nus de
tête de `compute.yaml` sont devenus des objets `{ value }`. Le planificateur de parcelles signale une
fiche `unsourced` d'un astérisque (à la place de l'ancien `verified: false` écrit à la main).

## L'état, et la suite

Au 12 septembre 2026 : **0 valeur sourcée sur 445**, toutes en grâce explicite — le chiffre exact
de ce que l'audit décrivait, désormais mesuré et publié plutôt que dit. M4-2 rattache
`figures.yaml`, `crops.yaml` et `compute.yaml` à leurs sources (OpenFarm pour les cultures ; Sphère,
OMS, les manuels pour les figures ; fiches constructeur ou mesure datée pour le calcul) ou retire les
valeurs ; l'objectif est 0 `unsourced` dans `figures.yaml` et `crops.yaml`. M4-4
(`knowledge/methods/`) naît sous la même règle.
