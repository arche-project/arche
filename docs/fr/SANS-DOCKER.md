# Sans Docker : pas de démon entre l'utilisateur et l'outil

> « Imagine un monde sans Docker. » On conçoit Arche pour des gens qui vivent hors réseau, sur une
> machine qu'ils devront réparer eux-mêmes. Ce document dit ce que ça impose, ce qu'on a changé,
> et ce que Docker reste en droit de faire. English: [NO-DOCKER.md](../en/NO-DOCKER.md) ·
> Décision : [ADR 0008](../adr/0008-no-daemon.md)

## Pourquoi c'est un problème d'architecture, pas de goût

Docker est un **démon** : un service qui doit tourner pour que les autres tournent, un noyau aux
capacités précises — et sur macOS ou Windows, une machine virtuelle entière —, un registre implicite
derrière chaque image, et une couche d'abstraction qu'un néophyte ne peut pas ouvrir. Quand
kiwix-serve s'arrête à deux heures du matin chez quelqu'un qui n'a personne à appeler,
« regarde `docker logs` » n'est pas une réponse. « Le binaire est dans `software/`, le journal est
dans `.arche/logs/arche.log` » en est une.

Le point qui tranche : **presque tout ce dont Arche a besoin existe en binaire natif.** kiwix-serve,
Ollama, Gitea, llama.cpp, arduino-cli, SatDump, Node, Python autonome — des exécutables qu'on copie
et qu'on lance. Docker n'ajoutait pas une capacité ; il ajoutait une dépendance.

L'audit du catalogue est rassurant sur l'état et inquiétant sur la tendance : cinq entrées sur 267
exigeaient Docker, une seule en `recommended` (Open WebUI) — mais rien n'empêchait la sixième, ni
la vingtième. Le problème n'était pas le catalogue, c'était l'absence de règle.

## La règle, vérifiée par le code

Chaque logiciel du catalogue déclare désormais son **`runtime`** : `static-binary`, `node`,
`python`, `jvm`, `container`, `source`, `firmware` ou `none`. Tout ce qui n'est pas un binaire
statique doit pouvoir être satisfait **par le catalogue lui-même** — Node LTS, Python autonome —
sinon la dépendance est une promesse en l'air.

Et un `runtime: container` **ne peut être ni `essential` ni `recommended`, ni visible du profil
novice**. Ce n'est pas une phrase dans un document : `arche catalog validate` refuse le catalogue si
la règle est violée, et la CI refuse la PR. Quarante entrées ont été annotées à la main ; trois ont
changé de statut en conséquence.

| Entrée | Avant | Après | Pourquoi |
|---|---|---|---|
| **Open WebUI** | `recommended`, exige Docker | `optional`, installé par **pip** depuis le wheelhouse | c'était la seule pièce dont le chemin « normal » passait par Docker ; l'interface principale est celle d'Arche |
| **Zimit** | `recommended`, exige Docker | `optional`, hors profil novice | n'existe qu'en conteneur ; c'est l'outil de **notre** chaîne de construction en CI, pas un outil du quotidien hors-ligne |
| **farmOS** | `optional`, exige Docker | `optional`, hors profil novice | Drupal + base de données : pas de chemin natif raisonnable |

Les images Docker restent au catalogue (`docker-kiwix-serve`, `docker-gitea`) pour ceux qui ont
déjà Docker et préfèrent ce format — c'est exactement le rôle que vous lui laissez : télécharger nos
conteneurs, à la limite. `skopeo`, qui est un binaire statique, suffit à les récupérer en archive
sans démon.

## Ce qui remplace `docker compose` : `arche serve`

Ce que Docker apportait vraiment, ce n'était pas l'isolation — c'était **le lancement, la relance et
le journal** de plusieurs services d'un coup. C'est maintenant le travail du superviseur d'Arche.

`arche serve` découvre les binaires installés dans la bibliothèque et lance **kiwix-serve**,
**Ollama** (avec ses modèles dans la bibliothèque, pas dans `~/.ollama`) et **Gitea** comme des
processus enfants ordinaires. Si l'un tombe, il est relancé après un délai qui double à chaque fois
— une seconde, deux, quatre — plafonné à une minute ; un service qui a tenu plus d'une minute
retrouve un compteur neuf, parce qu'on ne punit pas un plantage isolé après trois jours de service.
Après dix chutes consécutives, le superviseur cesse d'insister et l'écrit : un service qui tombe dix
fois a besoin d'un humain, pas d'une onzième tentative.

Tout va dans **un seul journal**, `.arche/logs/arche.log`, chaque ligne datée et préfixée du nom du
service. L'interface web l'expose sur `/api/services` — ce que `docker ps` montrait, sans démon.
`Ctrl-C` arrête tout proprement : SIGTERM, cinq secondes, puis SIGKILL pour ce qui n'a pas compris.

```
$ arche serve
  service kiwix : démarré (port 8080)
  service ollama : démarré (port 11434)
  service absent : gitea — installez la ressource correspondante (kiwix-tools, ollama, gitea)
Journal des services : /srv/library/.arche/logs/arche.log
```

Le tout est testé sur un vrai processus qui meurt : le test lance un script qui sort en erreur,
vérifie qu'il est relancé avec le bon délai, que sa sortie est dans le journal, et que l'arrêt est
propre.

## Démarrer au boot : ce que la machine a déjà

`arche service install` écrit l'unité **systemd** (Linux, session utilisateur :
`~/.config/systemd/user/arche.service`) ou l'agent **launchd** (macOS :
`~/Library/LaunchAgents/org.arche.serve.plist`) qui lance `arche serve --quiet` au démarrage et le
relance s'il s'arrête. Ce sont les mécanismes que le système a déjà ; on n'en invente pas un.
`--print` montre le fichier sans l'écrire, `--enable` l'active tout de suite, `uninstall` et
`status` font ce qu'ils disent. Sous Windows, la commande dit honnêtement qu'elle ne génère rien et
renvoie au Planificateur de tâches.

## Ce qu'on ne prétend pas

Un conteneur isole ; le superviseur n'isole rien. Ollama et Gitea tournent avec les droits de
l'utilisateur, sur ses ports, dans sa bibliothèque — c'est voulu, c'est lisible, et c'est ce que
quelqu'un peut réparer. Si un jour une pièce du catalogue exige vraiment l'isolation, elle restera
`optional`, et ce sera un signal envoyé à ses auteurs autant qu'à nos utilisateurs.

La chaîne de construction en CI, elle, continue d'utiliser des conteneurs : Zimit et mwoffliner
tournent sur GitHub Actions. C'est notre atelier, pas la machine de l'utilisateur, et la règle ne
s'y applique pas.
