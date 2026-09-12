# Décisions à arbitrer

> Ce que je n'ai **pas** tranché seul. Chaque point a une recommandation, mais c'est toi qui décides.
> English: [DECISIONS.md](../en/DECISIONS.md)

## D1 — WikiHow a disparu de Kiwix

Au 2026-09-11, aucun ZIM WikiHow (FR ou EN) n'est listé sur download.kiwix.org. La ressource est en
`status: missing` dans le catalogue. Options : (a) la retirer ; (b) documenter la fabrication d'un ZIM
personnel avec Zimit (licence CC BY-NC-SA : chacun le fait pour soi, pas de redistribution) ;
(c) contacter Kiwix pour savoir si c'est temporaire.
**Reco : (b) + (c).** Le contenu est unique pour un néophyte.

## D2 — Sources FR majeures sans ZIM : Low-tech Lab, Open Source Ecology, Farm Hack

Le contenu francophone le plus pertinent pour ce projet (Low-tech Lab) n'existe pas en ZIM. Options :
(a) recette Zimit pour chacun (chacun fabrique le sien — long, fragile) ; (b) demander aux projets
un ZIM officiel ou l'autorisation d'en publier un sur leur nom ; (c) publier un ZIM « communautaire
Arche » (redistribution → sortie du principe « orchestrateur pur », et licence NC à respecter).
**Reco : (b) d'abord, (a) en attendant.** (c) demande une décision de principe sur l'hébergement.

## D3 — Le projet héberge-t-il quelque chose un jour ?

Aujourd'hui zéro. Mais un `catalog.json` publié sur GitHub Pages (déjà prévu dans le workflow), un
index d'embeddings pré-calculé pour le RAG, ou des ZIM communautaires (D2) sont des hébergements.
Trancher une règle : « Arche héberge uniquement ce qu'il produit lui-même à partir de sources
libres (index, catalogues), jamais du contenu tiers ».

## D4 — Hesperian, IFRC : URL des PDF FR non confirmées

Les PDF de *Là où il n'y a pas de docteur* sont servis derrière un formulaire ; le guide IFRC 2020
n'a pas d'URL FR stable trouvée. Les entrées sont `source.kind: manual`. Il faut confirmer les URL
à la main (ou écrire à Hesperian) avant que ce soient de vraies ressources téléchargeables.

## D5 — Cartes : Organic Maps vs OsmAnd

Organic Maps est le plus simple pour un néophyte, mais ses `.mwm` par région se téléchargent depuis
l'app via CDN sans URL stable. OsmAnd a des `.obf` téléchargeables directement. Pour le profil
bunker, le `.pbf` Geofabrik + un serveur de tuiles local (tileserver-gl / Protomaps `.pmtiles`) est
la voie robuste. **Reco : Protomaps `.pmtiles` France** (un seul fichier, servi statiquement) — à
ajouter au catalogue une fois l'URL stable identifiée.

## D6 — Nom du dépôt et URL — **tranché : `github.com/arche-project/arche`**

Florian a laissé le choix (12 septembre 2026 ; « ApocaGit » écarté par lui-même). Le nom du projet reste **Arche** — il se lit tel quel en anglais, et l'organisation `arche` sur GitHub est occupée par un compte inactif. Le dépôt vit dans une **organisation dédiée**, `arche-project` (libre à cette date, comme `arche-offline`, `getarche`, `arche-base`), plutôt que sur le compte personnel : c'est ce qui permet d'ajouter des mainteneurs sans déménager, et c'est la convention du secteur (Project NOMAD, openZIM). Toutes les références du dépôt pointent désormais vers `arche-project/arche` ; la procédure de publication est dans [PUBLICATION.md](PUBLICATION.md) (ticket M0-1).

## D7 — Cible Node : 22 minimum ?

`fs.statfs`, `readline/promises`, `fetch`, SEA : tout exige Node ≥ 20, et 22 est LTS jusqu'en
2027. Raspberry Pi OS Bookworm livre Node 18 → il faut installer depuis NodeSource ou livrer
l'exécutable SEA. **Reco : ≥ 22, et l'exécutable SEA comme voie néophyte.**

## D8 — Périmètre de la v0.1

Ce qui est codé et testé : catalogue, validation, plan, wizard CLI, UI web, téléchargement HTTP avec
reprise et checksums, Kiwix OPDS, GitHub releases, `ollama pull`, miroirs Git, verify, export/import,
updater + workflows. Ce qui est **conçu mais pas codé** : ~~`arche assist` (RAG)~~ (abandonné, ADR 0011 : serveur MCP à la place, codé), lancement d'Open
WebUI/Gitea depuis `serve`, recettes toolchains automatisées, mises à jour incrémentales de la
bibliothèque (« Vérifier les mises à jour » dans l'UI). Valider cet ordre : je propose RAG d'abord
(c'est ce qui rend le projet unique), toolchains ensuite.

## D9 — Financement et gouvernance

MIT + don. Choisir la plateforme (GitHub Sponsors, Liberapay, Ko-fi) et décider dès le départ si le
projet vise une association (loi 1901) pour pouvoir recevoir des subventions (fondations libres,
collectivités) — ça conditionne D3 et le bus factor.

## D10 — Le mot « survie »

Le positionnement (« guerre civile », « bunker ») attire un public et en repousse un autre
(écoles, bibliothèques, collectivités, ONG — qui sont précisément ceux qui déploieraient RACHEL/IIAB).
Le nom « Arche » est neutre ; le README actuel dit « coupure prolongée, zone blanche, ne plus
dépendre du réseau ». Décider du ton : je recommande de garder les cas d'usage extrêmes dans la doc
mais pas dans la première phrase.

## D11 — Internet Archive : compte et clés (à faire devant ton PC)

Créer un compte sur archive.org, récupérer les clés S3 sur https://archive.org/account/s3.php, les mettre en secrets GitHub `IA_ACCESS_KEY` / `IA_SECRET_KEY`. Puis lancer `zim-build.yml` à la main avec la recette `arche-docs-mul` (nos propres docs, licence libre : aucun risque) pour valider toute la chaîne avant de toucher aux sources tierces.

## D12 — Autorisations à demander en premier

Par ordre d'impact : Low-tech Lab (`lowtechlab-fr`, CC BY-NC-SA), InMoov (CC BY-NC), e-NABLE (mixte), Farm Hack (licence absente). Le mail type est dans HEBERGEMENT.md. Open Source Ecology et RepRap peuvent être construits sans demander (CC BY-SA / GFDL) — je propose de commencer par eux.

## D13 — Curateurs

Le modèle COMMUNAUTE.md suppose 5 à 15 curateurs par domaine. Qui, concrètement, pour la santé (le domaine où la règle des deux relecteurs est obligatoire) ? Sans au moins une personne du soin, je recommande de ne pas accepter de nouvelle ressource `medical` au-delà des sources de référence déjà listées.

## D14 — Seed par défaut

DISTRIBUTION.md propose que `arche serve` partage les torrents par défaut (plafonné). C'est le bon choix pour la résilience, mais certains utilisateurs (connexion limitée, FAI hostile) le vivront mal. Alternative : opt-in avec une case cochée par défaut dans le wizard, expliquée en une phrase. À trancher.

## D15 — Sauvegarde d'urgence (à faire cette semaine)

L'Atelier Paysan (en liquidation) et Practical Plants (site abandonné) peuvent disparaître. Le plan est dans [SAUVEGARDE-URGENTE.md](SAUVEGARDE-URGENTE.md) : lancer le workflow `rescue` dès que le dépôt est sur GitHub, demander la sauvegarde à la Wayback Machine et à Archive Team, envoyer le mail d'autorisation (prêt dans `docs/permissions/atelierpaysan-fr.md`). Ton arbitrage : acceptes-tu une copie privée sur un disque externe à toi en plus de l'artefact CI ? Je le recommande (deux copies).

## D16 — Hesperian : demander l'accord pour le HealthWiki francophone

Les éditions FR (sages-femmes, santé des femmes, dentaire) n'existent **qu'en HTML**, pas en PDF : un francophone hors-ligne n'y a aujourd'hui aucun accès. La licence Hesperian autorise la copie non commerciale mais exige un **accord écrit pour tout format numérique**. Le mail est prêt dans `docs/permissions/hesperian-fr.md`, avec une option qui a de bonnes chances de passer : leur remettre le ZIM pour qu'**ils** le publient sous leur nom (via Kiwix). À envoyer en même temps que L'Atelier Paysan.

## D17 — Ce qui est redistribuable tout de suite en médecine d'appoint

Deux sources seulement : **MCPC de l'OMS** (urgences obstétricales, CC BY-NC-SA 3.0 IGO, existe en français) et **Where There Is No Psychiatrist** (CC BY-NC-ND 4.0, verbatim). Les recettes sont écrites, `permission: license` : elles peuvent partir au premier run de `zim-build`. Tout le reste (Hesperian, MSF, Global Health Media, Merck, Oxfam) est en téléchargement personnel seulement — c'est documenté dans chaque fiche.

## D18 — Une image de machine virtuelle « Arche prête à l'emploi » ?

Tu as raison qu'il faut un environnement stable sous Arche. La voie actuelle est **Debian stable + le superviseur natif** (ADR 0008). L'alternative est une **image VM** construite en CI (Debian + Arche + services préinstallés, qcow2/OVA/raw) pour qui a un hôte quelconque et veut le même environnement que tout le monde. Reproductible et testable, mais un hyperviseur est plus lourd que Docker, ce qui contredit l'esprit « sans démon ». Mon avis : utile pour le profil *bunker* sur une machine puissante, inutile sur le Pi, jamais la voie recommandée pour le néophyte. **À trancher** : on la construit (une cible de plus dans `release.yml`, ~40 lignes avec `virt-builder` ou `mkosi`) ou on la laisse à la communauté. Voir [MIROIRS.md](MIROIRS.md).

## D19 — Le format des fiches de design de référence (`knowledge/designs/`)

L'ADR 0010 impose qu'un projet physique dérive un design existant (OpenWeedLocator, AgOpenGPS, FarmBot) et que la nomenclature passe par `bom_substitute`, qui croise la fiche de référence avec l'inventaire. La fiche n'existe pas encore : une nomenclature YAML par design, avec pour chaque ligne ses équivalents acceptés et *ce qui change* quand on les prend (tension, courant, brochage, vitesse). **À trancher** : écrire le format en abstrait, ou — mon avis — le figer avec la première fiche (OWL, trou G8 du MVP) et laisser AgOpenGPS et FarmBot le suivre. Voir [MVP.md](MVP.md).

## D20 — Le profil `autonomiste`, enfin défini

Demandé depuis le début, jamais défini. Le MVP le définit ainsi : **novice + le corpus des cinq recettes de projet** (potager, robot désherbeur, maison bioclimatique, tracteur, exploitation automatisée), soit ~111 ressources et ~96 Go avec la cinquième recette « exploitation automatisée » (~85 sans Debian DVD-1 ni Frigate/Meshroom), palier IA *medium* dès 16 Go de RAM, cible physique un SSD de 128 Go. **À valider** : ce périmètre, et le retrait de Debian DVD-1 vers la clé Ventoy séparée. Voir [MVP.md](MVP.md).

## D21 — Une machine GPU pour indexer les gros corpus

`index-build.yml` embarque sur CPU dans GitHub Actions : ~30 chunks/s, 6 h par job — assez pour 120 corpus de moins de 2 Go, pas pour Wikipédia FR (13 Go, ~4,5 millions de chunks, ~40 h CPU). Trois voies : un runner auto-hébergé avec carte graphique chez quelqu'un de confiance (une RTX 4090 fait Wikipédia FR en ~2 h), une location ponctuelle, ou attendre — Wikipédia reste cherchable par Xapian seul, ce qui marche déjà. **À trancher** quand M1 aura prouvé la chaîne sur les petits corpus. Voir [MVP.md](MVP.md).

## D22 — Une seule langue source pour la documentation — **tranché : l'anglais**

L'audit (erreur 11) constatait que tout était traduit à la main deux fois, et dérivait. Florian a tranché le 12 septembre 2026 : le dépôt est mondial, **l'anglais est la langue source**. `docs/en/`, `README.md` et `locales/en` sont ce qu'on édite ; `docs/fr/` (et les autres langues) sont *générés* par un script, portent un en-tête « traduit de docs/en/… — ne pas éditer » et une empreinte du source, et la CI refuse une traduction éditée à la main. Le ticket M3-5 met cela en place. Jusqu'à ce qu'il soit fait, les deux arbres restent édités en parallèle, l'anglais faisant foi en cas d'écart. Voir [ORCHESTRATION.md](ORCHESTRATION.md).

## D23 — Deuxième et troisième hébergeurs des shards

L'audit (erreur 8) : un seul hébergeur (Internet Archive) pour ce qu'Arche fabrique. Candidats : GitHub Releases (≤ 2 Go par fichier), Zenodo (DOI, 50 Go par dépôt), Hugging Face datasets, un miroir IPFS. Il en faut deux en plus d'IA, avec des licences compatibles et un champ `index.mirrors[]` dans le catalogue (ticket M2-6). **À trancher.** Voir [ORCHESTRATION.md](ORCHESTRATION.md).

## D24 — Le rôle d'Arche : un agrégateur, plus un RAG — **tranché**

Après l'analyse concurrentielle ([CONCURRENCE.md](CONCURRENCE.md)), Florian a tranché le 12 septembre 2026 : Arche assume d'être **un agrégateur** (le catalogue sait où tout est et va chercher la dernière stable chez l'éditeur, n'héberge rien qui existe ailleurs) **plus un RAG** (les index de corpus, fabriqués en CI, publiés sur Internet Archive, servis par MCP — le seul artefact qu'Arche produit). Pas de boîtier, pas de client, pas de moteur de cartes, pas de dépôt de contenu, pas de gestionnaire de paquets de plus : quand un manque relève de ces catégories, on catalogue ce qui le fait et on se distribue à travers lui (M4-12). Écrit dans l'[ADR 0015](../adr/0015-agregateur-et-rag.md).
