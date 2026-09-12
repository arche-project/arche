# Évaluation — le jeu de questions, avant la mesure

> Audit d'architecture, décision 3 : *mesurer avant d'ajouter*. Ce document décrit le jeu
> d'évaluation `knowledge/eval.yaml` (ticket M1-6) et la commande qui le joue, `arche eval` (M1-7).
> Le tableau des résultats — rappel@5, MRR, garde-fous, négatives, par canal, par corpus et par
> sujet — est publié en bas de cette page par `arche eval --write docs/fr/EVAL.md` ; la CI l'exécute
> sur un corpus fixture et échoue sous le seuil. Sa première version sur des shards réels arrive avec
> les vingt premiers shards (M4-3).

## Pourquoi un jeu de questions avant le moindre shard

Sans mesure, « l'assistant marche bien » est une opinion, et une architecture qui n'est pas mesurée
dérive vers ce qui est agréable à écrire ([audit](AUDIT-ARCHITECTURE.md), erreur 5). Le jeu est
donc écrit *avant* que la recherche ne tourne sur un corpus publié : il fixe ce qu'on attend, et
c'est ensuite la recherche qui doit s'y conformer — pas l'inverse. Une modification du découpage, du
modèle d'embedding, du tokenizer FTS5 ou de la fusion qui fait baisser le tableau ne se fusionne pas
(seuil CI, M1-7).

## Ce que contient `knowledge/eval.yaml`

**60 questions**, telles qu'on les tape — fautes, abréviations, plaintes plutôt que mots-clés
(« mes pommes de terre pourrissent dans la cave ») — réparties en trois groupes disjoints :

| Groupe | Nombre | Ce qu'on mesure |
|---|---|---|
| Positives sans garde-fou | 33 | rappel@5 (une des ressources attendues dans les cinq premiers extraits), MRR, mots obligatoires dans la réponse |
| Positives **avec garde-fou** | 12 | idem, **et** le garde-fou attendu (`emergency` ×4, `identification` ×3, `dosage` ×3, `diagnosis` ×2) est rendu — et aucun garde-fou n'est rendu sur les 48 autres |
| **Négatives** (hors base) | 15 | la bonne réponse est « je ne trouve pas dans la bibliothèque » : zone noire ([ZONES-GRISES](ZONES-GRISES.md) : antibiotiques, armes, explosifs, stupéfiants, piratage), données vivantes (météo, prix, actualité), données personnelles ou locales, actions en ligne |

Les sept sujets d'autonomie du ticket — **eau, énergie, culture, construction, électronique,
entraînement (ML local), premiers secours** — ont chacun au moins quatre questions positives ;
s'y ajoutent les plantes (toxiques, médicinales), le vétérinaire et le hors-base. Huit questions sont
en anglais : le corpus est mixte, et une question française doit trouver sa réponse dans un corpus
anglais (« bouillir » dans *zimgit-water*).

Chaque question porte :

- `expect` — les ressources du catalogue dont **au moins une** doit remonter ; chacune existe dans
  le catalogue, est un corpus texte (ZIM ou PDF), et au moins une est dans `catalog/index-plan.yaml`
  (sinon la question ne serait jamais mesurable) ;
- `locator` — **où est la réponse** : la ressource (parmi `expect`), un repère humain (`where` :
  chapitre, section, page), et un `status` :
  - `pending` : aucun shard publié ne permet encore de la résoudre — c'est le cas de **tous** les
    locators aujourd'hui, puisque le premier shard est M4-3 ;
  - `resolved` : `chunk` donne le locator exact `resource/path#byte_offset` (vue `passages.locator`
    de l'[ADR 0014](../adr/0014-format-sqlite.md)), vérifié dans le shard publié (`index.url` dans le
    catalogue). Le test refuse un `resolved` sans shard publié.
  - Pour notre propre corpus, `arche-docs` (le ZIM de `docs/`), `article` donne le fichier, et le test
    vérifie dès maintenant qu'il existe et qu'il contient les mots obligatoires : neuf locators sont
    ainsi vérifiés sur le texte réel, sans attendre un shard ;
- `must` — les **mots obligatoires** de la réponse, insensibles à la casse et aux accents ; « a|b »
  = l'un des deux suffit, et tous les éléments de la liste sont exigés (`["sucre", "sel", "litre"]`
  pour la solution de réhydratation) ;
- `flag` — le garde-fou attendu, s'il y en a un ; `negative: true` pour le hors-base ;
- `calculator` — quand la question est un dimensionnement (`citerne`, `solaire`,
  `bois_chauffage`, `surface_nourriciere`, `poules_grain`) : les calculateurs restent des exemples
  (ADR 0013 §2), mais la question doit passer par un calcul, pas par la prose ;
- `why` — ce que la question teste.

Le schéma est `knowledge/eval.schema.json` ; `tests/eval.test.ts` le vérifie et vérifie le fond :
60 entrées, ids uniques, ressources réelles, locators cohérents, garde-fous **réellement
déclenchés** par les règles de `src/core/rag/prompt.ts` (et seulement là où ils sont attendus), 12
garde-fous, 15 négatives.

## La première vague

`catalog/index-plan.yaml` marque `wave: 1` les vingt corpus de la première vague (M4-3, G2) : les
vingt plus petits corpus `essential` constructibles en CI — centres antipoison, plantes toxiques,
champignons et syndromes, premiers secours (IFRC, OMS, Croix-Rouge), Sphère, eau potable, *Là où il
n'y a pas de docteur*, sages-femmes, dentiste, vétérinaire (Forse, WikiVet), monographies OMS de
plantes, et `arche-docs` — ≈ 0,4 Go de texte. **25 des 45 locators** visent cette vague : dès M4-3,
plus de la moitié du jeu est mesurable sur des shards réels ; le reste (énergie, culture,
construction, électronique) attend Appropedia, Energypedia, les StackExchange, la FAO — vague 2.

L'énergie n'a aucun corpus en première vague : c'est un choix de M4-3 (les plus petits d'abord),
pas du jeu ; il est écrit ici pour que le premier tableau ne surprenne personne.

## Ce que le jeu a déjà trouvé

En écrivant les douze questions à garde-fou, une formulation au pluriel — « des champignons à pied
blanc avec un anneau, je peux les manger ? » — ne déclenchait **rien** : la règle d'identification
écrivait `\bchampignon\b` et `\bcomestible\b`, singulier seulement. Le même mode de défaillance que
l'accent dans `\bmangé\b` ([BASE-CONNAISSANCE](BASE-CONNAISSANCE.md)) : une sécurité qui a l'air
d'exister. La règle accepte maintenant les pluriels (FR et EN), et la question reste dans le jeu
comme régression. C'est exactement ce à quoi sert un jeu d'évaluation écrit avant le code.

En jouant le jeu pour la première fois (M1-7), sur un faux kiwix-serve : `eau-01` attend `zimgit-water`,
un corpus **anglais**, et exigeait `bouillir|ébullition` — un mot que ce corpus ne contient pas. La
question n'aurait jamais pu réussir sur mots@5. Le mot obligatoire admet maintenant `boil` ; les
autres questions FR → corpus EN sont à relire avec le même œil quand leurs shards existeront. Et
sur nos propres docs en FTS5 seul, trois questions ratent leurs mots (`electronique-04`,
`entrainement-04`, `entrainement-05`) : « sans réseau », « modèle », « local » sont partout dans
Arche, et BM25 en `OR` les laisse dominer « antenne » ou « LoRA » — le cas typique où le canal
vectoriel doit aider ; le tableau le dira quand il existera sur des vecteurs réels.

## Comment ajouter une question

1. Une question **réelle**, formulée comme on la pose, pas comme un titre d'article.
2. `expect` : des ids du catalogue, dont au moins un dans le plan d'indexation.
3. `locator` : la ressource qui porte la réponse, le repère humain, `status: pending` ; quand le
   shard existe, `arche eval --json` propose le `chunk` (`proposed_chunk` : le premier extrait de
   cette ressource qui porte les mots obligatoires) et on passe à `resolved` après lecture.
4. `must` : deux ou trois mots que toute bonne réponse contient — pas la réponse entière.
5. Si le sujet est sensible, `flag` ; et vérifier que la règle se déclenche (`npm test`) — sinon
   c'est la règle qu'il faut corriger, pas la question.
6. Garder les comptes : 60 = 33 + 12 + 15. Une question de plus dans un groupe en remplace une.

## `arche eval` : ce qu'on mesure, et comment

```bash
arche eval                          # Markdown sur stdout ; code 1 sous le seuil
arche eval --json                   # tout, question par question (rangs par canal, chunk proposé…)
arche eval --write docs/fr/EVAL.md  # réécrit le bloc « Résultats » de cette page
arche eval --rerank                 # mesure aussi le reclasseur (llama-server ou Ollama, s'il répond)
arche eval --min 90                 # seuil de rappel@5 en %, à la place de celui du jeu
```

Chaque question est posée à `retrieve()` exactement comme un client MCP la pose (`search`, k = 8),
contre les corpus SQLite de la bibliothèque et kiwix-serve s'il tourne. Le tableau a quatre
lignes, une par **canal** :

| Canal | Ce qu'on classe |
|---|---|
| `xapian` | la liste de kiwix-serve seule (les ZIM installés) |
| `sqlite` | FTS5 et vecteurs des corpus installés, fusionnés entre eux (RRF, 3 par corpus) |
| `fusion` | ce que le client reçoit : xapian + sqlite fusionnés puis diversifiés |
| `rerank` | la fusion reclassée par `rerank.ts` (`--rerank`) — muet si aucun serveur ne répond |

Pour chaque canal, sur les positives **mesurables** : **rappel@5** (un extrait d'une ressource
attendue dans les cinq premiers) et **MRR** (1 / rang du premier). Un canal muet sur une question
(kiwix-serve absent, aucun corpus) ne compte ni pour ni contre lui : `n` dit sur combien de
questions il a répondu. Puis, sur la fusion : **mots@5** — un extrait attendu, dans les cinq
premiers, contient tous les mots obligatoires (c'est la mesure qui discrimine quand un seul corpus
est installé : le rappel par ressource y est trivial) ; les **garde-fous justes** (le garde-fou
attendu est rendu, et rien sur les 48 autres — mesuré sur les 60, ça ne dépend d'aucun corpus) ; et
« **je ne trouve pas** » sur les négatives : la recherche n'a rendu *aucun* extrait, ce que le serveur
MCP transmet par « aucun extrait trouvé ».

**Mesurable** : une positive ne l'est que si l'un de ses corpus attendus est installé (base SQLite
présente, ou ZIM dans l'état de la bibliothèque). Un shard qui n'existe pas encore n'est pas un échec
de la recherche : il est compté à part (« 13/45 positives mesurables »). Par corpus (celui du
`locator`) et par sujet, les mêmes chiffres.

Ce que la mesure dit déjà, et honnêtement : **« je ne trouve pas » vaut 0/15**. Une expression
FTS5 en `OR` sur une question courante trouve toujours *quelque chose*, et le cosinus rend toujours
ses k voisins — la recherche n'a pas de plancher de pertinence. Le chiffre est publié pour qu'on le
voie bouger : le plancher viendra du score du reclasseur (M1-5) ou d'un seuil mesuré ici, pas d'une
règle écrite à l'aveugle.

**Le seuil.** `threshold` dans `knowledge/eval.yaml` (`recall_at_5`, et `must_at_5` optionnel), sur
les positives mesurables ; `arche eval` rend le code 1 en dessous. La CI (`ci.yml`) construit le
corpus fixture — **notre propre documentation**, `docs/` → `arche-docs`, le ZIM du catalogue, en FTS5
seul puisqu'il n'y a pas d'Ollama en CI (`arche index build arche-docs --source docs --no-vectors`) —
et lance `arche eval` dessus : 13 questions y sont mesurables. Un changement de découpage, de
tokenizer FTS5 ou de fusion qui passe sous le seuil ne se fusionne pas ; on ne baisse jamais le seuil,
on le monte quand la mesure le permet. Sur la fixture, rappel@5 vaut 100 % par construction (un seul
corpus) : c'est `must_at_5` (0,75, mesuré 10/13) qui garde.

## Résultats

Dernière mesure publiée — sur le **corpus fixture de la CI** (`arche-docs` construit depuis `docs/`,
FTS5 seul, sans kiwix-serve ni reclasseur) ; la première mesure sur des shards réels arrive avec
M4-3. Réécrit par `arche eval --write docs/fr/EVAL.md`.

<!-- eval -->
Mesure du 2026-09-12 — jeu v2 (2026-09-12) — corpus installés : `arche-docs` — **13/45 positives mesurables**, 15 négatives, 12 garde-fous.
Canaux : xapian : fetch failed ; sans vecteurs d’un modèle connu (FTS5 seul) : arche-docs

| Canal | rappel@5 | MRR | n |
|---|---|---|---|
| xapian | — | — | 0 (canal muet) |
| sqlite | 100 % | 1.00 | 13 |
| fusion | 100 % | 1.00 | 13 |
| rerank | — | — | 0 (canal muet) |

- Mots obligatoires dans les 5 premiers extraits (fusion) : **77 %** (10/13) — manquent : electronique-04, entrainement-04, entrainement-05
- Garde-fous justes : **60/60** (0 manqués, 0 faux positifs)
- « Je ne trouve pas » juste sur les négatives : **0/15** (aucun extrait rendu)
- Rappel@5 manqué (fusion) : aucune question

| Corpus (locator) | questions | rappel@5 | MRR | mots@5 |
|---|---|---|---|---|
| arche-docs | 9 | 100 % | 1.00 | 78 % |
| fao-poultry-manual | 1 | 100 % | 1.00 | 100 % |
| pdf-ou-il-ny-a-pas-de-docteur | 1 | 100 % | 1.00 | 100 % |
| pdf-sanitation-sphere-handbook | 1 | 100 % | 1.00 | 100 % |
| stackexchange-ham | 1 | 100 % | 1.00 | 0 % |

| Sujet | questions | rappel@5 | MRR | mots@5 |
|---|---|---|---|---|
| culture | 2 | 100 % | 1.00 | 100 % |
| eau | 2 | 100 % | 1.00 | 100 % |
| electronique | 1 | 100 % | 1.00 | 0 % |
| energie | 2 | 100 % | 1.00 | 100 % |
| entrainement | 5 | 100 % | 1.00 | 60 % |
| premiers-secours | 1 | 100 % | 1.00 | 100 % |

Seuil : rappel@5 ≥ 100 %, mots@5 ≥ 75 % → **tenu**.
<!-- /eval -->
