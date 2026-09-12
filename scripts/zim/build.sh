#!/usr/bin/env bash
# Construit UN ZIM à partir d'une recette de catalog/zim-recipes.yaml, dans Docker. Aucun contenu ne passe par la machine
# de Florian : ce script tourne dans GitHub Actions (ou sur n'importe quelle machine jetable).
# Builds ONE ZIM from a recipe in catalog/zim-recipes.yaml, inside Docker. Runs in GitHub Actions.
#
# Usage : scripts/zim/build.sh <recipe-id> [out-dir]
# Sortie : <out-dir>/<name>_<YYYY-MM>.zim + .sha256 + build.json (métadonnées pour update-catalog.ts)
set -euo pipefail
RECIPE_ID="${1:?recipe id}"; OUT="${2:-build/zim}"; mkdir -p "$OUT"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Lecture de la recette (via node + yaml, déjà dans les dépendances)
read_recipe() { node -e "
const {parse}=require('yaml');const fs=require('fs');
const r=parse(fs.readFileSync('$ROOT/catalog/zim-recipes.yaml','utf8')).find(x=>x.id==='$RECIPE_ID');
if(!r){console.error('unknown recipe $RECIPE_ID');process.exit(2)}
console.log(JSON.stringify(r))"; }
R="$(read_recipe)"
j() { echo "$R" | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));const v=r['$1'];console.log(Array.isArray(v)?v.join(' '):(v??''))"; }

PERM="$(j permission)"; TOOL="$(j tool)"; NAME="$(j name)"; URL="$(j url)"; LANG_="$(j lang)"; TITLE="$(j title)"; DESC="$(j description)"; LICENSE="$(j license)"
STAMP="$(date -u +%Y-%m)"
case "$PERM" in
  license|written) ;;
  *) echo "REFUSED: recipe $RECIPE_ID has permission=$PERM (need license|written). See docs/fr/HEBERGEMENT.md"; exit 3 ;;
esac
echo "== build $RECIPE_ID ($TOOL) from $URL → $OUT"

case "$TOOL" in
  mwoffliner)
    # ghcr.io/openzim/mwoffliner : scraper officiel de Kiwix pour MediaWiki
    docker run --rm -v "$PWD/$OUT:/output" ghcr.io/openzim/mwoffliner:latest \
      mwoffliner --mwUrl="$URL" --adminEmail="arche-bot@example.org" --outputDirectory=/output \
      --customZimTitle="$TITLE" --customZimDescription="$DESC" --customZimFavicon="" \
      $(j mwoffliner_args) || { echo "mwoffliner failed"; exit 1; }
    ;;
  zimit)
    docker run --rm -v "$PWD/$OUT:/output" ghcr.io/openzim/zimit:latest zimit \
      --url "$URL" --name "$NAME" --title "$TITLE" --description "$DESC" --lang "$LANG_" --zim-lang "$LANG_" \
      --output /output $(j zimit_args) || { echo "zimit failed"; exit 1; }
    ;;
  zimwriterfs)
    SRC="$ROOT/$(j source_dir)"; TMP="$(mktemp -d)"
    # Markdown → HTML minimal (marked est présent dans les devDeps de la CI ; sinon `npm i -g marked`)
    node "$ROOT/scripts/zim/md2html.mjs" "$SRC" "$TMP"
    docker run --rm -v "$TMP:/src" -v "$PWD/$OUT:/output" ghcr.io/openzim/zim-tools:latest \
      zimwriterfs --welcome=index.html --illustration=favicon.png --language="$LANG_" --title="$TITLE" \
      --description="$DESC" --creator="Arche" --publisher="Arche" --name="$NAME" /src "/output/${NAME}_${STAMP}.zim" || { echo "zimwriterfs failed"; exit 1; }
    ;;
  *) echo "unknown tool $TOOL"; exit 2 ;;
esac

ZIM="$(ls -t "$OUT"/*.zim | head -1)"
[ -f "$ZIM" ] || { echo "no zim produced"; exit 1; }
# nom canonique : <name>_<YYYY-MM>.zim
CANON="$OUT/${NAME}_${STAMP}.zim"; [ "$ZIM" = "$CANON" ] || mv "$ZIM" "$CANON"
sha256sum "$CANON" | tee "$CANON.sha256"
SIZE=$(stat -c %s "$CANON" 2>/dev/null || stat -f %z "$CANON")
cat > "$OUT/build.json" <<JSON
{ "recipe": "$RECIPE_ID", "resource": "$(j resource)", "file": "$(basename "$CANON")", "size_bytes": $SIZE,
  "sha256": "$(cut -d' ' -f1 "$CANON.sha256")", "version": "$STAMP", "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "ia_item": "$(j ia_item)", "url": "$URL", "tool": "$TOOL", "license": "$LICENSE", "permission": "$PERM" }
JSON
echo "== done: $CANON ($SIZE bytes)"
