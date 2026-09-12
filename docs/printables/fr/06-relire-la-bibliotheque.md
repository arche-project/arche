# 06 · Relancer la bibliothèque, relire ces fichiers

*À garder avec le disque. Pour quelqu'un qui n'a jamais vu Arche.*

## Ce qu'il y a sur ce disque
- `library/zim/` : des fichiers `.zim` = Wikipédia, guides de santé, réparation… Chaque `.zim` est un site web complet compressé.
- `library/models/` : les « cerveaux » de l'IA locale. `library/pdf/` : documents à imprimer. `library/git/` : code source de logiciels.
- `library/.arche/state.json` : la liste de tout, avec les dates. `arche/` : le programme qui gère tout ça. `README-USB.txt` : mode d'emploi court.

## Relancer avec le programme (n'importe quel ordinateur)
1. Brancher le disque. Ouvrir le dossier `arche/`.
2. Double-cliquer sur `arche` (`arche.exe` sous Windows). S'il n'y en a pas : installer **Node.js** (fichier d'installation dans `library/software/` si prévu), puis dans un terminal : `node dist/cli.js serve --library ../library --open`.
3. Le navigateur s'ouvre. Cliquer **Ouvrir la bibliothèque**.

## Si le programme ne marche plus : lire les `.zim` directement
- Installer **Kiwix** (dans `library/software/` : kiwix-desktop AppImage/exe/dmg, ou `kiwix-serve`). Sur téléphone Android/iPhone : l'application Kiwix.
- Ouvrir un fichier `.zim` avec Kiwix. C'est tout.
- En ligne de commande : `kiwix-serve --port 8080 library/zim/*.zim` puis ouvrir http://localhost:8080.

## Si plus rien ne lit le format ZIM (dans dix ans)
- Le format est **ouvert et documenté** : spécification dans `library/git/openzim-spec` ou sur wiki.openzim.org (Wikipédia « ZIM (file format) »).
- Le code source du lecteur est dans `library/git/libzim.git`, `kiwix-tools.git` : n'importe quel programmeur C++ peut le recompiler.
- En dernier recours, `zim-tools` (`zimdump`) transforme un `.zim` en dossier de pages HTML lisibles par n'importe quel navigateur.

## Pour l'IA
Installer **Ollama** (`library/software/`), pointer la variable `OLLAMA_MODELS` vers `library/models/ollama`, puis `ollama run qwen3:8b` (ou le modèle présent, voir `state.json`). Sans Ollama : `llama.cpp` + le fichier `.gguf` dans `library/models/`.

## Recopier ce disque pour quelqu'un
Copier simplement tout le disque (`library/` + `arche/`). Aucune installation. Le refaire tous les 2–3 ans sur un disque neuf : les disques oubliés dans un tiroir perdent leurs données.
