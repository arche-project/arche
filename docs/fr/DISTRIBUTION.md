# Distribution décentralisée : comment Arche survit à la disparition de ses serveurs

> English: [DISTRIBUTION.md](../en/DISTRIBUTION.md) · Décision : [ADR 0006](../adr/0006-distribution-torrent-first.md)

## Ce qu'on veut vraiment

Trois propriétés, dans cet ordre :

1. **Résilience** — si Internet Archive, GitHub ou download.kiwix.org disparaissent, la
   bibliothèque reste téléchargeable depuis les gens qui l'ont.
2. **Vérifiabilité** — un fichier reçu d'un inconnu est prouvé identique à l'original (le
   catalogue porte le sha256 de chaque fichier, et le catalogue lui-même est signé).
3. **Passage à l'échelle sans facture** — 10 000 personnes qui téléchargent 500 Go ne doivent pas
   coûter 5 Po de bande passante à un seul serveur.

Ces trois propriétés existent depuis vingt ans sous le nom de **BitTorrent**. Elles ne demandent ni
blockchain, ni jeton, ni compte. C'est le choix d'Arche.

## Sur le « web3 » et l'idée d'échapper aux régulations

Deux remarques franches, parce que tu m'as demandé d'être critique.

D'abord, techniquement : une blockchain sert à se mettre d'accord sur *l'ordre* d'événements entre
parties qui ne se font pas confiance (qui possède quoi, qui a payé). Distribuer des fichiers n'a
pas ce problème : on veut *le même* fichier partout, et un hash suffit à le prouver. Les projets
« web3 de stockage » (Filecoin, Arweave, Storj) finissent tous par utiliser du contenu adressé par
hash + un réseau pair-à-pair — c'est-à-dire ce que BitTorrent et IPFS font déjà — et ajoutent une
couche de paiement en jetons dont Arche n'a pas besoin, qui exige une connexion au réseau de la
blockchain (précisément ce qu'on n'a pas en coupure), et qui fait dépendre la survie des données du
cours d'un actif spéculatif. Pour un kit de survie, c'est une dépendance de plus, pas de moins.

Ensuite, sur l'objectif : « échapper à toute régulation » n'est pas un but que ce projet peut
poursuivre, et je te conseille de ne pas l'écrire. Ce que le catalogue distribue est **légal par
construction** (licences libres, accords écrits) et n'a rien à cacher ; un réseau qui se présente
comme incensurable attire exactement les contenus qu'on ne veut pas y voir et fait fuir les
partenaires qui comptent (bibliothèques, écoles, collectivités, Kiwix, Internet Archive, la
Wikimedia Foundation). La bonne formulation est **« résistant à la censure et aux pannes »** —
qu'un fichier libre reste disponible même si un hébergeur tombe ou retire, pour n'importe quelle
raison. C'est exactement ce que BitTorrent donne, et c'est défendable devant n'importe qui.

Il y a un cas légitime d'usage hors-réseau des idées « web3 » : la **signature** du catalogue
(clé publique, pas blockchain) et, plus tard, l'échange de mises à jour entre deux machines qui ne
se sont jamais vues, via **sneakernet** ou un réseau maillé. Aucune des deux ne demande de jeton.

## L'architecture retenue

### Niveau 0 — aujourd'hui, sans code supplémentaire

- Internet Archive génère un `.torrent` pour chaque item hébergé par Arche. Le catalogue le porte
  dans `source.torrent`. N'importe quel client BitTorrent (qBittorrent, Transmission) peut
  télécharger et **partager** la bibliothèque.
- Les ZIM Kiwix ont eux aussi un `.torrent` officiel (`<url>.torrent`) et un `.magnet`.
- `arche export` + copie disque-à-disque = le sneakernet. C'est la distribution la plus résiliente
  qui existe : un disque dans un sac.

### Niveau 1 — à implémenter dans `arche download` (prochaine étape)

Transport torrent intégré, en Node (bibliothèque **webtorrent** ou wrapper autour de `aria2c`, qui
gère HTTP + BitTorrent + reprise + vérification et existe sur les trois OS). Règles :

- si `source.torrent` existe et que le fichier fait > 1 Go → torrent d'abord, HTTP (IA) en
  **webseed** de secours : l'utilisateur a toujours au moins la vitesse du serveur, souvent plus.
- après téléchargement, **partager par défaut** pendant que `arche serve` tourne, avec un plafond
  de débit montant configurable (`serve.seed_upload_kbps`) et un bouton « ne pas partager » visible
  dans l'UI. Un « point Arche » (Pi allumé en permanence) devient naturellement un seed.
- sur Raspberry Pi, `aria2c` est dans apt et pèse 3 Mo ; on le référence comme ressource `software`.

### Niveau 2 — catalogue signé et miroirs de catalogue

Le catalogue est la seule chose qu'il faut obtenir « de confiance » ; tout le reste est vérifié par
hash. Donc :

- `catalog/index.json` généré à chaque release, **signé avec minisign** (clé publique dans le README
  et gravée dans le binaire). `arche` refuse un catalogue dont la signature ne correspond pas.
- Le catalogue signé est publié en 4 endroits indépendants : GitHub, Internet Archive, Codeberg, et
  un CID **IPFS** (un hash de contenu, gratuit via un service de pinning ou via IA lui-même qui
  expose ses items en IPFS). Le binaire embarque le dernier catalogue connu : une machine hors-ligne
  a toujours un catalogue.
- N'importe qui peut héberger un miroir complet (`arche mirror --to /srv/www`) : c'est un dossier
  statique + le catalogue signé. Le catalogue accepte une liste `mirrors` que l'utilisateur ou une
  communauté locale complète (`~/.config/arche/mirrors.yaml`).

### Niveau 3 — hors-réseau entre voisins

Deux machines Arche sur le même réseau local (Wi-Fi d'un immeuble, Meshtastic n'a pas le débit) se
découvrent par **mDNS** (`_arche._tcp.local`) et proposent : « Marie a Wikipédia FR 2026-08, vous
avez 2026-05, mettre à jour depuis Marie ? ». C'est du HTTP local + hash, rien de plus. Ça rend le
« point Arche » contagieux : un disque à jour dans un quartier met tout le quartier à jour.

## Ce que ça ne résout pas

- Un fichier qu'aucun pair n'a plus est perdu : la redondance vient des gens et des institutions
  (bibliothèques, fablabs) qui gardent des disques allumés, pas d'un protocole. D'où COMMUNAUTE.md.
- Le trafic BitTorrent est bridé ou bloqué chez certains FAI et dans beaucoup d'entreprises ; le
  webseed HTTP reste le filet.
- IPFS est lent et gourmand sur un Pi ; on l'utilise pour **adresser** (CID du catalogue), pas
  comme transport principal.

## Décision

Torrent d'abord (IA fournit les torrents gratuitement), HTTP en webseed, catalogue signé minisign
publié en plusieurs endroits avec un CID IPFS, découverte locale mDNS. Pas de blockchain, pas de
jeton. Formulation publique : *résistant aux pannes et à la censure*, jamais *hors de toute règle*.
