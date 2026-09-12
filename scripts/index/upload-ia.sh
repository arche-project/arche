#!/usr/bin/env bash
# Envoie un shard d'index sur Internet Archive (client officiel `ia`) et note l'URL directe.
# Uploads an index shard to Internet Archive with the official `ia` client.
# Secrets : IA_ACCESS_KEY / IA_SECRET_KEY (https://archive.org/account/s3.php)
set -euo pipefail
BUILD_JSON="${1:?build.json}"; DIR="$(dirname "$BUILD_JSON")"
ITEM=$(node -p "require('./$BUILD_JSON').ia_item"); FILE=$(node -p "require('./$BUILD_JSON').file")
RES=$(node -p "require('./$BUILD_JSON').resource"); MODEL=$(node -p "require('./$BUILD_JSON').model")
command -v ia >/dev/null || pip install --quiet internetarchive
[ -n "${IA_ACCESS_KEY:-}" ] && mkdir -p ~/.config/internetarchive && printf "[s3]\naccess = %s\nsecret = %s\n" "$IA_ACCESS_KEY" "$IA_SECRET_KEY" > ~/.config/internetarchive/ia.ini
# Un item par ressource ; un nouveau build remplace le fichier (même nom) — l'ancien reste dans l'historique IA.
ia upload "$ITEM" "$DIR/$FILE" "$DIR/$FILE.sha256" --retries 10 \
  --metadata="mediatype:data" --metadata="collection:opensource" --metadata="title:Arche index shard — $RES ($MODEL)" \
  --metadata="licenseurl:https://spdx.org/licenses/MIT.html" \
  --metadata="subject:arche;rag;index;offline;$RES" \
  --metadata="description:Retrieval index shard (locators + int8 vectors, model $MODEL) built by the Arche project for the resource $RES. Contains no text: the text stays in the resource. Read with arche (https://github.com/arche-project/arche)."
echo "https://archive.org/download/$ITEM/$FILE" > "$DIR/ia-url.txt"
echo "uploaded: $(cat "$DIR/ia-url.txt")"
