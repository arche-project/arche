# Les trous pour un autonomiste

> Analyse du catalogue au 11 septembre 2026 (248 ressources, 20 paquets) du point de vue de
> quelqu'un qui vit **en régime permanent** hors du système, et pas de quelqu'un qui traverse un
> événement de 72 heures. Critique franche. English: [SELF-RELIANCE-GAPS.md](../en/SELF-RELIANCE-GAPS.md)

## 0. La distinction qui structure tout

Un **prepper** se prépare à un événement : il stocke, il attend, il reprend sa vie.
Un **autonomiste** remplace des fonctions : eau, chaleur, calories, soins, réparation — pour toujours,
avec des saisons, de l'usure, des pannes et des gens.

Ce sont deux catalogues différents. Le nôtre est aujourd'hui à 80 % un catalogue de prepper
outillé et à 20 % un catalogue d'autonomiste. Les chiffres le montrent sans discussion.

## 1. Le constat chiffré : le catalogue a dérivé

| Catégorie | Ressources | Ce que ça devrait être pour un autonomiste |
|---|---|---|
| médical | 41 | bien |
| agriculture | 36 | bien |
| **robotique** | **35** | **luxe absolu** — un autonomiste ne fera jamais tourner un bras SO-101 |
| IA | 20 | outil, pas fin |
| énergie | 17 | insuffisant (cf. §3) |
| électronique | 15 | correct |
| fabrication | 13 | insuffisant |
| **construction** | **2** | **le toit, l'isolation, le chauffage : c'est la survie l'hiver** |
| **eau** | **2** | **la première contrainte de toute autonomie** |
| **alimentation** | **5** | conservation uniquement ; rien sur produire ses calories |
| **société** | **4** | le groupe est ce qui casse en premier |
| **juridique** | **1** | tout le parcours administratif de l'installation |
| textile, hygiène | **0** | absent |
| transport | **0** | absent |

Trois chiffres de plus, aussi parlants :

- **68 ressources sur 248** sont visibles pour le profil *low-tech*. Un autonomiste sans électricité
  fiable — c'est-à-dire tout autonomiste en février — voit un quart du catalogue.
- **56 ressources sur 248** contiennent du français. Pour un projet dont le cœur de cible est
  francophone, c'est un problème de fond, pas un détail.
- **34 ressources sur 248** sont `essential`. L'autonomiste ne sait donc pas par où commencer.

**Ce n'est pas un reproche sur la robotique** : LeRobot et les bras imprimables sont excellents et
servent Robot Academy. Mais dans *ce* catalogue, ils doivent descendre en `optional` et sortir du
profil `novice`, sinon un débutant télécharge 300 Go dont 40 % ne le nourriront jamais.

## 2. Les trous par domaine, dans l'ordre où ils tuent

La règle de survie (règle des 3) donne l'ordre : 3 minutes sans air, 3 heures sans abri par grand
froid, 3 jours sans eau, 3 semaines sans nourriture. Notre catalogue est construit dans l'ordre
inverse.

### 2.1 Eau — C1, le trou le plus grave

On a : *zimgit-water* (20 Mo), un capteur de qualité, un bélier hydraulique, une page Appropedia.
On n'a rien sur : **remonter** l'eau sans électricité (pompe à corde, pompe à balancier, bélier
dimensionné), **stocker** (combien de m³, cuve enterrée ou hors-sol, gel hivernal, algues,
renouvellement), **capter** (dimensionner une toiture, premières eaux à écarter, gouttières),
**tester** sans laboratoire (kits bandelettes, ce qu'ils détectent et surtout ce qu'ils ne
détectent pas), **puits** (creuser, buser, protéger la tête de puits contre les infiltrations),
**eaux grises** (filtre à sable planté, phytoépuration), **hiver** (enterrer sous le gel, purger).

**À faire :** entrée `pompe à corde` (Appropedia, CC BY-SA, la pompe la plus copiée du monde),
chapitres eau de *Practical Action* et du CD3WD, manuel WASH d'urgence (Sphère l'a déjà en partie),
fiche imprimable « dimensionner son eau » (dans le nouveau §08). Demander à Kiwix un ZIM du
**SSWM Toolbox** (Sustainable Sanitation and Water Management) si la licence le permet.

### 2.2 Chaleur et habitat — C1

Deux ressources. C'est le trou le plus dangereux après l'eau, parce que le chauffage improvisé
**tue vite** : monoxyde de carbone, feux de cheminée, effondrement de conduit.

Manquent : isolation (ordres de grandeur, matériaux locaux : paille, chanvre, laine, terre),
**poêle et conduit** (tirage, ramonage, distances de sécurité, détecteur de CO), poêle de masse et
rocket stove (le Low-tech Lab et OSE couvrent, mais leurs ZIM ne sont pas encore construits),
charpente et couverture (réparer une toiture avant l'hiver), maçonnerie et chaux, humidité et
moisissures (santé respiratoire), fenêtres et volets, solaire passif, **cave** (conserver sans
électricité — c'est aussi de l'alimentation).

**À faire :** fiche imprimable « chauffer sans tuer personne » (CO, ramonage, distances) ; entrées
*Build It Solar*, *Appropedia construction*, chapitres construction du CD3WD ; pousser la recette
ZIM Low-tech Lab (déjà en attente d'autorisation) — c'est là qu'est le meilleur contenu FR.

### 2.3 Calories et nutrition — C1, le trou le plus sous-estimé

On a 36 entrées « agriculture » : des outils, des logiciels de gestion, des bases de plantes. On n'a
**aucune** ressource qui réponde à la seule question qui compte : *combien de surface, de temps et
de semences faut-il pour nourrir une personne pendant un an, et qu'est-ce qui manquera ?*

Les autonomistes échouent presque toujours sur les mêmes quatre points :

1. **Les calories** : un travail physique de ferme demande 3 000 à 4 000 kcal/jour, pas 2 000. Les
   potagers de « légumes » produisent des vitamines, pas de l'énergie. Il faut des féculents.
2. **Les matières grasses** : c'est le plus difficile à produire en climat tempéré (huile de colza
   ou de tournesol = presse ; sinon graisse animale). Presque personne ne le planifie.
3. **Le sel** : 3 à 5 kg par personne et par an, impossible à produire à l'intérieur des terres,
   inaltérable, dérisoire à stocker. C'est l'angle mort parfait.
4. **La soudure de printemps** : mars-mai, les réserves sont finies et rien n'est récolté. C'est
   historiquement la période de famine, et aucune ressource du catalogue n'en parle.

Manquent aussi : céréales (semer, battre, vanner, **moudre**, faire du pain au levain), laitier
(traite, présure, fromage, beurre), abattage et découpe, salaison longue, semences (quantités et
**effectifs minimaux** pour éviter la consanguinité), rotations et fertilité sans intrants, vitamine
C en hiver (scorbut : choucroute, cynorhodons, pommes de terre), B12.

**À faire :** fiche 08 « les chiffres de l'autonomie » (livrée avec ce document), entrées FAO
(stockage des grains, transformation à la ferme), *Wikibooks Cookbook*, chapitres alimentation du
CD3WD, et une entrée dédiée « semences : quantités et effectifs » à partir de Practical Plants et
des réseaux semenciers.

### 2.4 Outils, réparation et métallurgie — C2

Le catalogue sait imprimer en 3D et souder de l'électronique. Il ne sait pas **affûter une lame**,
**refaire un manche**, **river**, **forger un outil simple**, **récupérer de l'acier**, choisir un
lubrifiant, un adhésif, une visserie. La question de fond est : *qu'est-ce qui répare les outils de
réparation ?* Survivor Library (235 Go, anglais du XIXe) est la seule réponse actuelle, c'est trop
gros et trop indirect.

**À faire :** extraire une sélection « atelier minimal » de Survivor Library et d'Appropedia ;
entrées forge et affûtage ; fiche imprimable « les 20 outils qui réparent tout le reste ».

### 2.5 Santé sur la durée — C2

On est bon sur l'urgence (premiers secours, obstétrique, PCIME, dentaire, plantes). Il manque le
**régime permanent** : maladies chroniques quand la pharmacie ferme (hypertension, diabète,
thyroïde — avec l'honnêteté de dire ce qui n'a **pas** de substitut : l'insuline ne se remplace
pas), **lunettes** (une myopie non corrigée est un handicap majeur ; les dioptries se stockent),
hygiène collective (poux, gale, puces), infections de plaie et antibiothérapie (on documente la
prévention, pas la fabrication), carences hivernales, et **la mort** — que faire d'un corps, ce que
dit la loi, ce que fait un groupe. Personne n'en parle et tout le monde y sera confronté.

### 2.6 Animaux — C2 (partiellement comblé)

Le vétérinaire est couvert depuis hier. Reste : **fourrage** (faire du foin, quantités par animal et
par hiver), reproduction et saisons, traite, abattage et découpe, cuir et peaux, **animaux de
trait** (le cheval remplace le tracteur quand le gazole s'arrête), et le calcul qui fâche : une
poule mange ~45 kg de grain par an, six poules par personne consomment presque la surface céréalière
d'un humain. Les animaux ne sont rentables que s'ils mangent ce que nous ne pouvons pas manger.

### 2.7 Transport et mobilité — C3, totalement absent

Zéro ressource. Manquent : réparation de **vélo** (le vélo est la machine la plus efficace jamais
construite et la première à repartir), mécanique auto sans garage, stockage et vieillissement des
carburants, traction animale, remorques, gazogène.

### 2.8 Textile, hygiène, quotidien — C3, totalement absent

Zéro ressource. Coudre, rapiécer, tricoter, chaussures, savon (cendre + graisse), lessive, gestion
des règles, couches lavables, chauffer l'eau du bain. Ce sont les sujets qui font la différence
entre survivre et vivre, et ils sont invisibles dans tous les catalogues de survivalisme — parce
qu'ils sont historiquement associés au travail des femmes. C'est un angle mort culturel, pas
technique.

### 2.9 Groupe, décision, transmission — C2

Quatre ressources, dont trois sur la crise aiguë. Rien sur la durée : répartition du travail,
décision collective, conflits de voisinage, école à la maison **organisée** (on a des manuels, pas
de programme), accueil de nouveaux venus, et la transmission des gestes — qui ne s'apprennent pas
dans un ZIM.

### 2.10 Administratif et juridique — C2

Une seule ressource. Or l'autonomiste passe par un parcours très concret : acheter du terrain, lire
un PLU, déposer un permis, déclarer un puits, un assainissement, des ruches, des animaux, gérer
l'impôt et l'assurance, la scolarisation à domicile (contrôlée), les aides. Le ZIM Service-Public
est toujours en arbitrage — c'est maintenant le plus rentable des arbitrages en attente.

## 3. Les trous méthodologiques (plus graves que les trous de contenu)

### 3.1 Il n'y a aucun chiffre — C1

Le catalogue explique *comment*, jamais *combien*. Or l'autonomisme est une affaire de
dimensionnement : litres par jour, m² par personne, stères par hiver, kWh, kg de semences, m³ de
cuve. Sans ordres de grandeur, on construit trop petit et on s'en aperçoit en février.
**C'est le trou le plus facile à combler et le plus utile** → fiche 08 livrée avec ce document.

### 3.2 Rien n'est saisonnier — C2

Un autonomiste ne se demande pas « comment faire des conserves », il se demande « on est le
15 novembre, qu'est-ce que je dois avoir fait ». Le catalogue est une bibliothèque, pas un
calendrier. Un **calendrier de l'autonomie** (12 pages, une par mois, adapté au climat tempéré) est
cheap à produire et transformerait l'usage.

### 3.3 Lire n'est pas savoir faire — C2

Greffer, traire, ferrer, poser un garrot : la documentation ne transfère pas le geste. Le projet
doit assumer d'organiser la **pratique** — « une compétence par mois », carnet de bord, et surtout
orienter vers les gens qui savent (associations, fermes, fablabs) tant que le réseau existe.

### 3.4 Le catalogue ne connaît pas son utilisateur — C3

Le profil `bunker` voit 247 ressources sur 248. Ce n'est pas un profil, c'est l'absence de tri. Il
faudrait un profil **`autonomiste`** distinct — permanent, saisonnier, low-tech-compatible,
francophone d'abord — dont le socle serait eau + chaleur + calories + santé + groupe, et qui
masquerait robotique, IA lourde et dev.

## 4. Ce que je propose, par ordre de rendement

1. **Fiche 08 « les chiffres de l'autonomie »** — livrée aujourd'hui. Une page, zéro dépendance,
   utile immédiatement, et c'est le trou n°1.
2. **Profil `autonomiste`** dans `profiles.yaml` + descendre la robotique en `optional` hors du
   profil novice. Une heure de travail, change tout l'usage.
3. **Eau et habitat** : dix entrées vérifiées (pompe à corde, SSWM, Build It Solar, chapitres
   CD3WD/Practical Action) + fiche « chauffer sans tuer personne » (CO, ramonage).
4. **Calendrier de l'autonomie** (12 pages imprimables).
5. **Textile, hygiène, transport** : trois fiches et une dizaine d'entrées — le coût est faible,
   l'absence est totale.
6. **Service-Public / Légifrance** : trancher l'arbitrage, c'est le seul contenu qui manque pour
   la partie « s'installer légalement ».

Ce que je ne propose pas : ajouter des sources. On en a 248, dont 30 à licence incertaine et
beaucoup d'URL à fixer. Le prochain gain n'est pas dans le volume, il est dans **la structure, les
chiffres et le français**.
