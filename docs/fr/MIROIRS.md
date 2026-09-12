# Miroirs de paquets : le mécanisme plutôt que la liste

> « Certains auront besoin d'Alpine, d'autres d'une autre distribution. Je sais qu'on ne peut pas
> mettre tous les paquets du monde dans un dépôt. » Exact — et c'est précisément pour ça qu'Arche ne
> livre pas une liste de distributions, mais un **mécanisme** pour en ajouter une en trente lignes.
> English: [MIRRORS.md](../en/MIRRORS.md)

## Ce qu'on ne peut pas faire, et ce qu'on peut

Un miroir complet de Debian fait 400 Go par architecture ; Ubuntu, davantage ; et il y a des
dizaines de distributions. Copier tout est impossible, et copier « les paquets importants » à la
main donne un miroir qui ne s'installe pas — parce que `hostapd` a besoin de `libssl3t64`, qui a
besoin de `libc6`, qui a besoin de `libgcc-s1`, et qu'on en a oublié un.

Ce qu'on peut faire, c'est **calculer** cette chaîne. À partir d'une liste courte de paquets racine,
lire l'index du dépôt et en déduire exactement les paquets nécessaires pour que `apt install` ou
`apk add` réussissent sans réseau — et pas un de plus. C'est la fermeture de dépendances, et c'est
`src/core/mirror/packages.ts` : une fonction pure, testée sur de vrais formats, qui comprend les
alternatives (`lsb-base | sysvinit-utils`), les paquets virtuels (`Provides:`), les `so:` et `cmd:`
d'Alpine, les Recommends optionnels de Debian, et qui **dit** ce qu'elle n'a pas trouvé plutôt que
de le taire.

## Une recette, trente lignes

```yaml
id: alpine-stable
resource: alpine-standard          # la ressource du catalogue que ce miroir alimente
type: apk                          # apt | apk
base_url: https://dl-cdn.alpinelinux.org/alpine
suite: latest-stable
components: [main, community]
architectures: [x86_64, aarch64]
packages: [alpine-base, linux-lts, openssh, hostapd, dnsmasq, git, python3, nodejs, build-base]
```

`arche mirror plan catalog/mirrors/alpine.yaml --arch aarch64` lit l'index, calcule la fermeture et
répond : combien de paquets, quelle taille, et ce qui manque. `--urls fichier.txt` écrit la liste de
téléchargement, que `wget -i` ou `arche download` consomment. Si la fermeture fait le double de
l'estimation de la recette, la commande le signale : une racine tire trop — un méta-paquet, ou les
Recommends.

Quatre recettes de référence sont livrées : **Debian stable** (le socle, ~6 Go pour un nœud + un
atelier + un bureau léger), **Ubuntu LTS** et **ROS 2** (qui vont ensemble : les dépendances
système de ROS se résolvent dans le miroir Ubuntu), et **Alpine** — la distribution la plus facile
à mettre en miroir de toutes : dépôt plat, index de quelques Mo, pas de Recommends donc fermeture
exacte.

## Ajouter la vôtre

Un fichier dans `catalog/mirrors/`, une ressource dans `catalog/resources/operating-systems.yaml`
qui le référence, et c'est tout : la validation vérifie que la ressource existe, le tracker de
fraîcheur suit la version de la distribution, et `arche mirror plan` fait le reste. Les types `apt`
et `apk` couvrent Debian, Ubuntu, Raspberry Pi OS, Mint, Alpine, postmarketOS et leurs dérivés ;
`pacman` (Arch), `dnf` (Fedora) et `opkg` (OpenWrt) sont des analyseurs à écrire sur le même modèle
— une centaine de lignes chacun, testées sur un extrait d'index.

La règle reste celle de [SYSTEMES.md](SYSTEMES.md) : **une ISO sans son dépôt est une impasse**, et
chaque distribution coûte un miroir, un tracker et quelqu'un qui sait l'administrer. Le mécanisme ne
supprime pas ce coût ; il le rend payable par la personne qui en a besoin, au lieu de le faire porter
à tout le monde.

## Et la « VM stable » ?

Vous avez raison qu'il faut un environnement stable sous Arche. Deux façons d'y arriver, et ce
n'est pas tranché :

**Le socle Debian + le superviseur** (ADR 0008) : Arche tourne sur ce que la machine a, en binaires
natifs, et Debian stable est ce qui change le moins. C'est la voie actuelle.

**Une image de machine virtuelle** construite en CI — Debian + Arche + les services préinstallés,
livrée en qcow2/OVA/raw — pour celui qui a un hôte quelconque (Windows, macOS, un NAS) et veut un
environnement identique à celui de tout le monde. C'est reproductible, c'est testable, et ça
contredit un peu l'esprit « sans démon » : un hyperviseur est plus lourd que Docker. Je le note
comme décision à arbitrer (D18 dans [DECISIONS.md](DECISIONS.md)) plutôt que de le construire
maintenant. Mon avis : utile pour le profil *bunker* qui a une machine puissante, pas pour le nœud
Raspberry Pi, et jamais comme voie recommandée pour le néophyte.
