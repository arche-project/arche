# Fraîcheur : le catalogue ne vaut que par sa date

> « Notre travail n'a de valeur que s'il est souvent mis à jour. » Ce document dit comment on rend
> cette phrase vraie, mesurable, et impossible à laisser dériver en silence.
> English: [FRESHNESS.md](../en/FRESHNESS.md)

## Le problème qu'on résout

Un catalogue de 260 ressources qui pointe vers des versions d'il y a dix-huit mois n'est pas
« un peu vieux » : il est faux. Le ZIM a changé d'URL, la release a été retirée, le modèle Ollama a
été republié avec d'autres poids, la distribution ROS est passée en fin de vie. Et personne ne s'en
aperçoit, parce qu'un catalogue périmé ressemble exactement à un catalogue à jour — jusqu'au jour
où quelqu'un, hors ligne, découvre que ce qu'il a téléchargé ne correspond à rien.

Trois choses sont donc nécessaires, et aucune ne suffit seule : une **politique** claire de ce qu'on
appelle « à jour », des **vérificateurs** qui l'appliquent pour chaque écosystème, et une **mesure**
qui échoue bruyamment quand ils cessent de tourner.

## « Dernière version » n'est pas « dernière version stable »

C'est la nuance qui décide de tout. La version la plus récente d'un projet est souvent une `rc`, une
`beta`, un `nightly`, un `rolling`. Mettre ça sur le disque de quelqu'un qui n'aura pas de réseau
pour corriger est une faute, pas une audace.

La politique est écrite une seule fois, dans `src/core/versions.ts`, et partagée par tous les
vérificateurs — pour qu'aucun n'ait sa propre idée de « stable » :

| `update.stability` | Ce qu'on retient |
|---|---|
| **`stable`** (défaut) | la plus haute version sans marqueur de prérelease — `rc`, `beta`, `alpha`, `dev`, `a1`/`b2` (PEP 440), `nightly`, `preview`, `rolling`, `testing`… |
| `lts` | la plus haute LTS quand l'écosystème a cette notion (Node, ROS 2, Ubuntu) ; sinon repli sur `stable`, **signalé** |
| `any` | la plus haute, prérelease comprise — réservé aux ressources qui le demandent explicitement |

Deux cas font remonter une note dans la PR plutôt qu'une décision automatique : un projet qui n'a
**jamais** publié de version finale (on rend la plus haute prérelease, en le disant), et une LTS
demandée mais introuvable. L'automate propose ; il ne distribue jamais une bêta de son propre chef.

La comparaison est numérique, pas lexicale : `1.10` vient après `1.9`, et une version finale passe
devant sa propre `rc`. Ça paraît évident ; c'est le bug le plus fréquent des scripts de mise à jour.

## Un vérificateur par écosystème

| `update.tracker` | Ce qu'il lit | Ce qu'il en fait |
|---|---|---|
| `kiwix-opds` | le catalogue OPDS de Kiwix | URL datée, taille, version du ZIM |
| `github-release` | `/releases/latest` (déjà hors prérelease) | tag, date, taille de l'asset |
| `github-commit` | le dernier commit de la branche par défaut | SHA, date ; **archivé** → `deprecated` |
| `ollama`, `huggingface` | le registre de modèles | digest des poids, taille, sha256 |
| **`npm`** | `registry.npmjs.org` | `dist-tags.latest` **vérifié** (certains paquets y mettent des rc), sinon la plus haute stable |
| **`pypi`** | l'API JSON de PyPI | la plus haute stable non retirée (*yanked*) |
| **`crates`** | crates.io | idem, versions retirées exclues |
| **`dockerhub`** | les tags de l'image | tags numériques seulement — `latest`, `stable`, `edge` ne disent pas ce qu'on télécharge |
| **`rosdistro`** | `index-v4.yaml` de ros/rosdistro | la distribution suivie est-elle encore `active` ? une LTS plus récente existe-t-elle ? |
| **`node-lts`** | `nodejs.org/dist/index.json` | la ligne LTS promue, pas la version « current » |
| **`debian`** | le fichier `Release` de `stable` | version et nom de code |
| **`ubuntu-lts`** | `meta-release-lts` | dernière LTS encore supportée |
| **`raspios`** | la liste de Raspberry Pi Imager | URL, date et sha256 de l'image nommée |
| **`github-tag`** | les tags Git d'un dépôt sans « releases » | le plus haut tag stable (OpenWrt…) |
| `http-head` | l'URL source | présence, taille ; 403/429 ne sont **pas** des disparitions |

Les sept en gras sont nouveaux et viennent avec les bibliothèques de développement
(`catalog/resources/dev-registries.yaml`) : Node LTS, Python autonome, Rust, Verdaccio (npm
hors-ligne), devpi (PyPI hors-ligne), panamax (crates), Athens (Go), l'index Arduino, le miroir apt
ROS 2 de la LTS courante et sa documentation en ZIM, et deux images Docker. Un dépôt de code sans ses
dépendances ne se compile pas ; c'est ce trou-là qu'ils ferment.

Le cas ROS 2 mérite un mot : la version stable n'y est pas un numéro mais une **distribution**
(Humble, Jazzy…), et `index-v4.yaml` ne marque pas lesquelles sont LTS. On garde donc une liste
explicite, courte et commentée (`ROS2_LTS` dans `scripts/catalog/registries-parse.ts`), plutôt qu'une
heuristique sur les noms. Elle sera à compléter en 2026 quand la prochaine LTS sortira ; le
vérificateur le dira lui-même si aucune LTS active n'est reconnue.

## `checked` : la date qui rend la fraîcheur mesurable

Chaque ressource porte désormais deux dates qu'il ne faut pas confondre. `updated` est la date de la
version amont — celle du ZIM, de la release, des poids. `checked` est la date à laquelle **nous** avons
vérifié l'amont pour la dernière fois. Un vérificateur ne pose `checked` que quand l'amont a réellement
répondu : une erreur réseau, un quota dépassé, un 403 ne sont pas des vérifications.

C'est ce champ, comparé à `check_interval_days` (7 par défaut, 14 à 30 pour les registres calmes),
qui donne la mesure :

```
$ arche catalog freshness
Fraîcheur du catalogue : 0 % — 0/258 ressources vérifiées dans leur intervalle (0 périmées, 258 jamais vérifiées).
  http-head           0 / 79
  kiwix-opds          0 / 64
  github-release      0 / 58
  …
```

Ce zéro est la vraie valeur aujourd'hui : la chaîne n'a encore jamais tourné. C'est précisément ce
qu'on veut rendre visible — un catalogue qui *a l'air* à jour et un catalogue qui *est* à jour se
distinguent par ce chiffre et par rien d'autre.

## Ce qui échoue quand ça dérive

La mesure est un garde-fou, pas un tableau de bord. Trois endroits l'utilisent :

- **`catalog-update.yml`** tourne désormais **deux fois par semaine** (lundi et jeudi). Après avoir
  lancé tous les vérificateurs, il exige `catalog freshness --min 70` : si moins de 70 % des
  ressources suivies ont été vérifiées, le workflow **échoue**. Un quota GitHub épuisé, un format
  amont qui a changé, un registre qui bloque l'agent — tout cela cessait d'être silencieux.
- **`ci.yml`** vérifie que la commande fonctionne (`--min 0`) sans bloquer : le seuil n'a de sens
  qu'après les vérificateurs.
- **`catalog-update.yml`** ouvre la PR, ne la fusionne jamais (M2-3, audit erreur 7). `checked`,
  `version`, `updated` sont des faits qu'un relecteur survole ; `source.url`, `checksum`,
  `size_bytes`, `license`, `index.*` sont des champs sensibles, listés en tête de la PR et étiquetés
  `catalog-sensitive` — relecture à deux ([CONTRIBUTING.md](../../CONTRIBUTING.md)). Les notes
  `[updater …: aucune version stable]` ou `[… fin de vie]` sont des décisions et attendent un humain.

## Ce que ça ne fait pas

Vérifier n'est pas télécharger : la fraîcheur du catalogue dit que nos pointeurs sont justes, pas que
le disque de l'utilisateur l'est. La commande `arche verify` reste ce qui compare la bibliothèque
locale au catalogue. Et la fraîcheur ne juge pas la qualité : une ressource peut être vérifiée chaque
semaine et rester médiocre — ça, c'est le travail de [TROUS-AUTONOMIE](TROUS-AUTONOMIE.md).

Enfin, la mesure suppose que le dépôt vit sur GitHub avec ses workflows actifs. Tant que ce n'est pas
le cas, `freshness` restera à zéro, et il aura raison.
