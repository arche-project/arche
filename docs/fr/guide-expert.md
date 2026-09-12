# Guide expert — tout scriptable, rien de caché

> English: [guide-expert.md](../en/guide-expert.md)

## Installation

```bash
git clone https://github.com/arche-project/arche && cd arche
npm ci && npm run build          # Node ≥ 22
node dist/cli.js --help
# ou, pendant le développement :
npm run dev -- plan --profile bunker
```

Exécutable autonome (aucun Node sur la machine cible) : `npm i -D esbuild postject && npm run package:sea`
→ `build/arche(.exe)`. Le workflow `release.yml` le fait pour Linux x64/arm64, macOS arm64, Windows x64.

## Le fichier `arche.yaml`

Copiez `config/arche.example.yaml`. Tout ce que le wizard demande y a un équivalent, plus :
`include`/`exclude` par id, `disk_budget_gb` explicite, `priorities` autorisées, `serve.bind`
(`0.0.0.0` pour servir tout le LAN depuis un Pi).

```bash
arche plan     --config arche.yaml            # aperçu ; --json pour l'exploiter
arche download --config arche.yaml -y         # non-interactif, reprise automatique, code retour ≠ 0 si échec
arche download --only wikipedia-fr-maxi,ollama-qwen3-8b   # ignore le plan
arche verify   --library /media/usb/arche --fix
arche serve    --config arche.yaml --bind 0.0.0.0
arche catalog  list --type zim --profile lowtech
arche catalog  show ifixit-fr
arche catalog  index > catalog.json           # index plat pour vos propres outils
```

Variables d'environnement : `ARCHE_HOME` (bibliothèque), `ARCHE_LANG` (`fr`/`en`),
`ARCHE_CATALOG_DIR` (catalogue alternatif, par ex. un fork), `ARCHE_KIWIX_OPDS` (miroir OPDS),
`GITHUB_TOKEN` (5 000 req/h au lieu de 60), `OLLAMA_MODELS`.

## Anatomie de la bibliothèque

```
library/
├── .arche/state.json     # ce qui est installé, version, sha256, dates — lisible, copiable
├── zim/                  # *.zim (servis par kiwix-serve)
├── models/ollama/        # OLLAMA_MODELS
├── git/                  # <id>.git (miroirs), <id>.wiki.git, <id>.bundle, <id>-releases/
├── software/             # binaires (kiwix-tools, gitea, satdump…)
├── toolchains/           # archives de caches (platformio, arduino15, wheels…)
├── pdf/  maps/  data/
```

## Machine déjà hors-ligne : le bundle USB

Sur une machine connectée : `arche download …` puis `arche export --to /media/usb`.
Sur la cible : `arche import --from /media/usb --library /srv/arche` (ou servir directement depuis la clé).
`export` copie aussi le dépôt Arche (sans `node_modules`) et l'exécutable s'il existe, plus un
`README-USB.txt`. Rien n'est archivé : ce sont des fichiers, donc `verify` et la reprise marchent.

## Recettes « manual » (toolchains)

Ces ressources n'ont pas d'archive unique à télécharger. Le wizard les signale `manual` et pointe
vers la documentation. Recettes recommandées (à exécuter sur une machine connectée, puis archiver
dans `library/toolchains/`) :

**PlatformIO** (ESP32 + AVR) :
```bash
pip install platformio
pio project init -d /tmp/pio-esp32 --board esp32dev && pio run -d /tmp/pio-esp32
pio project init -d /tmp/pio-uno --board uno && pio run -d /tmp/pio-uno
pio pkg install -g --platform espressif32 --platform atmelavr
tar czf library/toolchains/platformio.tgz -C ~ .platformio       # ~6 Go
```

**Arduino CLI** : `arduino-cli core install arduino:avr esp32:esp32` puis archiver `~/.arduino15`.

**ESP-IDF** : `git clone --recursive https://github.com/espressif/esp-idf && ./install.sh all` puis
archiver le dépôt **et** `~/.espressif`.

**Cache pip** (Aider, ESPHome, Open WebUI en mode Python) :
```bash
pip download aider-chat esphome open-webui -d library/toolchains/wheels \
    --platform manylinux2014_x86_64 --python-version 3.12 --only-binary=:all:
# sur la cible : pip install --no-index --find-links library/toolchains/wheels aider-chat
```

**Open WebUI en Docker** : `docker pull ghcr.io/open-webui/open-webui:main && docker save … | zstd > library/software/open-webui.tar.zst`,
puis `docker load` sur la cible.

**Miroir apt partiel** (Pi/Debian) : `apt-offline` ou `apt-mirror` sur les dépôts `main` de la
release cible, limité aux paquets listés dans `docs/fr/paquets-apt.txt` (à créer selon vos besoins :
`build-essential git python3-venv docker.io hostapd dnsmasq kiwix-tools`).

## Fabriquer ses propres ZIM (Zimit)

Plusieurs sources majeures n'ont pas de ZIM officiel (Low-tech Lab, Open Source Ecology, Farm Hack,
WikiHow). Avec Docker :

```bash
docker run -v $PWD/out:/output ghcr.io/openzim/zimit zimit \
  --url https://wiki.lowtechlab.org --name lowtechlab_fr --title "Low-tech Lab" \
  --description "Tutoriels low-tech" --lang fra --scopeType host --workers 4
```

Respectez les licences : un ZIM d'un site CC BY-NC-SA se fait **pour soi**, pas pour le publier
(voir [DECISIONS.md](DECISIONS.md)). Ajoutez-le ensuite au catalogue local via une entrée
`source.kind: manual` dans un fork, ou copiez simplement le `.zim` dans `library/zim/` :
`arche serve` sert tout ce qui s'y trouve.

## Servir tout le réseau local

Sur un Raspberry Pi 5 + SSD :

```bash
arche serve --bind 0.0.0.0 --port 80        # UI Arche
# kiwix-serve écoute sur kiwix_port (8080) ; Open WebUI sur 3000 ; Gitea sur 3001
```

Point d'accès Wi-Fi autonome (sans box) : `hostapd` + `dnsmasq`, SSID « arche », et une entrée DNS
`arche.local` → IP du Pi dans `dnsmasq`. Internet-in-a-Box fait tout ça clé en main si vous préférez
une image SD complète (ressource `internet-in-a-box`).

## Assistant de code local (alternative à Claude Code)

```bash
ollama pull qwen2.5-coder:7b            # ou 14b/32b selon RAM/GPU
pip install aider-chat                  # depuis le cache pip hors-ligne
cd mon-projet-esp32 && aider --model ollama_chat/qwen2.5-coder:7b
```

OpenCode (`opencode`) fait la même chose en binaire unique. Pour la doc hors-ligne, pointez l'agent
vers les ZIM DevDocs et StackExchange via `kiwix-serve` (URL locale) — voir
[assistant-ia.md](assistant-ia.md).

## Étendre le catalogue

Une entrée YAML par ressource, validée par `catalog/schema/resource.schema.json`.
`npm run catalog:validate` en local, Ajv en CI. Les scripts `scripts/catalog/check-*.ts` acceptent
`--dry-run` et écrivent leurs rapports dans `.catalog-reports/`. Pour tester l'updater sans toucher
au dépôt : `ARCHE_CATALOG_DIR=/tmp/cat npx tsx scripts/catalog/update-all.ts`.

## Ce qui n'est pas encore automatisé

- Lancement/arrêt d'Open WebUI et de Gitea depuis `arche serve` (aujourd'hui : manuel).
- Miroir apt et images Docker (recettes ci-dessus).
- Fichiers `.mwm` d'Organic Maps (URL CDN non stables) — voir DECISIONS.md.
