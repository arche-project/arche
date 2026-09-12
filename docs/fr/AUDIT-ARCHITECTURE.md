# Audit d'architecture — les erreurs stratégiques, et ce que serait le meilleur

> Écrit le 11 septembre 2026, après une journée de pivots et treize ADR. Ce document ne défend
> rien : il cherche ce qui, dans la forme actuelle du dépôt, empêcherait Arche d'être ce qui se fait
> de mieux pour une base de connaissance hors ligne qui doit durer des décennies. Les chiffres sont
> mesurés sur le dépôt tel quel.

## L'état, en cinq nombres

6 934 lignes de TypeScript dans `src/`. 1 301 lignes de connaissance dans `knowledge/`. 316
ressources sur 316 en `status: unverified`, zéro `checked`. Zéro signature vérifiée au
téléchargement alors que l'ADR 0006 promet un catalogue signé. Zéro appel au reclasseur dans la
recherche alors qu'il est écrit et testé. Le dépôt dit « la base, pas le logiciel » (ADR 0013) et
sa forme dit l'inverse : cinq fois plus de code que de connaissance, et rien encore qui ait
rencontré le monde.

## Les erreurs, de la plus grave à la moins grave

### 1. On a construit par accumulation, jamais par soustraction

Treize ADR en une journée, et chaque pivot a *ajouté* sans rien retirer : solveurs, recettes,
superviseur, miroirs, visuels, générateurs, estimateur, file de tâches, MCP, indexation. Tout
tient ensemble parce que les tests passent, pas parce que l'architecture a une colonne
vertébrale. L'ADR 0013 a posé le bon critère — *est-ce que ça sert la base, ou est-ce que ça la
remplace ?* — et l'a appliqué à la doc, pas au code. Un projet qui prétend « ne pas faire de
logiciel » ne peut pas avoir sept mille lignes de logiciel dont la moitié remplace la base.

**Ce qui se fait de mieux** : un noyau qu'on peut lire en une soirée — catalogue, téléchargement,
indexation, recherche, service, exposition MCP — et *tout le reste hors du noyau* :
`examples/` pour les solveurs et les recettes, un dépôt séparé pour les miroirs de paquets et les
visuels s'ils survivent. Objectif chiffré : `src/` sous 3 000 lignes, `knowledge/` au-dessus.

### 2. Le format d'index est maison, lié à un modèle, et inutilisable sans Arche

`.arche-idx` : un en-tête JSON, des locators gzippés, des vecteurs int8, **aucun texte**, et un
modèle d'embedding figé dans le fichier (« changer de modèle = republier tous les shards »). Pour
« des centaines de RAG hébergés » sur dix ans, c'est trois erreurs en une. Les modèles
d'embedding changent chaque année : réembarquer des centaines de corpus à chaque fois est un
tapis roulant que personne ne fera tourner. Sans texte, l'index est mort sans le ZIM *et* sans
kiwix-serve *et* sans le code d'Arche — trois dépendances pour lire une phrase. Et un format
binaire maison ne se lit avec rien d'autre que nous : un utilisateur avec Python et `sqlite3`
seuls, dans vingt ans, n'en fait rien.

**Ce qui se fait de mieux** : **une base SQLite par corpus**, format le plus durable qui existe,
lisible par tout langage sans notre code, avec le texte des chunks *dedans* (le disque est la
ressource bon marché ; le couplage est la ressource chère), une table FTS5 pour le lexical (BM25
intégré, éprouvé — au lieu des 67 lignes maison de `bm25.ts`), et les vecteurs comme **table
dérivée, taguée par modèle, optionnelle** : on peut en avoir plusieurs, en ajouter un nouveau sans
toucher au reste, ou n'en avoir aucun et chercher quand même. `node:sqlite` est intégré à Node 22
sans dépendance : l'ADR 0002 tient. Ce que l'ADR 0007 a bien vu — chunker sur la structure,
hybride, fusion RRF, diversification par source — reste ; c'est le *contenant* qui était faux.

### 3. Le vectoriel exhaustif ne passe pas à l'échelle du produit annoncé

bge-m3 en 1 024 dimensions int8 = 1 Ko par chunk. Wikipédia FR seule : 4,5 millions de chunks,
4,6 Go de vecteurs — plus que le texte. Et le balayage exhaustif « assumé » dans `shard.ts` vaut
pour quelques centaines de milliers de vecteurs ; sur des centaines de corpus, une question
balaie des dizaines de millions de vecteurs sur un CPU de portable : des secondes par requête,
des minutes sur un Pi.

**Ce qui se fait de mieux** : *router avant de chercher*. Un petit index des **descriptions de
corpus** (une phrase par corpus, quelques centaines de vecteurs) choisit les trois ou cinq corpus
pertinents, puis la recherche se fait dans ces bases-là. C'est l'architecture naturelle de
« des centaines de RAG » — des RAG, pas un RAG géant. Et des vecteurs plus petits : un modèle
Matryoshka tronqué à 256 dimensions ou la quantification binaire (128 octets par chunk) divise
par huit avec une perte mesurable — à mesurer, justement (erreur 6). Pour un corpus
encyclopédique, le Xapian du ZIM suffit souvent : le vectoriel se réserve au corpus pratique.

### 4. La connaissance a été écrite, pas extraite — l'hallucination qu'on combat, en YAML

`figures.yaml`, `crops.yaml`, `compute.yaml` : des centaines de chiffres rédigés par une IA en
une journée, marqués `verified: false` ou « ordres de grandeur ». C'est honnête, et c'est
exactement le mécanisme que le projet existe pour empêcher — un modèle qui écrit des nombres
plausibles. Que ce soit moi plutôt qu'un 4B ne change pas la nature de l'erreur.

**Ce qui se fait de mieux** : une règle mécanique — *aucune ligne de `knowledge/` sans un locator
vers le corpus* (ressource, article, offset), vérifiée par un validateur qui rejette le reste ;
et la connaissance **extraite** du corpus avec sa citation, pas rédigée puis sourcée après.
`verified` cesse d'être un champ déclaré : il devient calculé (la citation résout-elle ?). Ce que
j'ai écrit devient une *liste de choses à sourcer*, pas une base.

### 5. Aucune mesure : on a bâti onze modules avant le premier évaluateur

`arche eval` n'existe toujours pas. Chaque affirmation de qualité — chunking, recherche,
garde-fous, estimation de temps et d'énergie, choix de modèle — est une opinion. Une
architecture qui n'est pas mesurée dérive vers ce qui est agréable à écrire, et c'est
précisément ce qui s'est passé aujourd'hui.

**Ce qui se fait de mieux** : l'évaluation comme *première* brique, publiée comme la fraîcheur :
un tableau par corpus (rappel@5, MRR, latence, Wh par requête sur une machine de référence) dans
le dépôt, régénéré par CI, et une règle : un changement de chunking, de modèle ou de fusion qui
fait baisser le tableau ne se fusionne pas. La même discipline que `freshness --min`.

### 6. Le catalogue est cent pour cent réclamation, zéro pour cent fait

316 fiches, 316 « unverified », aucune date de vérification, alors que le pipeline de fraîcheur
est écrit. Le produit livré aujourd'hui à un utilisateur, c'est une liste de choses que
*quelqu'un pense* exister. Ce n'est pas une erreur de code — c'est une erreur d'ordre : on a
écrit le tracker avant de l'exécuter une seule fois, et on a continué à ajouter des fiches.

**Ce qui se fait de mieux** : la vérification est une donnée *générée*, livrée avec le catalogue
(`checked`, taille réelle, checksum, disponibilité), et une fiche non vérifiée depuis N jours
n'est pas proposée par défaut. M0 règle la mécanique ; l'architecture doit rendre le « non
vérifié » visible dans chaque interface, pas seulement dans un pourcentage.

### 7. La confiance n'est pas modélisée : hachages dans un catalogue non signé, fusion automatique

Le catalogue est la racine de confiance de tout ce qui s'installe, et il n'est pas signé (l'ADR
0006 le promet, `src/` ne contient pas le mot *minisign*). Le téléchargeur ne vérifie aucune
signature. `catalog-automerge.yml` fusionne seul les PR qui changent `source.url` et `checksum` —
c'est-à-dire précisément les deux champs qu'un attaquant veut changer. Pour un outil dont la
raison d'être est de tenir quand tout tombe, c'est la chaîne d'approvisionnement la plus fragile
possible : un item Internet Archive compromis + un tracker crédule = une base empoisonnée
livrée à tout le monde.

**Ce qui se fait de mieux** : le catalogue publié est un artefact **signé** (minisign, clé hors
ligne chez le mainteneur, clé publique dans le binaire), le téléchargeur refuse un catalogue non
signé, et aucune modification d'URL ou de hachage ne se fusionne sans un humain. Et un
**lockfile d'édition** (`arche.lock` : chaque fichier, son hachage, sa provenance) pour qu'un
SSD soit reproductible et qu'un bug se reproduise.

### 8. Un seul hébergeur pour les artefacts qu'Arche fabrique

Les ZIM et les shards ne vont que sur Internet Archive. IA a connu des attaques juridiques et une
panne de plusieurs semaines en 2024 ; c'est un point de défaillance unique pour la partie du
projet qui n'existe *que* par nous. L'ADR 0006 dit torrent d'abord ; les scripts ne produisent
que l'upload IA. Et le script d'upload étiquette chaque shard **MIT** : un index dérivé d'un
corpus CC-BY-NC-SA hérite de sa licence, pas de la nôtre.

**Ce qui se fait de mieux** : chaque artefact publié en trois endroits au minimum (IA, torrent
avec webseed, CID IPFS), sa licence **héritée** du corpus et écrite dans ses métadonnées, et le
catalogue qui liste les trois adresses. La redistribution des miroirs par les utilisateurs
(`arche serve` qui seede) fait le reste.

### 9. Zéro dépendance comme dogme : on réécrit des choses que le monde a déjà écrites

Un parseur de zip, un BM25, un validateur JSON Schema, un parseur de tar, un parseur d'APKINDEX,
un JSON-RPC : chacun est une centaine de lignes qu'il faut maintenir et où un bug se cache.
L'intention de l'ADR 0002 est juste — une machine hors ligne doit pouvoir reconstruire l'outil —
mais la règle « aucune dépendance » est la mauvaise traduction de « aucune dépendance qu'on ne
puisse pas mettre sur le SSD ».

**Ce qui se fait de mieux** : *peu* de dépendances, **vendues** (`vendor/`), épinglées, avec leur
licence — et le temps ainsi gagné va dans la base. Le zip et le BM25 disparaissent avec SQLite ;
le JSON-RPC reste (il est petit et stable).

### 10. Le reclasseur est écrit, testé, et pas branché

`rerank.ts` existe avec ses tests ; `retrieve.ts` ne l'appelle pas. Le levier de qualité le
moins cher du RAG pour un petit modèle — celui qui compense un embedder faible — dort. C'est le
symptôme de l'erreur 1 : on écrit des modules, on ne compose pas un système.

### 11. Tout est traduit à la main, deux fois

754 champs `fr:` dans le catalogue, chaque doc en deux langues, chaque message d'erreur bilingue
dans le code. Pour un projet à une personne, c'est un doublement du coût de chaque changement,
et la version anglaise sera la première à pourrir. **Ce qui se fait de mieux** : une langue
source (le français, c'est le cœur de cible), les traductions *générées* et marquées comme
telles — le corpus lui-même est multilingue de toute façon.

### 12. Le monolithe : un binaire qui fait catalogue, wizard, web, superviseur, miroirs, visuels, schémas, projets, calcul, file, MCP, index

Chaque sous-système ajoute une surface de bugs au binaire que le novice double-clique. **Ce qui
se fait de mieux** : le noyau, et des *commandes optionnelles* chargées à la demande (ou des
paquets séparés) — le novice n'a jamais besoin que la recette de miroir apk se compile.

## Ce qui est juste, et qu'il faut garder

Le catalogue en YAML relu par git, avec une fraîcheur mesurée plutôt que promise. Le principe
« orchestrateur, pas hébergeur » et la règle de permission pour les ZIM construits. Le chunking
par structure, l'hybride avec fusion et diversification. Le serveur MCP comme adaptateur mince
sur des fichiers, pas comme cœur. Les portes humaines et les trois sujets sensibles comme
*données*. Le temps qui s'adapte et non les capacités, et l'énergie dans chaque estimation. Le
refus des clients cloud. L'inventaire comme entrée. Tout cela tient sans le code qui l'entoure.

## La cible, en six décisions

1. **La donnée est le produit, et ses formats sont ennuyeux.** Une base SQLite par corpus (texte
   des chunks, locators, FTS5, vecteurs dérivés par modèle, métadonnées et licence), lisible sans
   Arche. Compressée en zstd pour le transport, publiée en trois endroits, licence héritée.
2. **Provenance ou rien.** Aucune ligne de `knowledge/` sans locator vérifiable ; `verified`
   calculé, pas déclaré.
3. **Mesurer avant d'ajouter.** `arche eval` en premier, tableau publié, seuil bloquant en CI.
4. **Petit noyau, grande base.** `src/` sous 3 000 lignes ; solveurs, recettes, miroirs, visuels
   hors du noyau ; dépendances vendues plutôt que réécrites.
5. **Confiance explicite.** Catalogue signé, téléchargeur qui vérifie, aucun automerge d'URL ou de
   hachage, lockfile d'édition.
6. **Router, puis chercher.** Un index de corpus, puis la recherche dans les bases choisies ;
   vecteurs petits ; reclasseur branché.

Le coût : deux semaines pour remplacer le format d'index et brancher SQLite, une pour signer et
verrouiller, une pour l'évaluation — et une soustraction de code qui, elle, ne coûte que du
courage. Le gain : une base qu'on peut ouvrir avec `sqlite3` en 2040, à laquelle on peut ajouter
un modèle d'embedding sans rien republier, et dont chaque chiffre dit d'où il vient.
