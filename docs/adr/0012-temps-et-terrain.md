# ADR 0012 — Le temps s'adapte à la machine, jamais les capacités ; le terrain entre par l'inventaire

**Statut** : accepté (deux exigences de Florian, 2026-09-11). Complète l'ADR 0010 (inventaire) et
l'ADR 0011 (serveur MCP) ; corrige une règle de l'ADR 0007 (paliers IA).

## Contexte

Deux phrases. La première : « les gens qui vont faire appel à nous ont intégré toute
l'automatisation de leur exploitation agricole ou autre, donc on doit pouvoir gérer des cartes
satellites 3D, des prises de vue au drone, du LiDAR, des caméras ». La seconde : « adapter la
puissance à la capacité de calcul de l'ordinateur : même si le gars a 2 To de données sur son SSD et
8 Go de RAM, il va falloir qu'on adapte le temps de calcul, pas qu'on limite ses capacités ; si son
workflow doit passer par quatre IA différentes et que ça prend une minute ou une heure au lieu de
quelques secondes, c'est pas grave, il faut que ce soit résilient ».

Jusqu'ici, le catalogue proposait un **palier IA** selon la RAM et **excluait** les modèles
au-dessus : un utilisateur à 8 Go ne voyait jamais le 27B. C'est l'inverse de la demande. Et la
bibliothèque ne savait rien des **données que l'utilisateur produit lui-même** — la seule chose
qui, dans une exploitation automatisée, vaut plus que Wikipédia.

## Décision

### A. Le temps s'adapte, jamais les capacités

1. **Un modèle trop gros pour la mémoire n'est jamais interdit.** Il tourne depuis le disque
   (mmap), lentement, et Arche dit combien. Le planificateur ne filtre plus un modèle sur la RAM
   (`src/core/recommend.ts`) : demandé explicitement, il est marqué `reason.explicit_slow`, pas
   refusé. Les paliers IA restent ce qu'ils sont — *ce qui tourne confortablement* — et cessent
   d'être une limite. Un *logiciel* qui exige de la RAM (ODM à 16 Go) reste filtré : lui ne
   ralentit pas, il plante.

2. **L'estimation est un outil, pas une opinion.** `src/core/compute.ts` calcule, depuis
   `knowledge/compute.yaml` (bandes passantes RAM/VRAM/disque, vitesse de lecture du prompt,
   octets par paramètre, réserve système — ±3×, avec des points de référence publics), où les poids
   actifs tiennent (VRAM, RAM, disque), le débit en tokens/s, la durée de chargement, de lecture du
   prompt et de génération, et pour un workflow à plusieurs modèles le nombre de rechargements et
   l'ordre qui les minimise. `arche compute estimate` et l'outil MCP `estimate_pipeline` le
   rendent AVANT de lancer : « ≈ 1 h 27 sur cette machine » est une information, et c'est
   l'utilisateur qui décide. Un MoE (35B-A3B) y apparaît pour ce qu'il est : 35 Go de poids, 3 Go
   relus par token — la découverte de 2026 pour le CPU, chiffrée.

3. **Une heure de calcul survit à une coupure.** `src/core/jobs.ts` est une file de tâches sans
   démon (ADR 0008) : un fichier JSON par tâche dans `.arche/jobs/`, écrit atomiquement avant et
   après chaque étape, un curseur de reprise, des tentatives avec attente croissante, un verrou
   qui périme quand l'exécuteur meurt. Au redémarrage, `runPending` reprend à l'étape où on en
   était — jamais du début. C'est ce qui rend acceptable qu'un traitement prenne une heure : il
   ne se perd pas. Testé avec un crash simulé.

4. **En série, un modèle à la fois.** Une machine hors ligne ne charge pas quatre modèles ; elle
   les enchaîne, et l'ordre des étapes groupe les appels au même modèle pour ne pas recharger.
   `keep_alive` court entre deux modèles différents, quantification Q4 par défaut, contexte borné
   aux extraits utiles : ce sont des réglages, ils sont dans les conseils rendus par l'estimateur,
   pas dans des interdits.

### B. Le terrain entre par l'inventaire

5. **Les données de terrain de l'utilisateur sont une section de l'inventaire** (ADR 0010) :
   `datasets[]` — orthophoto, MNS/MNT, nuage de points, tuiles satellite, photos, vidéo, flux
   caméra, journal de capteurs, trace GNSS, carte de parcelles — avec chemin, système de
   coordonnées (`EPSG:2154` en France), résolution, date, provenance. Arche ne produit pas ces
   données ; il les *décrit* pour que les outils et le client IA sachent qu'elles existent, et les
   recettes disent lesquelles manquent.

6. **La chaîne qui traite le physique est libre, native, et au catalogue** (`field-data.yaml`) :
   OpenDroneMap (photos → orthophoto, MNS, nuage, 3D ; installation native, pas Docker), PDAL
   (LiDAR : classer, rastériser, volumes), CloudCompare (voir, mesurer, comparer), QGIS (le SIG où
   tout se rejoint, vue 3D intégrée, tuiles satellite téléchargées avant la coupure), Meshroom
   (l'objet plutôt que le terrain, avec GPU), Mosquitto (le bus MQTT des capteurs), motion
   (caméras sans Docker) et Frigate (détection d'objets, Docker, donc `optional`). Node-RED,
   Home Assistant, ESPHome, OpenCV, AgOpenGPS y étaient déjà. Un cinquième type de projet,
   `exploitation-automatisee`, les relie avec ses portes : un drone ne vole jamais sur ordre d'un
   modèle, une caméra alerte et n'actionne rien, toute mesure coûteuse est relue sur la carte.

7. **Le traitement lourd est une tâche de file, pas une conversation.** Une parcelle de 500 photos
   dans ODM sur CPU, c'est des heures : l'estimateur le dit, la file le porte, le client IA lit le
   résultat après. L'IA n'est jamais dans la chaîne de traitement géométrique — QGIS, PDAL, ODM
   donnent les coordonnées, les surfaces et les volumes, avec leur système de coordonnées ; le
   modèle explique et ne chiffre pas.

## Conséquences

- L'Édition Autonomiste passe à **111 ressources, ~96 Go** avec le corpus de la cinquième recette
  (QGIS 1,5 Go, ODM 3 Go, Meshroom 1,5 Go, Frigate 1,5 Go…) : la cible physique reste un SSD de
  128 Go, avec moins de marge ; sans Debian DVD-1 et sans Frigate/Meshroom, ~85 Go.
- Les fiches de modèles gagnent, quand c'est utile, des tags `params:` et `active:` lus par
  l'estimateur ; l'identifiant (`35b-a3b`) suffit dans la plupart des cas.
- Ce qui reste à faire : `arche compute bench` (mesurer la machine réelle et corriger
  `compute.yaml` par ses propres chiffres) ; les gestionnaires d'étapes de la file pour Ollama et
  pour ODM (`ollama.generate`, `odm.run`) ; un tag d'inventaire pour la RAM et le disque de la
  machine, pour que l'estimation n'ait plus à détecter.

## Rejeté

*Filtrer les modèles par RAM « pour protéger l'utilisateur »* : c'est décider à sa place, et c'est
faux — mmap fonctionne, lentement. *Un ordonnanceur qui charge plusieurs modèles en parallèle* :
sur une machine de 8 Go, c'est l'échange perpétuel, plus lent que la série. *Un démon de file de
tâches* : ADR 0008 ; un dossier de JSON et un exécuteur qu'on lance suffisent, et survivent mieux.
*Intégrer un pilote de drone ou un NVR dans Arche* : le physique est piloté par les outils faits
pour ça ; Arche les catalogue, les relie, et estime ce qu'ils coûtent en temps.
