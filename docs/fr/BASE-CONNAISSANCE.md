> **Mise à jour (ADR 0013)** : la chaîne d'indexation existe — `arche index build | add | fetch`, extraction ZIM/PDF/EPUB, embedding reprenable, shards publiés par `index-build.yml` selon `catalog/index-plan.yaml`. Vos propres documents entrent par `arche index add`.
>
> **Mise à jour (ADR 0014)** : le format du shard change. Un corpus devient **une base SQLite**
> (`<id>.arche.sqlite`) qui contient le texte des chunks, un index plein texte FTS5, les
> métadonnées avec la licence héritée, et zéro, une ou plusieurs tables de vecteurs — une par
> modèle d'embedding, ajoutable sans republier le texte. Lisible avec `sqlite3` seul, sans Arche.
> Depuis M1-2, `arche index build` et `arche index add` **écrivent cette base** (`build.ts`) ;
> depuis M1-3, `search`, `read_article` et `arche://article/…` **la lisent** (`retrieve.ts` : un
> canal `sqlite` par corpus, FTS5 + cosinus). Le `.arche-idx`, le texte à côté (`index/text/`), le
> BM25 maison et leurs lecteurs ont disparu. Voir « Construire un corpus » et « Chercher dans les
> corpus » plus bas.
> Les sections « L'index ne contient pas le texte » et « Le modèle d'embedding est un engagement »
> ci-dessous décrivent l'ancien format ; l'ADR dit ce qui les remplace :
> [docs/adr/0014-format-sqlite.md](../adr/0014-format-sqlite.md).

# La base de connaissance de l'autonomie

> Arche n'est pas un catalogue de téléchargements avec un chatbot posé dessus. C'est une **base de
> connaissance interrogeable hors ligne par une IA locale**, dont le catalogue est le corpus et dont
> l'interface graphique n'existe que pour apprendre à s'en passer.
> English: [KNOWLEDGE-BASE.md](../en/KNOWLEDGE-BASE.md) · Décision : [ADR 0007](../adr/0007-rag-local.md)

## Pourquoi ce virage

Une bibliothèque de 1 250 Go posée devant quelqu'un qui n'a personne à qui demander, c'est un
entrepôt, pas une aide. Les 248 ressources ne répondent à aucune question ; elles attendent qu'on
sache déjà quoi chercher, dans quelle langue, sous quel mot-clé. Or la personne qu'on vise tape
« comment je remonte l'eau de mon puits sans électricité », pas « rope pump appropriate technology ».

L'objet qu'on fabrique désormais est l'**index** : ce qui transforme un tas de documents en quelqu'un
à qui on peut poser une question à deux heures du matin, sans réseau, et obtenir une réponse **sourcée
dans les documents qu'on a déjà sur son disque**.

Le reste du projet ne change pas de nature : le catalogue reste le catalogue, les ZIM restent les
ZIM, les fiches imprimables restent le dernier recours quand il n'y a plus d'électricité. L'index
s'ajoute par-dessus.

## Comment c'est construit

### Un index par ressource, jamais un index global

Chaque ressource indexable porte un bloc `index` dans le catalogue : l'URL de son **shard**, son
empreinte, le modèle d'embedding utilisé et le nombre de dimensions. Un shard se télécharge seul, se
vérifie seul, se met à jour seul. On récupère l'index d'une ressource si et seulement si on a la
ressource.

Ce choix n'est pas cosmétique. Il permet de construire l'index **dans la même chaîne d'intégration
continue que les ZIM**, une ressource à la fois, sans jamais dépasser les limites de GitHub Actions
et sans rien faire tourner sur une machine personnelle. Une ressource mise à jour ne réindexe qu'elle.
Et un utilisateur qui a choisi 40 Go ne télécharge pas l'index des 1 200 Go qu'il n'a pas.

### L'index ne contient pas le texte — *remplacé par l'ADR 0014*

> Depuis l'[ADR 0014](../adr/0014-format-sqlite.md), le texte des chunks est **dans** la base
> SQLite du corpus, avec son locator (article, offset, longueur) : la citation pointe toujours
> vers le document réel, et la base répond même sans le ZIM, sans kiwix-serve et sans Arche.
> Le paragraphe qui suit décrit le raisonnement d'origine, gardé pour l'histoire.

Un chunk indexé n'est pas un extrait, c'est un **repère** : identifiant de ressource, chemin de
l'article, position en octets, longueur — plus son vecteur, quantifié en entiers 8 bits. Le texte
reste là où il est déjà, dans le ZIM, déjà compressé. C'est ce qui rend l'index petit au lieu de
doubler le corpus, et c'est aussi ce qui garantit qu'une citation pointe toujours vers le document
réel, jamais vers une copie qui aurait pu diverger.

### Recherche hybride, parce que le dense seul ment

Le corpus est plein de ce qu'un petit modèle d'embedding gère mal : des noms latins
(*Amanita phalloides*), des références normatives (NF DTU 24.1), des codes (SO-101), des unités
(kWc, stère, mm/an). La recherche sémantique les rapproche de leurs voisins plausibles ; la recherche
lexicale les retrouve exactement.

On fait donc tourner les deux et on les fusionne par **rang réciproque** — une méthode qui ne compare
jamais les scores entre eux, seulement les rangs, et n'a donc aucun réglage à faire vieillir. Les ZIM
Kiwix embarquant déjà un index plein texte, on s'en sert au lieu de le reconstruire.

Un dernier filtre limite le nombre d'extraits venant d'une même ressource : sur un sujet d'autonomie,
une réponse construite sur une seule source est presque toujours moins bonne qu'une réponse qui en
croise trois.

### Le modèle d'embedding est un engagement — *assoupli par l'ADR 0014*

> Depuis l'[ADR 0014](../adr/0014-format-sqlite.md), les vecteurs sont une **table par modèle**
> dans la base du corpus : on peut en avoir plusieurs, en ajouter un sans republier le texte, ou
> n'en avoir aucun et chercher quand même (FTS5). Un corpus sans la table du modèle demandé répond
> en lexical seul et le dit. Le tableau des modèles reste valable.

Un index est lié au modèle qui l'a produit. Mélanger deux modèles ne provoque pas d'erreur, ça produit
des scores silencieusement faux — donc le lecteur ne lit, dans chaque base, que la table du modèle
demandé (`vectors."table"`), et dit quand elle manque.

| Modèle | Dimensions | RAM | Usage |
|---|---|---|---|
| **bge-m3** | 1024 | ~2,5 Go | référence Arche, très bon en français |
| granite-embedding:278m | 768 | ~1,2 Go | compromis, Apache-2.0 |
| multilingual-e5-small | 384 | ~0,5 Go | repli : tourne sur un Raspberry Pi |

Tout passe par Ollama, qu'Arche installe déjà pour la génération. Aucune dépendance nouvelle n'entre
dans le projet (ADR 0002) : le découpage et la fusion sont écrits à la main, le format et le lexical
sont SQLite et FTS5 (`node:sqlite`, intégré à Node 22), et ça tient en quatre fichiers courts.

### Et les fichiers qui ne sont pas du texte

Le corpus n'est pas fait que de pages. Il y a des STL à imprimer, des SVG à découper, des DXF, du
G-code, des photos de montage, des PDF. Pour quelqu'un qui fabrique, ce sont souvent eux la vraie
réponse : « voici la pièce », pas seulement « voici la page qui en parle ».

Un STL n'a rien à embarquer dans un modèle de langue. On le retrouve donc par deux chemins. D'abord
par son **voisinage** : chaque fichier est accroché au passage qui le cite, repéré par sa position
dans l'article, de sorte que le STL du piston remonte toujours avec le paragraphe qui explique
comment le monter — jamais l'un sans l'autre. Ensuite par **ce qu'on peut lire dedans sans aucune
bibliothèque** : un STL binaire, c'est 84 octets d'en-tête puis 50 octets par triangle, et on en tire
les dimensions, le nombre de triangles et le volume ; un SVG est du XML avec un titre, une description
et des textes visibles — les cotes, les légendes, les noms de pièces. On en fait une phrase, indexée
comme n'importe quel passage, en français et en anglais dans la même chaîne :

```
le piston (piston.stl) — fichier 3D imprimable / printable 3D model (STL).
Dimensions 45.0 × 45.0 × 22.0 mm, 2 340 triangles, volume ≈ 18.4 cm³.
```

C'est la réponse à la question que l'utilisateur se pose vraiment devant un fichier : *est-ce que ça
rentre sur mon plateau, et combien de filament ?*

Les images, elles, sont retrouvées par leur légende, leur texte alternatif et le paragraphe qui les
entoure — pas par leur contenu. Un modèle de vision serait une couche optionnelle avec son propre
shard, jamais une dépendance du noyau. Il faut le dire clairement : l'assistant trouvera le schéma
du poêle-fusée parce que la page dit « schéma du poêle-fusée », pas parce qu'il l'a vu.

## Les chiffres ne passent jamais par le modèle

C'est le point sur lequel ce projet se sépare des assistants documentaires ordinaires.

Un modèle local à qui l'on demande « quelle citerne pour quatre personnes ? » produit un nombre
plausible et faux. L'autonomie étant **entièrement** un problème de dimensionnement — litres par
jour, m² par personne, stères par hiver, kWc en décembre, pieds de maïs à laisser monter en graine —
une réponse approximative n'est pas une réponse dégradée, c'est un hiver raté.

Les ordres de grandeur vivent donc dans `knowledge/figures.yaml`, un fichier lisible et corrigeable
par n'importe qui, et dix **calculateurs déterministes** les exploitent : `eau_pluie`, `citerne`,
`calories`, `surface_nourriciere`, `graisses`, `bois_chauffage`, `solaire`, `poules_grain`,
`semences_effectif`, `stock_un_an`. Le modèle n'a le droit que de les appeler et d'expliquer leur
résultat.

Chaque calculateur rend le calcul complet — l'opération, les hypothèses, la fourchette, et l'avertissement
qui va avec :

```
Citerne nécessaire : 14.4 m³ (fourchette 10.8–18)
  4 pers. × 40 L/j × 90 j = 14400 L = 14.4 m³
Hypothèses :
  - usage « frugal » : 40 L par personne et par jour
  - aucune autre ressource pendant la période sèche
Attention : ce volume suppose la citerne pleine en début de période sèche…
```

On ne demande jamais de faire confiance sur parole : on montre l'arithmétique.

Et le chiffre lui-même dit d'où il vient (M4-1, [PROVENANCE.md](PROVENANCE.md)) : chaque valeur de
`figures.yaml`, `crops.yaml` et `compute.yaml` porte `source: { resource, path, quote }` — un locator
vers un article du corpus et la phrase qui donne le nombre — ou, en période de grâce, un
`unsourced: true` explicite, compté et publié dans le README (445 sur 445 au 12 septembre 2026 :
la connaissance a été écrite, pas extraite, et c'est mesuré). `verified` n'est jamais écrit à la
main : `arche knowledge verify` l'établit en ouvrant les shards installés ; `catalog validate`
refuse une valeur sans provenance.

## Trois sujets que la machine ne tranche pas

Le corpus contient de l'identification de champignons, de la posologie de plantes et des gestes de
soin. Le modèle en face est un modèle local de quelques milliards de paramètres. Une hallucination
n'y coûte pas une gêne, elle coûte quelqu'un.

L'assistant détecte donc quatre situations et change de comportement :

**Urgence.** Une ingestion suspecte, une perte de connaissance, une hémorragie : il donne d'abord le
numéro d'urgence, rappelle la règle du délai de six heures et le piège de la rémission de 12–24 h, et
seulement ensuite ce que disent les sources.

**Identification.** Il n'affirme **jamais** qu'une espèce est comestible. Il donne les critères
d'exclusion, rappelle que les applications de reconnaissance servent à éliminer et jamais à valider,
et renvoie au pharmacien ou à la société mycologique.

**Posologie.** Il ne calcule ni n'invente une dose. Il cite mot pour mot ou dit que le corpus ne la
donne pas, et signale systématiquement les marges étroites — enfants, grossesse, personnes âgées,
insuffisance rénale ou hépatique.

**Diagnostic.** Il décrit ce que la source associe aux signes, liste les signes d'alarme, et dit que
trancher entre deux causes demande un examen.

Ces règles sont appliquées **avant** tout le reste dans le prompt, et un détail vaut d'être raconté :
elles ont été silencieuses pendant une heure. En JavaScript, `\b` ne connaît que les caractères ASCII,
donc `\bmangé\b` ne correspond à rien — le garde-fou d'urgence ne se déclenchait sur aucune phrase
française contenant un participe passé accentué. Un test l'a attrapé ; il est resté dans la suite
avec le commentaire qui explique pourquoi. C'est le pire mode de défaillance imaginable ici : une
sécurité qui a l'air d'exister.

Une règle supplémentaire ne dépend pas du modèle du tout : **une réponse qui ne cite aucune source
alors que des extraits ont été fournis est rejetée**, pas affichée.

## Ce qu'on mesure

Sans mesure, « l'assistant marche bien » est une opinion. `knowledge/eval.yaml` fixe un jeu de
**60 questions** réelles — telles qu'on les pose, fautes comprises — avec, pour chacune, les
ressources qui devraient remonter, **où est la réponse** (un locator `resource/path#offset`,
ADR 0014, `pending` tant que le shard n'est pas publié), les **mots obligatoires** de la réponse, le
calculateur attendu quand c'est un dimensionnement, et le garde-fou attendu quand c'est un sujet
sensible. `arche eval` (M1-7) joue le jeu contre les corpus installés et mesure, par canal (xapian,
sqlite, fusion, rerank), le rappel@5 — au moins une des ressources attendues dans les cinq premiers
extraits — et le MRR, les mots obligatoires dans ces cinq extraits, les garde-fous rendus à raison,
et « je ne trouve pas » sur les négatives ; la CI l'exécute sur un corpus fixture (nos propres docs)
et échoue sous le seuil. Le jeu, son schéma, la commande, le tableau publié et ce que la mesure a
déjà trouvé sont dans [EVAL.md](EVAL.md).

**Quinze questions sont négatives** : hors base — synthèse d'antibiotique ou d'insuline, armes,
explosifs, stupéfiants, piratage (zone noire, voir [ZONES-GRISES](ZONES-GRISES.md)), météo, prix,
actualité, données personnelles ou locales, actions en ligne. La bonne réponse est « je ne trouve
pas dans la bibliothèque », et une réponse plausible à la place est un échec. **Douze** déclenchent
un garde-fou attendu, et le test vérifie que les règles se déclenchent vraiment sur ces
douze — et sur aucune des 48 autres.

Une réponse mal sourcée est un bug au même titre qu'un lien mort.

## Construire un corpus (M1-2)

```bash
arche index estimate zimgit-water --source water.zim   # taille de la base (texte + FTS5 + vecteurs int8) et temps d'embedding, avant de lancer
arche index build zimgit-water --out water.arche.sqlite # la base ; .zst à côté si zstd est installé (--no-compress pour s'en passer)
arche index add ~/Livres/manuel-apiculture.pdf          # vos documents : même format, licence NOASSERTION, jamais publié
arche index list                                        # ce qui est installé : corpus, chunks, modèles de vecteurs, licence
```

Ce que `build` fait, dans l'ordre : extraire (ZIM via zimdump, PDF via pdftotext, EPUB, Markdown,
HTML, dossiers), découper sur la structure, **écrire chaque article et ses chunks dans la même
transaction** (par lots de 50 articles), puis embarquer les chunks par lots de 32 et commettre tous
les 20 lots, enfin optimiser FTS5, `VACUUM`, `integrity_check`, et écrire `meta.built_at` en
dernier. Le texte est dans la base : un PDF indexé se cite hors ligne sans son lecteur, un ZIM sans
kiwix-serve, les deux sans Arche (`sqlite3 corpus.arche.sqlite "SELECT … MATCH 'réhydratation'"`).

**Reprise après coupure.** Le point de contrôle, c'est la base elle-même. Un processus tué
(SIGTERM, runner CI qui expire, `Ctrl-C`) laisse une base sans `built_at` : relancer la même
commande saute les articles déjà commis et ne ré-embarque que les chunks sans vecteur, sans
doublon (les contraintes `UNIQUE` du schéma le garantissent ; un test tue réellement le processus
au milieu de l'embedding). Une coupure de courant peut corrompre le fichier — il est alors jeté et
reconstruit : jusqu'à `built_at`, il est jetable. Rien n'est écrit à côté du fichier.

**Estimation.** `index estimate` ne devine pas : pour une source lisible, il découpe et insère
réellement les articles (texte + FTS5) dans une base en mémoire et lit son nombre de pages —
exact jusqu'à 2 000 articles, extrapolé au-delà — puis compte les vecteurs (`dims` + 12 octets
par chunk). Mesuré à ±5 % sur les fixtures (critère : ±30 %). Pour un ZIM (le vider pour estimer
coûterait autant que construire) ou une ressource non installée, un ordre de grandeur d'après la
taille : ~350 000 chunks et ~1,1 Ko de texte par chunk par Go, FTS5 ≈ 0,6 × le texte. Sur
Wikipédia FR : ≈ 8 Go de texte + FTS5, 4,6 Go de vecteurs à 1 024 dimensions — d'où M1-9.

**Ce que la base dit d'elle-même** (`SELECT key, value FROM meta`) : `resource_id`, la licence
**héritée du catalogue** (`license_spdx`, `license_redistribution`), `languages`, `title`,
`source_kind`, `source_sha256` (la base ne vaut que pour cette version de la source), `chunker`
(`structure/1200/2000/150/200`), `articles`, `chunks`, `built_by`, `built_at`. Pour vos propres
documents : `NOASSERTION` / `forbidden` — ils ne sortent jamais de votre disque.

## Chercher dans les corpus (M1-3)

`search` (outil MCP, `retrieve.ts`) interroge deux canaux et **dit lesquels ont répondu** :
`xapian` (l'index plein texte de chaque ZIM servi par kiwix-serve) et `sqlite` (chaque
`<bibliothèque>/index/*.arche.sqlite`, y compris vos documents). Chacun vaut `ok`, `off` (absent)
ou `error`, et `detail` nomme ce qui manque — kiwix-serve éteint, une base illisible, un corpus
sans la table du modèle demandé (il répond alors en FTS5 seul), Ollama absent (idem).

Dans chaque base, deux listes : **FTS5** — la question est convertie en expression sûre, chaque mot
entre guillemets relié par `OR` (`"comment" OR "traiter" OR "déshydratation"`), la ponctuation et
les opérateurs de l'utilisateur ne sont jamais interprétés, BM25 classe (le titre de section pèse
double, sans accents ni casse) ; et **cosinus** — la question embarquée par Ollama, normalisée et
quantifiée en int8, contre chaque vecteur de `vectors_<modèle>`, par blocs de 4 096 lignes, tas de
taille *k*, aucun index approché. Les deux listes, plus Xapian, se fusionnent par rang réciproque
(RRF) et se diversifient (trois passages par corpus au plus) — inchangé depuis l'ADR 0007. Un passage
trouvé par les deux moitiés porte `via: [fts, vec]` ; son identifiant est le locator
`<corpus>/<chemin>#<octet>` de la vue `passages`, celui que `knowledge/` et `eval.yaml` citent.

Le texte du passage vient de `chunks.text` : **aucun appel réseau** pour un corpus SQLite. Son lien
est `arche://article/<corpus>/<chemin>`, que `read_article` et la ressource MCP du même nom
résolvent dans `articles`/`chunks` : l'article est reconstitué, recouvrement retiré, titres de
section réinsérés. Un livre sans corpus installé passe encore par kiwix-serve.

**Mesuré** (`npx tsx scripts/index/bench-retrieve.ts --chunks 100000 --dims 1024`, Xeon 2,8 GHz,
Node 22) : FTS5 ≈ 20 ms ; cosinus ≈ 150 ms à 1 024 dimensions (56 ms à 384) une fois les vecteurs
en mémoire ; la **première** question d'un processus paie en plus la lecture des 100 000 lignes
(≈ 0,5 s à 1 024 d) — les blocs restent ensuite en mémoire tant que `ARCHE_VECTOR_CACHE_MB`
(512 par défaut) le permet, et sont relus si le fichier change. Une base plus grosse que le budget
est relue à chaque question : c'est le cas de Wikipédia FR à 1 024 dimensions, que M1-8 (router
avant de chercher) et M1-9 (vecteurs plus petits) traitent.

## Ce que ça change pour l'utilisateur

L'interface graphique affiche la réponse **et les extraits qui l'ont produite**, côte à côte, avec un
lien pour ouvrir l'article dans Kiwix. L'objectif assumé est qu'elle devienne inutile : que la
personne apprenne où vit la connaissance et finisse par aller la chercher directement. On mesure le
succès à la part de gens qui cliquent sur la source, pas au temps passé dans l'interface.

Et le jour où l'électricité s'arrête pour de bon, il reste les fiches imprimables — qui ne
demandent rien à personne.

## Ce qui reste à faire

Les vecteurs ajoutés à une base publiée sans la republier (M1-4), la publication du `.zst` et son
installation par `index fetch` (M1-10 — d'ici là `fetch` pose le fichier tel quel, sans le
décompresser), la chaîne d'indexation en CI (`index-build.yml`, jamais exécutée), le routage par
corpus avant la recherche (M1-8) et le reclasseur branché, et le passage du jeu d'évaluation en tâche
de CI bloquante. Le noyau — découpage, format, écriture, lecture, fusion, calculateurs, garde-fous —
est en place et testé.
