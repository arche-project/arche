# Expert guide — everything scriptable, nothing hidden

> Français : [guide-expert.md](../fr/guide-expert.md)

## Install

```bash
git clone https://github.com/arche-project/arche && cd arche
npm ci && npm run build          # Node ≥ 22
node dist/cli.js --help
npm run dev -- plan --profile bunker      # during development
```

Self-contained executable (no Node on the target): `npm i -D esbuild postject && npm run package:sea`
→ `build/arche(.exe)`. `release.yml` does it for Linux x64/arm64, macOS arm64, Windows x64.

## The `arche.yaml` file

Copy `config/arche.example.yaml`. Everything the wizard asks has an equivalent, plus
`include`/`exclude` by id, explicit `disk_budget_gb`, allowed `priorities`, `serve.bind`
(`0.0.0.0` to serve the whole LAN from a Pi).

```bash
arche plan     --config arche.yaml            # dry run; --json to consume it
arche download --config arche.yaml -y         # non-interactive, auto-resume, exit code ≠ 0 on failure
arche download --only wikipedia-fr-maxi,ollama-qwen3-8b   # bypass the plan
arche verify   --library /media/usb/arche --fix
arche serve    --config arche.yaml --bind 0.0.0.0
arche catalog  list --type zim --profile lowtech
arche catalog  show ifixit-fr
arche catalog  index > catalog.json           # flat index for your own tools
```

Environment: `ARCHE_HOME` (library), `ARCHE_LANG` (`fr`/`en`), `ARCHE_CATALOG_DIR` (alternate
catalog, e.g. a fork), `ARCHE_KIWIX_OPDS` (OPDS mirror), `GITHUB_TOKEN` (5,000 req/h instead of 60),
`OLLAMA_MODELS`.

## Library anatomy

```
library/
├── .arche/state.json     # installed items, version, sha256, dates — readable, copyable
├── zim/                  # *.zim (served by kiwix-serve)
├── models/ollama/        # OLLAMA_MODELS
├── git/                  # <id>.git (mirrors), <id>.wiki.git, <id>.bundle, <id>-releases/
├── software/  toolchains/  pdf/  maps/  data/
```

## Already-offline machine: the USB bundle

On a connected machine: `arche download …` then `arche export --to /media/usb`.
On the target: `arche import --from /media/usb --library /srv/arche` (or serve straight from the
drive). `export` also copies the Arche repo (without `node_modules`) and the executable if present,
plus a `README-USB.txt`. Nothing is archived: plain files, so `verify` and resume keep working.

## "manual" recipes (toolchains)

These resources have no single archive to download. The wizard flags them `manual` and points to
docs. Recommended recipes (run on a connected machine, then archive into `library/toolchains/`):

**PlatformIO** (ESP32 + AVR):
```bash
pip install platformio
pio project init -d /tmp/pio-esp32 --board esp32dev && pio run -d /tmp/pio-esp32
pio project init -d /tmp/pio-uno --board uno && pio run -d /tmp/pio-uno
pio pkg install -g --platform espressif32 --platform atmelavr
tar czf library/toolchains/platformio.tgz -C ~ .platformio       # ~6 GB
```

**Arduino CLI**: `arduino-cli core install arduino:avr esp32:esp32`, then archive `~/.arduino15`.

**ESP-IDF**: `git clone --recursive https://github.com/espressif/esp-idf && ./install.sh all`, then
archive the repo **and** `~/.espressif`.

**pip cache** (Aider, ESPHome, Open WebUI in Python mode):
```bash
pip download aider-chat esphome open-webui -d library/toolchains/wheels \
    --platform manylinux2014_x86_64 --python-version 3.12 --only-binary=:all:
# on the target: pip install --no-index --find-links library/toolchains/wheels aider-chat
```

**Open WebUI via Docker**: `docker pull ghcr.io/open-webui/open-webui:main && docker save … | zstd > library/software/open-webui.tar.zst`,
then `docker load` on the target.

**Partial apt mirror** (Pi/Debian): `apt-offline` or `apt-mirror` on the target release's `main`,
limited to a package list (`build-essential git python3-venv docker.io hostapd dnsmasq kiwix-tools`).

## Build your own ZIMs (Zimit)

Several major sources have no official ZIM (Low-tech Lab, Open Source Ecology, Farm Hack, WikiHow).
With Docker:

```bash
docker run -v $PWD/out:/output ghcr.io/openzim/zimit zimit \
  --url https://wiki.lowtechlab.org --name lowtechlab_fr --title "Low-tech Lab" \
  --description "Low-tech tutorials" --lang fra --scopeType host --workers 4
```

Respect licenses: a ZIM of a CC BY-NC-SA site is made **for yourself**, not for publishing (see
[DECISIONS.md](DECISIONS.md)). Then add it to a local catalog through a `source.kind: manual` entry
in a fork, or simply drop the `.zim` into `library/zim/`: `arche serve` serves whatever is there.

## Serve the whole LAN

On a Raspberry Pi 5 + SSD:

```bash
arche serve --bind 0.0.0.0 --port 80        # Arche UI
# kiwix-serve listens on kiwix_port (8080); Open WebUI on 3000; Gitea on 3001
```

Standalone Wi-Fi access point (no router): `hostapd` + `dnsmasq`, SSID "arche", and a DNS entry
`arche.local` → the Pi's IP in `dnsmasq`. Internet-in-a-Box does all of that turn-key if you prefer
a full SD image (resource `internet-in-a-box`).

## Local coding assistant (Claude Code alternative)

```bash
ollama pull qwen2.5-coder:7b            # or 14b/32b depending on RAM/GPU
pip install aider-chat                  # from the offline pip cache
cd my-esp32-project && aider --model ollama_chat/qwen2.5-coder:7b
```

OpenCode (`opencode`) does the same as a single binary. For offline docs, point the agent at the
DevDocs and StackExchange ZIMs through `kiwix-serve` (local URL) — see [ai-assistant.md](ai-assistant.md).

## Extending the catalog

One YAML entry per resource, validated by `catalog/schema/resource.schema.json`.
`npm run catalog:validate` locally, Ajv in CI. The `scripts/catalog/check-*.ts` scripts accept
`--dry-run` and write reports to `.catalog-reports/`. To test the updater without touching the repo:
`ARCHE_CATALOG_DIR=/tmp/cat npx tsx scripts/catalog/update-all.ts`.

## Not yet automated

- Starting/stopping Open WebUI and Gitea from `arche serve` (manual today).
- apt mirror and Docker images (recipes above).
- Organic Maps `.mwm` files (unstable CDN URLs) — see DECISIONS.md.
