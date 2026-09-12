# Systèmes d'exploitation : un usage, une distribution

> La bibliothèque vit sur un disque ; la machine qui le lit peut mourir. Sans système à
> réinstaller, tout le reste est inaccessible. Ce document dit lesquels on garde, pourquoi si peu,
> et ce qu'on refuse. English: [OPERATING-SYSTEMS.md](../en/OPERATING-SYSTEMS.md)

## La règle qui décide de tout

**Une distribution sans son dépôt de paquets est une impasse.** L'ISO installe une base — un noyau,
un bureau, un terminal. Tout ce qu'on voudra ensuite, Docker pour Gitea, `hostapd` pour le Wi-Fi,
KiCad, FreeCAD, `ros-jazzy-desktop`, vient du dépôt. Hors ligne, sans miroir, on a un ordinateur
qui démarre et qui ne sert à rien. Chaque entrée du catalogue nomme donc son dépôt dans
`depends_on`, ou explique pourquoi elle n'en a pas besoin (SystemRescue : tout est dans l'ISO,
c'est le but).

La conséquence est contre-intuitive : **moins de distributions, pas plus.** Chacune coûte une ISO
de 2 à 6 Go, un miroir de 15 à 80 Go, un vérificateur de version, et quelqu'un qui sait
l'administrer quand ça casse. On choisit par usage, jamais par goût.

## Ce qu'on garde, et pour quoi

| Usage | Distribution | Dépôt | Pourquoi celle-là |
|---|---|---|---|
| **le nœud Arche**, un serveur, un vieux PC de récupération | **Debian stable** (DVD-1) | `apt-mirror-debian` | vit cinq ans, change le moins possible, amd64 et arm64, et l'image DVD-1 installe un bureau complet **sans réseau** — la netinst, non |
| **le Raspberry Pi** | **Raspberry Pi OS Lite** | Debian + `archive.raspberrypi.com` | c'est Debian avec le noyau Pi ; sans bureau parce que c'est un nœud, pas un poste |
| **la robotique ROS 2** | **Ubuntu LTS** | `ros2-apt-mirror` + miroir Ubuntu | uniquement parce que les paquets binaires ROS 2 n'existent que pour Ubuntu LTS ; sans ROS, Debian suffit |
| **réparer, récupérer, cloner** | **SystemRescue** | aucun (live) | démarre sur n'importe quel PC depuis une clé, sans rien installer ; on s'en sert *avant* toute réinstallation |
| **routeurs, points d'accès, mesh** | **OpenWrt** | son propre dépôt de la version stable | c'est lui qui fait le Wi-Fi du nœud, le réseau du hameau, le pont entre deux bâtiments |
| **une clé pour toutes les ISO** | **Ventoy** | — | on installe Ventoy une fois, puis on *copie* les ISO dessus comme des fichiers ; un menu au démarrage |
| **l'école primaire, en français** | PrimTux | Debian | un ordinateur d'enfant qui marche sans réseau ni réglage ; répond au trou « école à la maison organisée » |

Trois sont `essential` dans le profil novice : Debian, SystemRescue, Ventoy. Ensemble, ils tiennent
sur une clé de 32 Go et forment **l'objet physique** que le débutant doit avoir, étiqueté, dans la
boîte de la bibliothèque : « si l'ordinateur ne démarre plus, brancher ceci ».

## Ce qu'on refuse, et pourquoi

**Arch et ses dérivés** : rolling release — il n'existe pas de « version stable » à suivre, et un
miroir figé d'Arch vieillit mal. **Fedora** : treize mois de vie ; le temps de constituer un miroir,
il est presque périmé. **NixOS** : la reproductibilité est exactement ce qu'on voudrait, mais un
cache Nix hors-ligne est un projet en soi, et personne ne le maintiendra ici. **Tails, Qubes** :
excellents, autre sujet — la confidentialité n'est pas l'autonomie. **DragonOS et les distributions
radio** : ce sont des Debian avec des paquets préinstallés ; `apt-mirror-debian` + SatDump font la
même chose sans doubler le miroir. **Windows** : impossible à redistribuer, et un système qu'on ne
peut pas réinstaller depuis le disque n'a pas sa place dans une bibliothèque d'autonomie.

## Comment on suit les versions

Une distribution est l'endroit où « dernière version » et « dernière version stable » divergent
le plus. Chaque entrée a donc son vérificateur, tous branchés sur la source qu'utilise le projet
lui-même :

| Système | Tracker | Ce qu'il lit |
|---|---|---|
| Debian | `debian` | le fichier `Release` de `stable` : version et nom de code |
| Ubuntu | `ubuntu-lts` | `meta-release-lts`, le fichier qu'Ubuntu consulte pour proposer une mise à niveau — dernière LTS **supportée** |
| Raspberry Pi OS | `raspios` | la liste de Raspberry Pi Imager : URL, date, **sha256** identiques à ceux de l'outil officiel |
| OpenWrt | `github-tag` | les tags Git, filtrés par la politique « stable » — les `rc` sont ignorées |
| Ventoy | `github-release` | `/releases/latest` |
| SystemRescue, PrimTux | `http-head` | présence de la page de téléchargement ; la version reste à relever à la main |

Le tracker `github-tag` est nouveau et générique : beaucoup de projets taguent sans créer de
« release » GitHub, et `/releases/latest` répond alors 404 — ce qui, avant, marquait la ressource
comme disparue.

## Ce qui reste à faire

Le miroir apt Ubuntu (≈ 60 Go, `main` + `universe`, amd64 et arm64) n'a pas d'entrée propre : il
est décrit dans la note d'`ubuntu-lts` et mérite une recette comme `apt-mirror-debian`. Les
versions de SystemRescue et PrimTux se relèvent à la main tant qu'ils n'exposent pas de flux
lisible. Et la fiche imprimable « si l'ordinateur ne démarre plus » — brancher la clé, choisir
SystemRescue, où sont les fichiers — n'existe pas encore ; c'est la fiche 06 qu'il faut étendre.
