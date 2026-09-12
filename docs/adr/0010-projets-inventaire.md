# ADR 0010 — L'unité de travail est le projet ; le projet commence par l'inventaire

**Statut** : accepté (recadrage de Florian, 2026-09-11) — **relu par l'ADR 0013** : les solveurs et les cinq recettes sont des *exemples génériques* de ce qu'un agent fait avec la base, pas le périmètre du produit. Redéfinit ce qu'Arche *fait* par-dessus
les ADR 0007 (RAG), 0008 (sans démon) et 0009 (schémas en code), qui restent tous en vigueur.

**Contexte.** Le MVP avait été écrit autour d'une *question* : « l'eau de ma citerne est verte,
est-ce que je peux la boire ? ». Florian l'a corrigé : ce n'est pas le scénario. Les scénarios sont
ceux de quelqu'un qui **fait** :

- « je suis autonomiste, j'ai des parcelles et X semences, fais-moi le planning » ;
- « je dois construire une maison bioclimatique, j'ai telles ressources à disposition » ;
- « le réseau est coupé, je veux un robot qui reconnaît les plantes à arracher — génère-moi les
  plans, le PCB, la liste des composants, faciles à trouver ou avec ce que j'ai » ;
- « j'ai un vieux tracteur mécanique à boîte manuelle, je veux l'automatiser et lui donner un
  cerveau IA ».

Ces quatre demandes ont la même forme. Une **situation** (ce que j'ai : terrain, semences,
matériaux, composants, machines, outils, bras, climat), un **objectif** (un plan, une maison, un
robot, un tracteur qui se guide), des **livrables** (un calendrier, des plans, un schéma, une
nomenclature, du firmware), et des **portes** que seul un humain franchit (la poutre porteuse,
le moteur sur le volant, la plante arrachée). Une question-réponse sur un corpus ne couvre pas
ça. Un RAG seul non plus : « fais-moi le planning » ne se trouve dans aucun article.

Et il y a la phrase qui revient dans chaque scénario : *avec ce que j'ai à ma disposition*.
C'est la contrainte qui distingue un autonomiste d'un client. Elle doit être l'entrée, pas une
note de bas de page.

**Décision.**

1. **L'unité de travail d'Arche est le projet, et un projet commence par un inventaire.**
   L'inventaire est un fichier YAML de l'utilisateur (`src/core/project/inventory.ts` :
   parcelles, semences, matériaux, composants, machines, outils, climat, personnes). Il ne
   contient que des faits sur *sa* situation. Tout solveur le lit ; aucun ne devine ce qui n'y
   est pas — il dit ce qui manque (`arche project check`).

2. **Un type de projet est une recette** (`knowledge/projects/<type>.yaml`), validée contre le
   catalogue, les calculateurs et les générateurs (`arche project types`). Elle déclare : ce que
   l'inventaire doit contenir ; le **corpus** à lire d'abord (des identifiants du catalogue, pas
   « tout ») ; les **solveurs** et **générateurs** applicables ; les **livrables** et *qui* les
   produit — `solver` (déterministe), `assistant` (le modèle, à partir de sources et de solveurs),
   `human` ; les **portes humaines** ; les **interdits** ; ses **limites**, écrites. Quatre
   recettes existent : `potager` (solveur en code), `robot-desherbeur`, `maison-bioclimatique`,
   `tracteur-autonome` (recettes : la démarche est écrite, le solveur pas encore). Le texte de la
   recette est injecté dans le prompt de l'assistant quand le projet est ouvert (`recipePrompt`).

3. **Le solveur fait le plan ; le modèle l'explique.** Même règle que pour les chiffres (ADR 0007
   §6) et les schémas (ADR 0009), étendue à la planification : un modèle local de 4 à 9 milliards
   de paramètres à qui l'on demande « le planning de mes parcelles » produit un calendrier
   plausible et faux. Il appelle donc `garden_plan` (`src/core/project/garden.ts`), qui lit
   `knowledge/crops.yaml` et l'inventaire, et rend le calendrier, l'attribution des parcelles
   avec rotation des familles, les rendements estimés, les cultures inconnues et les
   avertissements — en Markdown, en iCalendar et en JSON. Le modèle reçoit le plan rendu ; il
   n'a pas le droit d'en inventer un autre. Les valeurs de `crops.yaml` portent `verified: false`
   tant qu'une PR ne les a pas rattachées à une source, et le plan produit le dit.

4. **On dérive un design de référence ; on ne conçoit pas de zéro.** Pour tout projet physique
   avec de l'électronique (robot, tracteur), la recette impose un point de départ existant et
   vérifié — OpenWeedLocator, FarmBot, Acorn, AgOpenGPS — et l'assistant explique chaque écart.
   La nomenclature passe par un solveur de **substitution** (`src/core/project/bom.ts`) : la fiche
   de référence liste ses équivalents et *ce qui change* quand on les prend ; le solveur croise
   avec l'inventaire, dit ce qui est en stock, ce qui manque, où le trouver, et **signale chaque
   substitution**. Le modèle ne décide jamais seul qu'un composant en remplace un autre.

5. **Les portes humaines sont dans la recette, et le plan s'arrête là où elles ne sont pas
   franchies.** L'élément porteur d'une maison est dimensionné par un humain qualifié ou une
   abaque citée. Le tracteur commence par l'étage 0 (arrêt d'urgence câblé, indépendant de tout
   logiciel) et garde un humain à bord jusqu'à l'étage 4 inclus. Le robot n'arrache rien avant
   qu'un humain ait validé un passage complet de détections. Ce ne sont pas des conseils dans une
   réponse : ce sont des lignes de la recette, et l'assistant les cite avant de livrer.

6. **Un modèle de langue ne pilote jamais un actionneur.** Le LLM planifie, dérive, explique,
   écrit du code source ; le contrôle temps réel est un firmware déterministe avec watchdog et
   arrêt d'urgence physique. « Lui donner un cerveau IA » veut dire : planification de passages,
   détection d'obstacles par vision classique (OpenCV) ou petit modèle, superviseur — jamais un
   modèle génératif dans la boucle de commande.

7. **L'identification garde ses deux sens.** Reconnaître une plante *à arracher* (robot) est
   autorisé, avec confirmation humaine des premiers passages et un modèle de vision local — la
   détection de couleur seule ne suffit pas. Reconnaître une plante *à manger* reste un garde-fou
   (ADR 0007) : le solveur du potager ne dira jamais qu'une plante est comestible, et la caméra du
   robot non plus.

**Conséquences.**

- Le MVP change de scénario de référence : le potager (solveur complet, risque nul) prouve
  l'architecture inventaire → recette → solveur → livrables → explication sourcée ; le robot
  désherbeur est le premier projet physique (design de référence + nomenclature par substitution
  + schéma en code) ; maison et tracteur entrent comme recettes, avec leurs portes, et gagnent
  leurs solveurs après. `docs/fr/MVP.md` est réécrit en conséquence.
- Le catalogue gagne les références qui manquaient aux recettes : `openfarm-crops-rescue` (340
  fiches de cultures, CC0 — la donnée derrière `crops.yaml`), `git-openweedlocator` (détection
  d'adventices sur Raspberry Pi, MIT), `sweethome3d` (plans de maison, GPL). AgOpenGPS, Acorn,
  FarmBot, EnergyPlus y étaient déjà.
- Le client IA de l'utilisateur reçoit tout ça par MCP (ADR 0011) : la recette en prompt
  (`arche_project`), l'inventaire en argument des solveurs (`garden_plan`, `bom_substitute`).
  Il n'y a pas d'`arche assist` : Arche est le serveur, jamais le client.
- Ce qui n'est pas décidé : le format des fiches de design de référence pour `bom_substitute`
  (une nomenclature YAML par design, dans `knowledge/designs/` — à écrire avec le premier robot) ;
  les solveurs `maison` (enveloppe, quantitatif) et `tracteur` (étage 1), qui viennent après le
  MVP ; et la façon dont l'interface remplit l'inventaire (formulaire, ou conversation qui écrit
  le YAML).

**Rejeté.** *Laisser le modèle planifier « en langage naturel » avec le corpus en contexte* :
c'est ce que tout le monde fait, et c'est faux d'une manière qu'on ne peut pas mesurer. *Un
inventaire implicite reconstruit par le modèle au fil de la conversation* : invérifiable et perdu à
la fermeture ; le fichier YAML, lui, se relit, se corrige et se garde. *Concevoir les PCB de zéro
avec le modèle* : un modèle local se trompe sur les valeurs et les brochages ; le design de
référence est la seule base sur laquelle ses écarts se relisent.
