# ADR 0008 — Pas de démon entre l'utilisateur et l'outil : binaire natif d'abord, conteneur jamais requis

**Statut** : accepté (décision de Florian, 2026-09-11). Complète l'ADR 0002 (dépendances minimales).

**Contexte.** Arche est pensé pour des gens qui vivent hors réseau, sur une machine qu'ils devront
réparer eux-mêmes. Docker — et tout moteur de conteneurs — est un **démon** entre l'utilisateur et
l'outil : un service à installer et à maintenir, un noyau à capacités précises (sur macOS et Windows,
une machine virtuelle entière), un registre implicite derrière chaque image, et une couche
d'abstraction qu'un néophyte ne peut pas ouvrir quand ça casse à deux heures du matin.
« `docker logs` » n'est pas une réponse pour quelqu'un qui n'a personne à appeler.

Or presque tout ce dont Arche a besoin existe en **binaire natif** : kiwix-serve, Ollama, Gitea,
llama.cpp, arduino-cli, SatDump, Node, Python autonome. L'audit du catalogue au 11 septembre 2026
montre que seules cinq entrées sur 267 exigent Docker, dont une seule marquée `recommended`
(Open WebUI). Le problème n'est pas l'état du catalogue ; c'est l'absence de règle qui l'empêcherait
de dériver.

**Décision.**

1. **Chaque logiciel du catalogue déclare son `runtime`** : `static-binary`, `node`, `python`,
   `jvm`, `container`, `source`, `firmware` ou `none`. Un `runtime` autre que `static-binary` ou
   `none` doit pouvoir être satisfait **par le catalogue lui-même** (Node LTS, Python autonome, JDK)
   — sinon la dépendance est une promesse en l'air.

2. **Un conteneur est un format de distribution, jamais une exigence.** Une ressource `runtime:
   container` ne peut être ni `essential` ni `recommended`, et ne peut pas figurer dans le profil
   `novice`. **La règle est vérifiée par `arche catalog validate`**, pas seulement écrite ici.
   Les images Docker restent au catalogue pour ceux qui ont déjà Docker et préfèrent ce format ;
   `skopeo`, binaire statique, suffit à les télécharger en archive sans démon.

3. **Ce qui remplace `docker compose`, c'est `arche serve`.** Le superviseur d'Arche lance les
   services de la bibliothèque — kiwix-serve, Ollama, Gitea — comme des **processus enfants**
   ordinaires, à partir des binaires installés dans la bibliothèque, les relance en cas de plantage
   avec un délai croissant, écrit un journal unique et lisible dans `.arche/logs/`, et les arrête
   proprement. `arche service install` produit l'unité systemd (Linux) ou le plist launchd (macOS)
   qui démarre `arche serve` au boot — les mécanismes que la machine a déjà, pas un de plus.

4. **Open WebUI cesse d'être la voie recommandée.** C'était la seule pièce dont l'installation
   « normale » passait par Docker. Elle reste au catalogue en `optional`, installable par pip depuis
   le wheelhouse ; l'interface principale est celle d'Arche (`arche serve`, qui n'a besoin que de Node) ; pour
   converser, Arche sert sa base par MCP au client de l'utilisateur — Open WebUI en est un (ADR 0011).

5. **La chaîne de construction en CI est exemptée.** Zimit et mwoffliner tournent dans des
   conteneurs sur GitHub Actions ; c'est notre atelier, pas la machine de l'utilisateur. Un
   `git-zimit` porte donc `runtime: container` et reste `optional` — on garde le code source pour
   qui voudra reconstruire, sans prétendre que c'est un outil du quotidien.

**Alternatives écartées.** Podman sans démon (mieux que Docker, mais toujours un moteur de
conteneurs, des images et un registre à comprendre). Nix (reproductibilité idéale, mais un cache
hors-ligne est un projet en soi — même conclusion que pour les distributions). Un seul gros binaire
« tout-en-un » (impossible : Ollama et kiwix-serve sont des projets tiers qu'on ne va pas recompiler).

**Conséquences.** Chaque logiciel ajouté au catalogue doit répondre à la question « ça tourne avec
quoi ? » avant d'entrer. Le superviseur devient une pièce critique d'Arche, à tester comme telle.
Les projets qui n'existent **qu'en** conteneur restent hors du chemin recommandé, quelle que soit
leur qualité — et c'est un signal qu'on envoie à leurs auteurs. Enfin, la règle vaut pour Arche
lui-même : l'exécutable Node SEA (ADR 0001) est la seule chose à double-cliquer, et il ne demande
rien d'autre.

---

**Status**: accepted. **Decision**: native binaries first; every software entry declares a
`runtime`, and a `container` runtime can be neither essential nor recommended nor in the novice
profile — enforced by `arche catalog validate`. `arche serve` is the supervisor that replaces
`docker compose`: child processes from the library's own binaries, restart with backoff, one log,
clean shutdown; `arche service install` emits the systemd unit or launchd plist. Open WebUI drops
to optional (pip); Arche's own UI is the primary interface. CI-side container tooling (Zimit,
mwoffliner) is exempt: it is our workshop, not the user's machine.
