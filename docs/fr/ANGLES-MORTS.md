# Angles morts — ce qu'Arche ne fait pas (encore)

> Critique franche, pas validation. Criticité : **C1** = met en échec le projet dans son cas d'usage
> principal · **C2** = grosse perte de valeur · **C3** = à faire, pas urgent.
> Chaque point a une proposition concrète. English: [BLIND-SPOTS.md](../en/BLIND-SPOTS.md)

## A. Failles du modèle lui-même

### A1 · L'utilisateur n'a pas téléchargé avant la coupure — C1

C'est *le* scénario probable : on s'y intéresse quand ça coupe. Arche ne peut rien pour lui. Le
seul levier est **social** : que des disques préparés existent *autour* de lui.
**Proposition :** (1) faire du bundle USB (`arche export`) un objet de première classe : une page
« Préparer un disque pour quelqu'un d'autre » dans le guide débutant, avec un preset « disque à
donner » (FR + EN nopic + santé + IA 4B, 150 Go) ; (2) encourager les « points Arche » (fablabs,
bibliothèques municipales, associations) qui gardent un disque à jour et le dupliquent (`rsync`, ou
simple copie) — le projet gagne à documenter la duplication disque-à-disque plus que le
téléchargement ; (3) réseau LAN/mesh : `arche serve --bind 0.0.0.0` sur un Pi couvre un immeuble. → Traité dans [COMMUNAUTE.md](COMMUNAUTE.md) (points Arche) et [DISTRIBUTION.md](DISTRIBUTION.md) (torrent, mDNS).

### A2 · Kiwix est un point de défaillance unique — C1

90 % des ressources dépendent de download.kiwix.org, de l'OPDS, et du format ZIM. Si Kiwix (une
petite association suisse) disparaît, le catalogue meurt avec.
**Proposition :** (1) `source.mirrors` déjà prévu dans le schéma : y inscrire les miroirs officiels
(mirrorservice.org, dumps.wikimedia.org, mirror.download.kiwix.org) et faire tourner l'updater sur
plusieurs miroirs ; (2) référencer les **dumps bruts** Wikimedia (`*-pages-articles.xml.bz2`) comme
plan B, avec un outil de lecture minimal ; (3) miroir du code de **libzim/kiwix-tools** et de
**Zimit** dans `git-mirrors.yaml` (aujourd'hui seuls les binaires sont référencés) — sans les
sources, plus de lecteur dans dix ans (voir A3).

### A3 · Lire un ZIM en 2036 — C2

ZIM est ouvert et documenté, mais son lecteur est un binaire lié à libzim/Xapian/zstd. Un vieux
binaire sur un OS neuf ne tourne pas forcément.
**Proposition :** (1) mirrorer les **sources** de libzim, kiwix-tools, kiwix-desktop, zim-tools et
leurs dépendances (zstd, xapian, icu) + la spec du format dans `library/git/` ; (2) ajouter au
catalogue une **AppImage** kiwix-desktop (autonome) et l'exécutable `kiwix-serve` statique pour 3
architectures ; (3) garder pour les 10 ZIM essentiels un export **HTML plat** (`zim-tools zimdump`)
lisible par n'importe quel navigateur — c'est 3× plus gros, mais indestructible ; (4) documenter le
tout dans une fiche imprimable « Comment relire ces fichiers » avec le principe du format.

### A4 · Panne matérielle — C1

Un SSD unique = zéro redondance. Les SSD ont une rétention de données limitée hors tension (quelques
années, moins par forte chaleur) ; les clés USB pire.
**Proposition :** (1) le wizard propose explicitement **deux disques** (le second par `arche export`)
et un rappel de **rafraîchir** (recopier) tous les 2–3 ans ; (2) `arche verify` planifié (cron) avec
alerte si corruption ; (3) archives PAR2 (parité) pour les ZIM essentiels : `par2create -r10` répare
10 % de corruption — à intégrer comme option `redundancy: par2` ; (4) préférer un HDD pour l'archive
froide (rétention meilleure) et le SSD pour l'usage ; (5) l'électronique de lecture elle-même :
prévoir un **Pi de rechange** dans un sachet antistatique, et le profil papier (guide low-tech).

### A5 · L'IA locale est fragile et trompeuse — C2

Un 4B hallucine des doses. Les modèles changent de licence. Ollama est un binaire qui bouge vite.
**Proposition :** (1) la conception RAG-avec-citation-obligatoire de [assistant-ia.md](assistant-ia.md) ;
(2) mirrorer **llama.cpp sources** + un GGUF brut par palier (déjà amorcé : `hf-qwen3-8b-gguf`),
pour ne pas dépendre d'Ollama ; (3) un test de « fumée » livré avec la bibliothèque : 20 questions
avec réponse attendue (santé, eau) pour que l'utilisateur mesure la fiabilité de *son* modèle ;
(4) marquer dans l'UI, en permanence, « peut se tromper — vérifiez dans la source ».

### A6 · L'électricité — C1 (hors périmètre, mais conditionne tout)

Rien de tout ça ne fonctionne sans courant. Le projet couvre le *savoir* sur l'énergie, pas la
solution.
**Proposition :** une fiche imprimable « Faire tourner Arche sur 20 W » : Pi 5 + SSD ≈ 8–10 W ; un
panneau de 100 W + batterie LiFePO4 de 50 Ah suffit ; liste de courses avec ordres de grandeur et
références de calcul (Energypedia). Et le profil « vieux portable » : une batterie de portable est
une UPS gratuite.

## B. Domaines de savoir manquants

| Domaine | Criticité | Manque | Proposition concrète |
|---|---|---|---|
| **Juridique / administratif** | C2 | Légifrance et Service-Public sont cités dans le brief mais **absents du catalogue** : pas de ZIM, licence Etalab OK mais volume et structure difficiles. | Zimit ciblé sur service-public.fr (fiches pratiques) ; Légifrance : dumps DILA (Etalab, XML) — trop bruts pour un néophyte, garder pour l'expert. Un ZIM « droit du quotidien » (Wikipédia catégorie Droit français) comme substitut immédiat. |
| **Éducation des enfants** | C2 | Vikidia et PhET, c'est mince. Pas de manuels scolaires, pas de méthode de lecture, pas de programme. | Manuels **Sésamath** (maths collège/lycée, CC BY-SA, PDF), **Wikiversité FR**, Khan Academy FR (94 Go, déjà là mais 2023), banque de dictées/lecture du domaine public (Gutenberg FR). Documenter un « programme minimum » par âge. |
| **Langues** | C3 | Les Wiktionnaires traduisent mot à mot, pas de méthode. | ZIM des cours **freeCodeCamp**-like n'existent pas pour les langues ; référencer les manuels Wikilivres (anglais, espagnol, allemand) et **Tatoeba** (phrases, CC BY). |
| **Psychologie, deuil, stress, enfants traumatisés** | C2 | Rien. Or c'est ce qui casse les groupes en crise. | Guide **Premiers secours psychologiques** (OMS, gratuit, FR), *Où il n'y a pas de psychiatre* (Hesperian, EN, en cours de traduction), fiches IASC. Ajouter la catégorie `society`. |
| **Vétérinaire / élevage** | C2 | Le brief dit « élevage » mais rien de vétérinaire. | *Where There Is No Vet* (Hesperian-like, Practical Action, EN), manuels FAO élevage (CC BY-NC-SA, FR disponibles), Wikipédia catégorie. |
| **Métallurgie, forge, mécanique** | C3 | Survivor Library (235 Go, anglais XIXe) est la seule source. | Extraits ciblés : *Backyard Metalcasting*, manuels Gingery (payants), Open Source Ecology ; Wikipédia + StackExchange Engineering. Une fiche « forge minimale ». |
| **Textile, cuir, savon, hygiène** | C3 | Absent. | Wikilivres, Wikipédia, Appropedia couvrent une partie ; référencer explicitement des articles clés dans les fiches imprimables plutôt que de nouvelles sources. |
| **Hygiène, assainissement, latrines** | C1 | Couvert par Sphère et zimgit, mais **pas mis en avant** : c'est la première cause de mortalité post-catastrophe (diarrhées). | Fiche imprimable dédiée (déjà amorcée : eau) + latrines ; monter `pdf-sanitation-sphere-handbook` en `essential`. |
| **Gestion de groupe, décision, conflits** | C2 | Rien. | Manuel Sphère (organisation), guides de **gouvernance partagée** (sociocratie — sources libres rares), *Community Emergency Response Team* (FEMA, domaine public, EN). Chapitre dédié dans la doc plutôt qu'une source unique. |
| **Nourriture sauvage, plantes, champignons** | C2 | Aucune clé d'identification fiable. Les erreurs tuent. | Wikipédia + Wikimedia Commons ne suffisent pas ; recommander l'**achat papier** d'un guide régional (guide low-tech). Ne pas laisser l'IA identifier un champignon. |
| **Sécurité physique, défense** | C3 | Volontairement absent. | Tenir cette ligne : renvoyer vers *Ready.gov*/FEMA pour la préparation, pas plus. Le projet perdrait ses partenaires institutionnels sinon (voir D10). |
| **Contraception, grossesse, accouchement** | C1 | WikiMed en parle, mais aucun manuel pratique. | *A Book for Midwives* et *Where Women Have No Doctor* (Hesperian, FR existent en partie). |

## C. Angles morts non techniques

### C1 · Transmission sans électricité — C2

Un disque n'apprend rien à personne. Le savoir passe par des gens.
**Proposition :** un dossier `docs/pratique/` : exercices mensuels, « une compétence par mois »,
carnet de bord papier, et un protocole « qui sait quoi » pour un groupe de 10 (matrice de
compétences imprimable). Peu de code, beaucoup de valeur.

### C2 · Organisation sociale — C2

Le projet est pensé pour *un* foyer. Un immeuble, un village, une école ont d'autres besoins :
accès partagé, contrôle de qui modifie quoi, formation.
**Proposition :** documenter le déploiement « point Arche » (Pi + Wi-Fi + tableau d'affichage) et
regarder ce qu'IIAB fait bien (comptes, Moodle, Kolibri) avant de réinventer.

### C3 · Le néophyte ne sait pas qu'il ne sait pas — C2

Trois questions, c'est bien ; mais rien ne lui dit *ce qu'il devrait avoir* ni ne l'entraîne.
**Proposition :** une **liste de contrôle** dans l'UI après installation : « Avez-vous testé
coupé ? Un deuxième disque ? Imprimé les 5 fiches ? Qui d'autre sait s'en servir ? ». Gamifier
légèrement (5 cases).

## D. Biais de contenu

### D1 · Anglophone > francophone — C2

Le meilleur contenu technique (StackExchange, Appropedia, Energypedia, WikEM, MDWiki, zimgit) est
en anglais. Le catalogue le reflète : 60 % des entrées EN. Un néophyte qui ne lit pas l'anglais
perd la moitié de la valeur.
**Proposition :** (1) l'IA locale comme **traducteur** de la bibliothèque (usage 2 de
assistant-ia.md) est la réponse la plus scalable ; (2) prioriser dans le catalogue les rares
sources FR de qualité (Low-tech Lab, Sésamath, Hesperian FR, FAO FR) ; (3) un ZIM **Wikipédia FR
« sélection pratique »** (santé, agriculture, énergie, construction) construit avec `mwoffliner`
sur une liste de catégories — 5 Go au lieu de 52.

### D2 · Biais culturel et géographique — C3

Ready.gov, FEMA, CDC, MedlinePlus : contexte américain (numéros d'urgence, unités, médicaments,
plantes). Appropedia : pays du Sud. Peu de choses pour un climat tempéré européen, un potager en
Essonne, un hiver sans chauffage.
**Proposition :** marquer un champ `region` dans le catalogue (à ajouter au schéma) et faire des
fiches imprimables **localisées** (numéros d'urgence FR, saisons de semis Île-de-France, plantes
locales) — les fiches sont à nous, pas aux sources.

### D3 · Fiabilité variable — C2

Survivor Library mélange des manuels de 1890 avec des conseils médicaux dangereux. StackExchange a
des réponses fausses bien notées. WikiHow est du contenu SEO.
**Proposition :** le champ `reliability` existe déjà ; l'afficher dans l'UI (pastille) et dans le
prompt de l'IA (« source communautaire, vérifier »). Pour la santé, n'admettre que
`reliability: reference`.

### D4 · Actualité gelée — C3

Un ZIM date d'un mois précis. La réglementation, les médicaments, les modèles d'IA évoluent.
Documenter clairement « bibliothèque figée au JJ/MM/AAAA » sur la page d'accueil (`state.json` le sait).

## E. Risques juridiques et de licence

| Source | Licence | Risque | Ce qu'on fait |
|---|---|---|---|
| Wikipédia, Wiktionnaire, StackExchange, Appropedia | CC BY-SA | faible : usage et copie libres avec attribution | `redistribution: attribution` |
| iFixit, WikiHow, Khan Academy, Low-tech Lab, Low-tech Magazine, Sphère | CC BY-**NC**-SA | **moyen** : pas de redistribution commerciale ; un « point Arche » associatif est OK, une entreprise qui vend des disques préparés ne l'est pas | `redistribution: allowed-nc` ; le prévenir dans l'UI expert et dans le guide « préparer un disque pour quelqu'un » |
| Hesperian | Open Copyright (NC) | faible si non commercial | idem |
| Gemma, Llama | licences propriétaires « ouvertes » | moyen : clauses d'usage, restrictions par pays/usage ; **Llama interdit l'usage par l'UE ?** (à vérifier pour Llama 4 ; Llama 3.1 est OK) | privilégier Qwen (Apache-2.0) comme défaut — c'est déjà le cas |
| Survivor Library | domaine public (scans) mais site non libre | faible sur le contenu, incertain sur le ZIM lui-même | `reliability: unknown`, optionnel |
| zimgit-* | mixtes (ONG, gouvernements) | incertain | `redistribution: unclear` ; ne pas les redistribuer nous-mêmes |
| Cartes OSM | ODbL | faible ; attribution + partage à l'identique des *données* dérivées | attribution |
| Contenu généré par l'IA locale | — | **responsabilité** : conseils médicaux erronés. Un avertissement ne suffit pas juridiquement, mais il est nécessaire | bandeau permanent + citation obligatoire + pas de conseil de dose sans source |
| Le projet lui-même (orchestrateur) | MIT | faible : on ne redistribue rien. Attention au jour où on héberge (D3 de DECISIONS) | règle explicite « n'héberge que ce qu'il produit » |

Point spécifique : **le brief parlait de « mirroir » d'Instructables et Hackaday**. Instructables est
sous licence propriétaire (Autodesk) : un ZIM privé est toléré, sa redistribution non. Hackaday
(articles) est © Supplyframe. Ni l'un ni l'autre n'est dans le catalogue, à dessein.

## F. Pérennité du projet lui-même

### F1 · Bus factor = 1 — C1

Un mainteneur, un compte GitHub, une clé. Si Florian s'arrête, le workflow de mise à jour continue
de tourner quelques mois puis tout pourrit (URL mortes, PR jamais mergées).
**Proposition :** (1) organisation GitHub dédiée avec 2 owners dès le premier jour ; (2) le
workflow `catalog-update` **auto-merge** les PR qui ne changent que `size_bytes`/`version`/`url`
(pas les `status`) après 7 jours sans objection — *retiré par M2-3 (audit, erreur 7) : une URL ou un
hachage ne se fusionne jamais sans humain ; étiquette `catalog-sensitive`, relecture à deux* ;
(3) la règle « tout est dans le dépôt » (pas de serveur, pas de base) est déjà respectée : un fork
suffit à reprendre ; (4) documenter un « protocole de succession » d'une page.

### F2 · Financement — C2

Don ≠ revenu. Les coûts sont faibles (CI GitHub gratuite pour du public) mais le temps de curation
est réel.
**Proposition :** viser les financements de **bien commun** (NLnet/NGI, Fondation Wikimédia France,
appels à projets « inclusion numérique » des collectivités) — ce qui suppose le ton de D10 et une
structure (association). Le don individuel reste en complément.

### F3 · Dérive du périmètre — C2

Le brief couvre tout : robotique, ROS, ArduPilot, KiCad, Klipper… Chaque domaine est un travail
de curation à part entière. Le catalogue compte déjà 93 entrées dont 80 % `unverified`.
**Proposition :** une v0.1 **délibérément petite** : le bundle `core` + `health` + `ai` vérifiés à
100 % (URL, checksums, tests de téléchargement réels en CI une fois par mois), le reste étiqueté
« communautaire, non vérifié ». Mieux vaut 15 ressources qui marchent que 93 dont on n'est pas sûr.

### F4 · Dépendance à GitHub — C3

Actions, releases, PR auto : tout est chez Microsoft. Si GitHub ferme le compte ou change les
règles, plus de mises à jour.
**Proposition :** miroir du dépôt sur Codeberg (Forgejo) avec un `git push --mirror` dans le
workflow ; l'updater est du TypeScript ordinaire exécutable n'importe où (`npm run catalog:update`).

### F5 · Le catalogue vieillit plus vite que le code — C2

Les identifiants Kiwix changent (`wikipedia_fr_all_maxi` est stable, mais des ZIM sont renommés,
fusionnés, abandonnés — WikiHow en est la preuve, et freeCodeCamp est passé de plusieurs Go à 7 Mo).
**Proposition :** déjà en place : `status: missing`, alerte « chute de taille ». À ajouter : une
règle de **quarantaine** (une ressource `missing` 3 semaines de suite est proposée à la suppression
dans la PR) et un **changelog du catalogue** généré (`catalog/CHANGELOG.md`).

## Synthèse — les cinq choses à faire en premier

1. **A1 + A4** : faire du disque dupliqué et du « point Arche » la voie principale, pas une
   annexe ; deux disques par défaut dans le wizard.
2. **F3** : réduire la v0.1 à `core + health + ai`, vérifiés à 100 %, avec un test de
   téléchargement réel mensuel en CI.
3. **A2 + A3** : mirrorer les sources de Kiwix/libzim/Zimit et un lecteur autonome ; miroirs
   multiples dans le catalogue.
4. **B (santé)** : accouchement, psychologie, assainissement, vétérinaire — quatre ajouts au
   catalogue et deux fiches imprimables. C'est là que le projet sauve des vies, pas dans ROS.
5. **F1** : deux owners, miroir Codeberg (l'auto-merge des PR bénignes a été retiré, M2-3). Une après-midi de travail.
