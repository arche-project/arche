# Analyse concurrentielle — ce qui existe, ce qu'Arche a de plus ou de moins, ce qu'on ajoute

> Écrit le 12 septembre 2026 à partir des sources publiques listées à la fin. Les chiffres sont
> ceux affichés ce jour-là ; les étoiles et les prix bougent. À lire avec [MVP.md](MVP.md) (ce
> qu'est le produit) et [AUDIT-ARCHITECTURE.md](AUDIT-ARCHITECTURE.md) (ce qui cloche aujourd'hui).
> Traduit de [docs/en/COMPETITION.md](../en/COMPETITION.md) (source, D22).

## Le paysage en un paragraphe

Tout ce qui ressemble à Arche tient en trois familles. Les **boîtiers de lecture** posent une
bibliothèque Kiwix sur une machine avec son propre Wi-Fi : Kiwix Hotspot, Internet-in-a-Box,
RACHEL, et leurs descendants commerciaux ou clones PrepperDisk et PrepperPi. Les **serveurs
tout-en-un avec IA** ajoutent un modèle local à côté de la bibliothèque : Project NOMAD — 36 400
étoiles en six mois, la référence du moment —, son emballage commercial Personal Codex, et des
montages personnels comme civilization_node. Les **index pré-calculés** publient un index de
recherche de Wikipédia prêt à interroger : txtai-wikipedia de NeuML, les dumps d'embeddings
Cohere et Upstash, wikilite (un SQLite par langue avec FTS5 et vecteurs, un point MCP, 12
étoiles), plus une poignée de petits serveurs MCP au-dessus de fichiers ZIM (openzim-mcp,
kiwix-wiki-mcp-server). Personne n'occupe la place qu'Arche vise : **des centaines de corpus
au-delà de Wikipédia, en shards indépendants du modèle, servis par MCP à un petit modèle hors
ligne, avec provenance, à côté des outils, miroirs, modèles et méthodes qu'il faut pour faire —
pas seulement lire.**

## Côte à côte

| | Kiwix / Hotspot | Internet-in-a-Box | RACHEL | PrepperDisk | PrepperPi | Project NOMAD | Personal Codex | civilization_node | txtai-wikipedia | wikilite | **Arche (cible)** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Quoi | format ZIM + lecteurs + boîtier Pi 5 | pile Ansible, ~40 apps, Pi/x86 | serveur Wi-Fi d'une ONG, OER curatées | boîtier Pi, 200–360 $ | clone libre de PrepperDisk | serveur Docker + Command Center | NOMAD préinstallé, 499–2 899 $ | Open WebUI + Kiwix + Ollama | index Faiss+SQLite des intros de Wikipédia EN | SQLite FTS5 + ANN par langue | catalogue + shards + MCP |
| Licence | GPLv3, association (Lausanne, 2007) | GPL-2.0, bénévoles | mixte ; contentshell CC BY-SA-**NC** | couche propriétaire sur IIAB/Kiwix | MIT-0 | Apache-2.0 | Apache-2.0 (NOMAD) | MIT | données CC-BY-SA | données GFDL | code MIT, licences héritées |
| Échelle | 10 M+ utilisateurs, 100+ langues | 2 000 ★, dizaines de pays | 40+ pays, 500 k apprenants (2015) | ~5 000 unités | 2 ★, v1.0 avr. 2026 | 36,4 k ★ / 3,6 k forks, release mensuelle | revend NOMAD | 8 ★ | 6,5 M lignes, 9 Go | 551 Go de bases sur HF | 0 utilisateur |
| Modèle de contenu | l'utilisateur choisit ses ZIM ; miroirs ; torrents | choix Kiwix/OER2Go/Kolibri/OSM | modules ZIP curatés, origine unique | livre des ZIM + exclusivités sous licence | télécharge, ne livre jamais ; bundles YAML | télécharge depuis Kiwix ; cartes PMTiles ; packs de créateurs | préchargé | wget sur download.kiwix.org | un index, rafraîchi deux fois par an | bases préconstruites | **télécharge la dernière stable chez l'éditeur ; n'héberge que ce qui n'existe pas ailleurs (shards, ZIM)** |
| Couche IA | rien d'officiel | rien | « RACHEL AI », recherche sémantique fermée | chatbot non documenté / retiré | rien (idée) | Ollama + Qdrant, RAG maison | idem | Ollama + outil Xapian Kiwix | au choix du consommateur | embeddings Qwen3 intégrés | **aucune — Arche est un serveur ; le client est le vôtre** |
| RAG sur la bibliothèque | — | — | recherche seule | ? | — | **pas par défaut** (5–10× le disque, « des heures à des jours par Go » sur CPU) | sur documents déposés | 1 article, 6 premiers ko | vecteurs sur les intros seulement | FTS5 + ANN | FTS5 + vecteurs int8 par corpus, hybride, routé |
| Index indépendant du modèle | — | — | — | — | — | Qdrant, modèle non documenté | — | — | **non** (e5-base figé) | **non** (Qwen3 figé) | **oui** — une table de vecteurs par modèle, texte ré-embarquable |
| MCP / API pour d'autres clients | OPDS, /search, /raw | — | — | — | JSON admin, sans auth | API de gestion ; **pas de MCP** | — | — | Python seulement | **MCP `/mcp`** | **MCP stdio + HTTP, 21 outils** |
| Intégrité | hachages torrent, UUID | héritée | aucune | — | **images signées GPG**, SHA-256 des fichiers statiques | aucune (`curl \| sudo bash`, `:latest`) | — | aucune | — | — | prévu : catalogue signé, sha256 obligatoire (M2) |
| Au-delà de la lecture | non | **Gitea, Jupyter, Node-RED/MQTT, cartes 3D, PBX** | LMS | Morse, phrasier, RepeaterBook | AP, cartes | Supply Depot (9 apps), Meshtastic Web, référence FDA | idem | non | non | non | **miroirs git, toolchains, modèles, données terrain, bundles training et automation ; calculateurs ; portes humaines** |
| Monde physique / entraînement | — | MQTT | — | — | — | — | — | — | — | — | **inventaire, jeux de données (orthomosaïque, LiDAR, capteurs), méthodes d'entraînement, estimation d'énergie** |
| Langues | 100+ | toutes | éditions EN/ES/FR | EN + téléchargement | UI EN | **UI EN seulement** | EN | EN | EN (+ SV) | EN, DE, ES, IT, ZH, AR… | source EN, FR généré (D22) |

## Ce qu'Arche a de plus

**Un serveur, pas une boîte.** Chaque concurrent est une destination : on va sur sa page web.
Arche est un serveur MCP que n'importe quel client hors ligne — Jan, Open WebUI, OpenCode, un
agent — branche. NOMAD, le leader, n'a pas de MCP ; seuls wikilite et trois serveurs ZIM
minuscules en ont. C'est la différence entre « un endroit où lire » et « une base sur laquelle
un modèle travaille ».

**Des centaines de corpus, pas un.** Tous les index pré-calculés sont Wikipédia. Personne ne
publie de shards prêts pour WikiMed, Hesperian, iFixit, Appropedia, Low-tech Lab, Open Source
Ecology, la FAO, Sphere, les centres antipoison, PhET, Stack Exchange — les corpus dont un
autonomiste a réellement besoin. `catalog/index-plan.yaml` en liste 120. Cet espace est vide.

**Des shards indépendants du modèle.** txtai fige e5-base, wikilite Qwen3, Cohere son propre
modèle, tylercosgrove Qwen3-4B à 2 560 dimensions (104 Go). Si votre portable ne fait pas
tourner cet encodeur, l'index ne sert à rien. Le format d'Arche (ADR 0014, ticket M1-1) garde
le texte des chunks et ajoute une table de vecteurs par modèle : on télécharge celle qu'on peut
faire tourner, ou on la calcule soi-même (`arche index embed`, M1-4). Personne n'offre « les
mêmes chunks, plusieurs modèles ».

**L'hybride dans un seul fichier, avec provenance.** txtai n'a pas d'index lexical ; les dumps
Cohere et Upstash n'ont pas d'index texte ; les serveurs ZIM n'ont pas de vecteurs. Un SQLite
avec FTS5 et vecteurs int8 donne BM25 + dense + RRF sans aucun service, et une table `meta` qui
dit la date du dump, la licence, le découpage, le modèle, les dimensions — exactement le trou de
documentation qu'on voit chez burgerbee (pas de description du contenu), wikilite (ni dims ni
date) et Cohere (pas de champ licence).

**Au-delà de la lecture — le terrain que personne n'occupe.** Seul IIAB héberge de
l'infrastructure (Gitea, Jupyter, Node-RED/MQTT) ; NOMAD a un Supply Depot de neuf apps.
Personne ne couvre les miroirs git des outils qu'il faut pour reconstruire, les caches pip/npm/apt
hors ligne, les toolchains CAO et EDA, les modèles locaux par palier de RAM, les jeux de données
drone/LiDAR/satellite, les journaux de capteurs, les méthodes d'entraînement sans NVIDIA, ni
l'énergie par calcul. Le catalogue d'Arche a déjà 317 ressources et 24 bundles là-dessus, et
l'`inventaire` (ADR 0010) est la seule entrée « avec ce que j'ai » du secteur.

**Le temps et l'énergie, adaptés à la machine.** Aucun concurrent n'estime combien de temps
prend un workflow ni combien de watt-heures il coûte sur *votre* matériel ; la réponse de NOMAD,
c'est une grille de paliers (150 $ → 1 000 $+) et un score de benchmark. `estimate_pipeline`
d'Arche répond « 1 h 27 et 65 Wh sur ce portable 8 Go » — ce dont quelqu'un hors réseau a besoin
pour décider.

**Pas de redistribution, la dernière stable chez l'éditeur, signé.** NOMAD et PrepperPi
partagent le principe « télécharger, jamais livrer » ; PrepperDisk livre des ZIM et des
exclusivités sous licence sur une carte SD verrouillée par activation. Personne ne signe un
catalogue ; seul PrepperPi signe ses images. Le plan d'Arche (M2 : catalogue minisign, sha256
obligatoire, aucun automerge d'URL) est en avance sur le papier — et seulement sur le papier
tant que M2 n'est pas fait.

**Les portes humaines comme données.** Les trois sujets sensibles, la poutre porteuse, le moteur
sur le volant : personne d'autre n'encode ce que le modèle ne doit pas décider. civilization_node
livre un modèle non censuré avec un prompt ; la doc de NOMAD dit que l'IA « peut produire des
réponses fausses ou trompeuses ». La ressource `rules` et `detectRedFlags` sont un vrai
différenciateur sur les questions médicales et de sécurité — à condition que M4-1 rende les
fichiers de connaissance sourcés.

## Ce qu'Arche a de moins

**Des utilisateurs.** Zéro, contre 36 400 étoiles pour NOMAD, 10 M+ pour Kiwix, 5 000 unités
pour PrepperDisk. NOMAD a pris 10 000 étoiles en une semaine en mars 2026 : la demande existe,
le public est là, et il parle anglais.

**Une expérience de boîtier.** Brancher, rejoindre le Wi-Fi, naviguer — Kiwix Hotspot,
PrepperDisk, PrepperPi (portail captif), NOMAD (installation en une ligne, détection GPU,
Command Center) l'ont tous. Arche est un CLI et un wizard, par choix (ADR 0008, pas de démon) ;
c'est quand même moins.

**Les cartes.** NOMAD sert des PMTiles régionaux avec MapLibre et `pmtiles extract` ; PrepperPi
extrait un pays de la planète quotidienne par requêtes HTTP partielles ; IIAB a OSM avec relief
3D et tuiles satellite. Arche catalogue des logiciels et des jeux de données cartographiques mais
n'a aucune chaîne cartographique à lui.

**Un index vectoriel rapide à l'échelle.** txtai utilise Faiss IVF + SQ8 et répond en
millisecondes sur 6,5 M de vecteurs. Un balayage brutal de blobs int8 dans SQLite ne tiendra pas
au-delà d'un ou deux millions de chunks : Wikipédia FR (4,5 M) demande un index ANN à côté
(sqlite-vec, ou un fichier IVF près de la base). M1-9 doit le dire.

**Des chiffres de qualité publiés.** NeuML publie un tableau NDCG@10 qui justifie son choix de
modèle (e5-base 0,70 contre bge-base 0,63) ; Cohere publie la perte des paliers int8 et binaire
(« 99,7–100 % de la qualité, 4× / 32× plus petit »). Arche n'a pas encore d'`arche eval` (M1-7) ;
d'ici là, « ça marche » est une opinion — l'audit l'a dit.

**Des paliers et des packs qu'on comprend.** Kiwix Hotspot vend des bundles « Preppers Premium /
Medical / Computer Science » ; PrepperPi a Starter ~5 Go / Medical ~1 Go / Education ~16 Go /
Complete ~130 Go ; NOMAD a Essential / Standard / Comprehensive ; txtai livre un palier « slim »
de 238 Mo avec un graphe sémantique. Arche a des bundles et des profils, mais pas d'échelle
nommée et dimensionnée qu'un nouveau venu choisit en dix secondes.

**Un score de benchmark.** Le chiffre unique de NOMAD avec classement public, et Personal Codex
qui « benchmarke chaque unité avant expédition », sont simples et efficaces. `arche compute
bench` est un point ouvert depuis des semaines.

**Un mode simple pour les petits modèles.** openzim-mcp expose un seul outil `zim_query` parce
que « les modèles ≤ 13B tirent profit du mode simple ». Arche expose 21 outils ; un modèle 4B va
s'y perdre.

**La langue.** Tout le secteur est anglais d'abord. Arche était français d'abord ; D22 fixe la
langue source, M3-5 fait suivre le reste.

## Le risque à surveiller

NOMAD a une RFC ouverte (#883) pour ingérer les ZIM dans son RAG. Le jour où il livre par défaut
« discutez avec votre Wikipédia », cette fonction cesse d'être un différenciateur pour qui que ce
soit. La douve d'Arche n'est pas « discuter avec Wikipédia » ; c'est l'étendue des corpus, les
shards indépendants du modèle, la provenance, et tout ce qui est au-delà de la lecture. C'est là
qu'il faut construire.

## Ce qu'on ajoute — des propositions, chacune en ticket

1. **Distribuer à travers eux, pas contre eux.** Empaqueter `arche mcp` + les shards comme une
   app du Supply Depot de NOMAD (image Docker, puisque c'est leur format — pas notre chemin
   recommandé, mais leur porte) et comme un rôle IIAB. Les 36 k utilisateurs de NOMAD sont le
   public ; les ZIM de Kiwix sont le substrat ; Arche ajoute la couche qu'aucun n'a. Ticket
   **M4-12**.
2. **Des packs nommés et dimensionnés.** « Premiers secours terrain — 1,2 Go », « Cultiver —
   4 Go », « Construire — 9 Go », « Reconstruire la pile — 60 Go », chacun un profil + un
   manifeste avec un plancher d'énergie et de RAM annoncé. L'Édition Autonomiste (D20) devient un
   barreau de cette échelle. À fondre dans **M4-8**.
3. **Cartes hors ligne.** Un bundle `maps` et une recette d'extraction régionale PMTiles (planète
   quotidienne Protomaps, `pmtiles extract` par requêtes partielles, visionneuse MapLibre),
   cataloguée comme le reste, avec les kinds de données terrain déjà dans l'inventaire. Ticket
   **M4-11**.
4. **Index ANN à côté au-delà d'~1 M de chunks.** sqlite-vec ou un fichier IVF près du SQLite,
   choisi par `arche eval`, transparent pour le format. À ajouter à **M1-9**.
5. **Mode simple.** Un seul outil MCP, `arche_ask`, qui route, cherche et renvoie un court
   contexte cité — pour les modèles ≤ 13 B ; les 21 outils restent pour les agents. Ticket
   **M1-11**.
6. **Score de benchmark.** `arche compute bench` : un chiffre, un tableau public dans la doc, et
   l'estimateur calibré dessus. Ticket **M4-13**.
7. **Des colonnes de métadonnées qui aident les petits modèles.** Percentile de pages vues et
   étiquettes de domaine sur les shards Wikipédia (l'astuce de NeuML), recherche en deux temps
   intro → article complet (l'astuce d'OfflineWikipediaTextApi). À ajouter à **M1-1** et
   **M1-3**.
8. **Les torrents comme miroir.** Internet Archive génère un torrent pour chaque item ; Kiwix
   recommande les torrents pour l'intégrité. Candidat pour **D23**, sans coût.
9. **Parler à Kiwix/openZIM.** Ils n'ont ni index vectoriel ni position officielle sur l'IA ; un
   convertisseur ZIM → SQLite (notre `extract.ts`) et des shards lexicaux publiés sont une
   contribution qu'ils pourraient référencer. Pas un ticket — un message à envoyer quand M4-3
   aura vingt shards à montrer.

## Sources

Project NOMAD : [dépôt](https://github.com/Crosstalk-Solutions/project-nomad), [FAQ](https://raw.githubusercontent.com/Crosstalk-Solutions/project-nomad/main/FAQ.md), [releases](https://github.com/Crosstalk-Solutions/project-nomad/releases), [RFC #883](https://github.com/Crosstalk-Solutions/project-nomad/issues/883), [site](https://www.projectnomad.us/), [présentation](https://andrew.ooo/posts/project-nomad-offline-survival-computer/), [Cybernews](https://cybernews.com/security/apocalypse-ready-knowledge-server-project-nomad/).
Personal Codex : [site](https://personal-codex.com/), [alternatives à NOMAD](https://personal-codex.com/project-nomad-alternatives/), [alternative à PrepperDisk](https://personal-codex.com/prepper-disk-alternative/).
PrepperDisk : [site](https://www.prepperdisk.com/), [tableau comparatif](https://www.prepperdisk.com/pages/comparison-chart), [FAQ](https://www.prepperdisk.com/pages/faq), [LowEndBox](https://lowendbox.com/blog/do-you-need-prepperdisk-the-off-the-grid-raspberry-pi-powered-reference-library/), [GearJunkie](https://gearjunkie.com/news/prepper-disk-brings-online-knowledge-off-grid), [Hacker News](https://news.ycombinator.com/item?id=43790409).
PrepperPi : [dépôt](https://github.com/jmarler/prepperpi), [release engineering](https://raw.githubusercontent.com/jmarler/prepperpi/main/docs/release-engineering.md), [bundles](https://github.com/jmarler/prepperpi-bundles).
civilization_node : [dépôt](https://github.com/emincb/civilization_node), [kiwix_tool.py](https://raw.githubusercontent.com/emincb/civilization_node/main/kiwix_tool.py).
Internet-in-a-Box : [site](https://internet-in-a-box.org), [dépôt](https://github.com/iiab/iiab), [notes 8.3](https://github.com/iiab/iiab/wiki/IIAB-8.3-Release-Notes), [Wikipédia](https://en.wikipedia.org/wiki/Internet-in-a-Box).
RACHEL : [World Possible](https://worldpossible.org/rachel), [RACHEL 5](https://worldpossible.org/products/rachel-5-500), [contenu](https://rachel.worldpossible.org/content), [GitHub](https://github.com/worldpossible).
Kiwix : [Hotspot](https://get.kiwix.org/en/solutions/hotspots/kiwix-hotspot/), [site](https://kiwix.org/en/), [kiwix-serve](https://kiwix-tools.readthedocs.io/en/latest/kiwix-serve.html), [miroirs](https://mirrors.dotsrc.org/kiwix/), [llm-tools-kiwix](https://github.com/mozanunal/llm-tools-kiwix), [zim-llm](https://github.com/rouralberto/zim-llm).
Index pré-calculés : [NeuML/txtai-wikipedia](https://huggingface.co/NeuML/txtai-wikipedia), [txtai-wikipedia-slim](https://huggingface.co/NeuML/txtai-wikipedia-slim), [burgerbee/txtai-en-wikipedia](https://huggingface.co/burgerbee/txtai-en-wikipedia), [OfflineWikipediaTextApi](https://github.com/SomeOddCodeGuy/OfflineWikipediaTextApi), [tylercosgrove/wikipedia-embeddings](https://huggingface.co/datasets/tylercosgrove/wikipedia-embeddings), [Cohere multilingual v3](https://huggingface.co/datasets/Cohere/wikipedia-2023-11-embed-multilingual-v3), [Upstash bge-m3](https://huggingface.co/datasets/Upstash/wikipedia-2024-06-bge-m3), [EmergentMethods](https://huggingface.co/datasets/EmergentMethods/en_qdrant_wikipedia), [wikimedia/structured-wikipedia](https://huggingface.co/datasets/wikimedia/structured-wikipedia), [wikilite](https://github.com/eja/wikilite), [bases wikilite](https://huggingface.co/datasets/eja/wikilite).
MCP sur ZIM : [openzim-mcp](https://github.com/cameronrye/openzim-mcp), [kiwix-wiki-mcp-server](https://github.com/jeffreyrampineda/kiwix-wiki-mcp-server), [zim-mcp-server](https://github.com/zicojiao/zim-mcp-server), [wiki-local-mcp](https://github.com/robtacconelli/wiki-local-mcp).
