# Contribuer / Contributing

**FR** — La contribution la plus utile est une **entrée de catalogue** : une ressource libre, officielle, utile hors-ligne.

1. Copiez une entrée voisine dans `catalog/resources/<fichier>.yaml`, remplissez `name`/`description` **en FR et EN**.
2. `source.kind` doit pointer vers la source officielle (Kiwix, GitHub, Ollama, HF…). Jamais un ré-hébergement.
3. Renseignez `license.spdx` et `license.redistribution` honnêtement (`unclear` vaut mieux qu'un mensonge).
4. Laissez `status: unverified` et `size_bytes: null` : l'updater les remplira.
5. `npm test && npm run catalog:validate` doit passer.
6. Une PR = une ressource ou un thème. Expliquez **pourquoi** c'est utile sans réseau.

Ce qu'on refuse : contenus sous licence non-libre sans accord, sites vivants sans licence claire, contenus dont la fiabilité n'est pas établie (santé, sécurité) sans source de référence.

## Champs sensibles : relecture à deux, jamais de fusion automatique

Le catalogue est la racine de confiance de tout ce qu'Arche télécharge. Cinq champs décident de **ce qui est téléchargé et d'où** : `source.*` (url, mirrors, torrent, magnet, ia_item…), `checksum.*`, `size_bytes`, `license.*` et `index.url` / `index.sha256` / `index.size_bytes`. Une URL ou un hachage changé et fusionné sans regard humain, c'est une base empoisonnée livrée à tout le monde (audit, erreur 7).

- Le workflow `catalog-review.yml` compare ces champs avec la branche cible sur chaque PR qui touche `catalog/` et pose l'étiquette **`catalog-sensitive`** ; `catalog-update.yml`, `zim-build.yml` et `index-build.yml` la posent eux-mêmes sur les PR qu'ils ouvrent, avec le tableau des champs en tête du corps de la PR. Le script est `scripts/catalog/sensitive-diff.ts` ; en local : `npx tsx scripts/catalog/sensitive-diff.ts --base origin/main`.
- **Règle des deux paires d'yeux** : une PR `catalog-sensitive` est fusionnée seulement après que **deux humains** l'ont relue — l'auteur et un relecteur pour une PR humaine, deux relecteurs pour une PR ouverte par un robot. Le relecteur **ouvre l'URL sur la source officielle** (pas un miroir), **recoupe le hachage** (fichier `.sha256` de l'éditeur, page de release, ou `sha256sum` sur un téléchargement) et vérifie qu'une chute de `size_bytes` n'est pas un fichier substitué. Une PR robot `catalog-sensitive` sans relecteur reste ouverte ; elle n'expire jamais en fusion.
- **Aucun workflow ne fusionne** : les robots proposent, les humains fusionnent. Tant que le projet n'a qu'un mainteneur, il fait lui-même la vérification ci-dessus avant de fusionner et note dans la PR ce qu'il a ouvert et recoupé ; la règle devient une protection de branche (deux approbations sur `catalog-sensitive`) dès qu'un second curateur existe.

## Connaissance : provenance ou rien

Un chiffre dans `knowledge/*.yaml` (figures, cultures, calcul) porte `source: { resource, path, quote }` — l'article du corpus et la phrase qui le donne — ou, en période de grâce, `unsourced: true`, explicite et compté dans le README. Pas de `verified` écrit à la main : `arche knowledge verify` le calcule contre les shards installés, et `npm run catalog:validate` refuse une valeur nue. Format et commande : [docs/fr/PROVENANCE.md](docs/fr/PROVENANCE.md). Après avoir touché `knowledge/` : `npx tsx src/cli.ts knowledge verify --write README.md`.

**EN** — Every number in `knowledge/*.yaml` carries `source: { resource, path, quote }` or an explicit, counted `unsourced: true`; `verified` is never hand-written (`arche knowledge verify` computes it against installed shards) and `catalog:validate` rejects a bare value. See [docs/en/PROVENANCE.md](docs/en/PROVENANCE.md); after editing `knowledge/`, run `npx tsx src/cli.ts knowledge verify --write README.md`.

Code : TypeScript strict, zéro dépendance ajoutée sans discussion (voir `docs/adr/`). Les chaînes visibles passent par `locales/`.

**EN** — The most useful contribution is a **catalog entry**: a free, official resource useful offline. Copy a neighbouring entry in `catalog/resources/`, fill `name`/`description` **in FR and EN**, point `source` to the official publisher (never a re-host), state the license honestly, leave `status: unverified` and `size_bytes: null` (the updater fills them), make `npm test && npm run catalog:validate` pass, one PR per resource or theme, explain **why** it matters offline.

**Sensitive fields — two-person review, never auto-merged.** `source.*`, `checksum.*`, `size_bytes`, `license.*` and `index.url` / `index.sha256` / `index.size_bytes` decide what is downloaded and from where. Any PR changing them gets the **`catalog-sensitive`** label (`catalog-review.yml` on human PRs; `catalog-update.yml`, `zim-build.yml`, `index-build.yml` label their own PRs and list the fields at the top of the PR body; script: `scripts/catalog/sensitive-diff.ts`). Such a PR is merged only after **two humans** have reviewed it — author + reviewer for a human PR, two reviewers for a robot PR; the reviewer opens the URL at the official source and cross-checks the hash. No workflow ever merges: robots propose, humans merge.

Code: strict TypeScript, no new dependency without discussion (see `docs/adr/`). User-facing strings go through `locales/`.
