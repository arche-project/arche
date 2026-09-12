# Recettes de miroir / Mirror recipes

Une recette décrit **comment copier la partie utile** d'un dépôt de paquets : type (`apt`, `apk`),
URL, branche, architectures, et la liste courte des paquets racine. Arche calcule la **fermeture
de dépendances** (`src/core/mirror/packages.ts`) pour que `apt install` / `apk add` réussissent
hors ligne — et rien de plus.

```
arche mirror plan catalog/mirrors/alpine.yaml --arch x86_64     # combien, quoi, quelle taille
arche mirror plan catalog/mirrors/debian.yaml --arch arm64 --urls debian-arm64.txt
```

Trois recettes de référence sont fournies ; **ajoutez la vôtre** : un fichier ici, une ressource
dans `catalog/resources/operating-systems.yaml` qui la référence, et le tracker de fraîcheur la suit.
Voir `docs/fr/MIROIRS.md`.

A recipe describes how to copy the useful part of a package repository. Arche computes the
dependency closure so offline installs succeed. Three reference recipes; add yours.
