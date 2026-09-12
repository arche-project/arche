#!/usr/bin/env bash
# Envoie un ZIM sur Internet Archive avec le client officiel `ia`, puis récupère l'URL directe et le .torrent.
# Uploads a ZIM to Internet Archive with the official `ia` client.
# Secrets : IA_ACCESS_KEY / IA_SECRET_KEY (compte archive.org → https://archive.org/account/s3.php)
set -euo pipefail
BUILD_JSON="${1:?build.json}"; DIR="$(dirname "$BUILD_JSON")"
ITEM=$(node -p "require('./$BUILD_JSON').ia_item"); FILE=$(node -p "require('./$BUILD_JSON').file")
LICENSE=$(node -p "require('./$BUILD_JSON').license"); SRC=$(node -p "require('./$BUILD_JSON').url")
command -v ia >/dev/null || pip install --quiet internetarchive
ia configure --username "${IA_USERNAME:-}" --password "${IA_PASSWORD:-}" 2>/dev/null || true
[ -n "${IA_ACCESS_KEY:-}" ] && printf "[s3]\naccess = %s\nsecret = %s\n" "$IA_ACCESS_KEY" "$IA_SECRET_KEY" > ~/.config/internetarchive/ia.ini 2>/dev/null || true
# --retries pour les gros fichiers ; les métadonnées rendent l'item trouvable et citent la source et la licence
ia upload "$ITEM" "$DIR/$FILE" "$DIR/$FILE.sha256" --retries 10 \
  --metadata="mediatype:data" --metadata="collection:opensource" --metadata="title:$FILE" \
  --metadata="licenseurl:https://spdx.org/licenses/$LICENSE.html" --metadata="source:$SRC" \
  --metadata="subject:zim;kiwix;offline;arche" --metadata="description:ZIM built by the Arche project from $SRC. Read with Kiwix."
echo "https://archive.org/download/$ITEM/$FILE" > "$DIR/ia-url.txt"
echo "https://archive.org/download/$ITEM/${ITEM}_archive.torrent" > "$DIR/ia-torrent.txt"
echo "uploaded: $(cat "$DIR/ia-url.txt")"
