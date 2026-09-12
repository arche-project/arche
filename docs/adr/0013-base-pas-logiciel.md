# ADR 0013 — On ne crée pas de logiciel ; on crée la base de connaissance qui permet de tout refaire, hors ligne

**Statut** : accepté (cadrage de Florian, 2026-09-11). C'est l'ADR de tête : les ADR 0007 (RAG),
0010 (projets), 0011 (serveur MCP), 0012 (temps et terrain) sont relus à sa lumière. Amendé par
l'[ADR 0014](0014-format-sqlite.md) : au point 3, « shard + texte local » et « BM25 local »
deviennent une base SQLite par corpus, texte et FTS5 dedans (écrite par M1-2, lue par M1-3).

## Contexte

J'avais pris les cas d'usage — le potager, le robot désherbeur, la maison, le tracteur,
l'exploitation — pour des *emplois très spécifiés* et j'avais écrit un solveur par cas. Florian a
corrigé : ce sont quelques exemples parmi des millions. « On ne crée pas de software, on crée la
base de connaissances qui permet d'exécuter tout ça, hors ligne. » Claude Code, OpenCode ou
n'importe quel agent couplé à des modèles spécialisés écrit le planificateur de potager en dix
minutes — **à condition d'avoir la base sous la main**. Et ce que l'autonomiste attend va plus loin
qu'une réponse : il doit **entraîner lui-même** ses réseaux (ses capteurs ESP32 croisés avec ses
récoltes et ses dates ; la politique de son robot) sans les outils NVIDIA ; il vit sur panneaux
solaires, donc chaque calcul se paie en **wattheures** ; et il veut, sur un SSD sécurisé,
**absolument tout ce qu'il faut pour reproduire la technologie depuis zéro** si la société
s'effondre — même si la plupart veulent simplement vivre déconnectés.

## Décision

1. **Le produit est la base de connaissance, servie par MCP, hébergée sur Internet Archive.**
   Concrètement : le **catalogue** (ce qui existe, où, sous quelle licence, à jour), des
   **centaines de shards d'index** (un par corpus, construits en CI, publiés sur Internet Archive
   — rien ne transite par la machine du mainteneur), le **serveur MCP** qui les sert avec le texte,
   les chiffres et les règles à n'importe quel client hors ligne, et les **fichiers de
   connaissance** (`knowledge/`) qui rendent le corpus actionnable : chiffres sourcés, cultures,
   coûts de calcul, règles, portes humaines. Le logiciel d'Arche se limite à ce qui **sert** cette
   base sans réseau : cataloguer, télécharger, servir, indexer, chercher, exposer. Tout le reste est
   un exemple.

2. **Les solveurs et les recettes sont des exemples génériques, pas le périmètre.** `garden_plan`,
   `bom_substitute`, les calculateurs, les cinq recettes restent dans le dépôt — Florian veut les
   garder comme cas très génériques — et sont présentés comme tels : *« voici ce qu'un agent fait
   avec la base »*. Ils ne définissent pas ce qu'Arche couvre ; ils montrent la forme (inventaire →
   corpus → solveur → livrable → porte humaine) qu'un agent reproduit pour le millionième cas. Le
   critère de ce qui entre dans `src/` change : *est-ce que ça sert la base, ou est-ce que ça la
   remplace ?* Un solveur la remplace — il vit dans `examples/` ou reste comme démonstration.

3. **De bout en bout, y compris ce que l'utilisateur apporte.** `arche index add` indexe ses PDF,
   ses ebooks, ses notes Markdown : extraction (PDF via pdftotext, EPUB lu à la main, ZIM via
   zimdump), découpage, embedding reprenable, shard + texte local, cherchable tout de suite
   (BM25 local) et par vecteur dès qu'Ollama sert le modèle. `arche index build` fait la même chose
   pour une ressource du catalogue ; `arche index fetch` récupère les shards publiés ;
   `index-build.yml` les construit et les publie pour tout le monde, avec un plan
   (`catalog/index-plan.yaml`, 120 corpus texte au premier passage, les plus gros marqués pour un
   runner GPU). Les sources de référence bien documentées sont ce qui **évite les hallucinations** ;
   les documents de l'utilisateur les **consolident** — les deux sont dans le même index.

4. **Entraîner en local est un besoin de premier rang.** Le paquet `training` met en cache PyTorch
   CPU (ROCm/MPS selon la machine), scikit-learn, PEFT (LoRA sur ses propres notes), LeRobot
   (politiques de robot), tinygrad (un moteur lisible de bout en bout, sans CUDA), TFLite Micro
   (inférence sur l'ESP32 du capteur), avec la liste `requirements/ml-offline.txt`. Un réseau
   capteurs → récolte s'entraîne en minutes sur CPU ; une politique de robot en heures — dans la
   file de tâches (ADR 0012). Ce qui manque encore, et qui est de la connaissance à écrire : la
   méthode (comment structurer ses relevés, quoi entraîner, comment évaluer sans se mentir).

5. **L'énergie est une dimension de chaque estimation.** `knowledge/compute.yaml` porte la
   consommation par classe de machine ; l'estimateur rend les wattheures avec les secondes. Le
   résultat qui compte pour quelqu'un sur panneaux : le 27B sur un portable à 8 Go coûte ≈ 1 h 27
   et ≈ 65 Wh par réponse, la même réponse sur une tour avec carte graphique ≈ 1 min et ≈ 9 Wh. La
   machine rapide est aussi la plus sobre par réponse — le conseil qui en découle est dans la sortie,
   pas dans un interdit.

6. **Les modèles plus légers que Claude sont la cible, pas une concession.** Tout ce qui précède
   est conçu pour qu'un modèle de 4 à 9 milliards, après un blackout complet, fasse « la même chose
   avec toute la diversité » : la base fournit les faits, les chiffres, les méthodes, les portes ;
   le modèle assemble. Plus la base est bonne, moins le modèle a besoin d'être gros.

## Conséquences

- Le MVP change d'axe : le chemin critique devient **catalogue → shards publiés → MCP → un client
  léger qui s'en sert**, et le premier livrable mesurable est *N corpus indexés et publiés* avec
  `arche eval` qui dit ce que la recherche retrouve. Les solveurs sortent du chemin critique.
- `src/core/rag/{extract,build}.ts`, `src/commands/index.ts`, `scripts/index/*`,
  `.github/workflows/index-build.yml`, `catalog/index-plan.yaml` sont écrits ; le canal local (BM25
  sur les documents de l'utilisateur) et la résolution locale des locators sont dans `retrieve.ts`
  et le serveur MCP. Testé de bout en bout avec un faux embedder, y compris la reprise après une
  coupure au milieu de l'embedding.
- Le catalogue gagne `zim-tools`, `poppler-utils`, `pip-ml-cache`, `git-tinygrad`,
  `git-tflite-micro`, le paquet `training`, et trois listes `requirements/` (Python, ML, npm) qui
  sont de la connaissance — ce qu'il faut réchauffer avant la coupure.
- Reste à écrire, en connaissance et non en code : `knowledge/methods/` (comment planifier, comment
  dériver un design, comment entraîner sur ses relevés, comment estimer sans se mentir) ; la
  méthode « reproduire la technologie depuis zéro » comme ordre de lecture du corpus (Appropedia,
  Open Source Ecology, CD3WD, Survivor Library, les manuels) plutôt que comme outil.

## Rejeté

*Un solveur par cas d'usage* : c'est ce que je faisais ; ça ne passe pas à l'échelle du millionième
cas, et ça déplace la valeur de la base vers du code qu'un agent réécrit. *Attendre les shards pour
être utile* : le canal Xapian de chaque ZIM et le canal local des documents de l'utilisateur
répondent dès le premier fichier. *Limiter les modèles au palier « confortable »* : ADR 0012.
*Cataloguer des outils d'entraînement qui exigent CUDA ou un compte cloud* : ils tombent avec le
réseau.
