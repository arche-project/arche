# Manifestes visuels / Visual manifests

Un fichier par concept : ce qu'il faut **voir** pour le comprendre ou le reconnaître, vue par vue
(`knowledge/views.yaml`), et les fichiers libres qui couvrent chaque vue — avec licence, auteur,
source et provenance. Rien n'est dessiné ici : on glane (Wikimedia Commons d'abord), on vérifie, on
mesure.

```
npx tsx scripts/visuals/commons.ts catalog/visuals/fungus/amanita-phalloides.yaml --write   # propose des candidats
arche visuals coverage            # % de vues requises couvertes, par domaine
arche visuals validate            # licences, provenance, règle « diagnostique = photo réelle »
```

Règle absolue : une vue **diagnostique** (ce qui sert à identifier) n'admet que `photo`,
`micrograph` ou `plate`. Jamais `generated`. On n'identifie pas une amanite sur un dessin d'IA.

One file per concept; views come from `knowledge/views.yaml`; every file carries licence, author,
source and provenance. Diagnostic views admit real photographs and plates only — never generated.
