#!/usr/bin/env bash
# SAUVEGARDE D'URGENCE d'un site menacé de disparition — copie PRIVÉE (pas de publication).
# EMERGENCY RESCUE of a site at risk of vanishing — PRIVATE copy (no publishing).
#
# Produit, dans <out>/<recipe>/ :
#   1) un ZIM (Zimit ou mwoffliner, Docker) lisible dans Kiwix ;
#   2) un miroir wget des PDF/plans (léger, lisible sans aucun logiciel) ;
#   3) SHA256SUMS + rescue.json (date, URL, outil, licence, « usage privé »).
# Aucune permission n'est requise pour une copie personnelle (les licences NC l'autorisent) ; la PUBLICATION, elle,
# passe par zim-build.yml et le champ `permission` de catalog/zim-recipes.yaml.
#
# Usage : scripts/rescue/rescue.sh <recipe-id> <out-dir> [--pdf-only]
#   ex.  scripts/rescue/rescue.sh atelierpaysan-fr /Volumes/SSD/rescue
set -euo pipefail
RECIPE_ID="${1:?recipe id (see catalog/zim-recipes.yaml)}"; OUT="${2:?output dir}"; PDF_ONLY="${3:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
R="$(node -e "const {parse}=require('yaml');const r=parse(require('fs').readFileSync('$ROOT/catalog/zim-recipes.yaml','utf8')).find(x=>x.id==='$RECIPE_ID');if(!r){process.exit(2)};console.log(JSON.stringify(r))")" || { echo "unknown recipe $RECIPE_ID"; exit 2; }
j() { echo "$R" | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));const v=r['$1'];console.log(Array.isArray(v)?v.join(' '):(v??''))"; }
URL="$(j url)"; TOOL="$(j tool)"; NAME="$(j name)"; TITLE="$(j title)"; DESC="$(j description)"; LANG_="$(j lang)"; LICENSE="$(j license)"
HOST="$(node -e "console.log(new URL('$URL').host)")"
DEST="$OUT/$RECIPE_ID"; mkdir -p "$DEST"; STAMP="$(date -u +%Y-%m-%d)"
echo "== rescue $RECIPE_ID ($HOST) → $DEST"

# 1) Miroir des documents (PDF, images, plans) : le plus précieux, le plus léger, lisible sans Kiwix.
echo "-- wget mirror (documents)"
wget --mirror --no-parent --convert-links --adjust-extension --page-requisites --span-hosts --domains="$HOST" \
     --wait=1 --random-wait --retry-connrefused --tries=5 --timeout=30 -e robots=on \
     --user-agent="Arche-rescue/0.1 (+https://github.com/arche-project/arche; private archival copy)" \
     -P "$DEST/mirror" "$URL" || echo "wget finished with warnings (normal on large sites)"
find "$DEST/mirror" -type f -iname '*.pdf' | wc -l | xargs -I{} echo "   PDFs saved: {}"

if [ "$PDF_ONLY" != "--pdf-only" ]; then
  # 2) ZIM complet, lisible dans Kiwix (Docker requis)
  command -v docker >/dev/null || { echo "docker absent: ZIM skipped (mirror kept)"; TOOL=none; }
  case "$TOOL" in
    zimit)
      docker run --rm -v "$DEST:/output" ghcr.io/openzim/zimit:latest zimit --url "$URL" --name "$NAME" --title "$TITLE" \
        --description "$DESC" --lang "$LANG_" --zim-lang "$LANG_" --output /output $(j zimit_args) || echo "zimit failed" ;;
    mwoffliner)
      docker run --rm -v "$DEST:/output" ghcr.io/openzim/mwoffliner:latest mwoffliner --mwUrl="$URL" --adminEmail="rescue@example.org" \
        --outputDirectory=/output --customZimTitle="$TITLE" --customZimDescription="$DESC" $(j mwoffliner_args) || echo "mwoffliner failed" ;;
    *) ;;
  esac
fi

# 3) Empreintes + métadonnées
( cd "$DEST" && find . -type f ! -name SHA256SUMS -print0 | xargs -0 sha256sum > SHA256SUMS )
cat > "$DEST/rescue.json" <<JSON
{ "recipe": "$RECIPE_ID", "url": "$URL", "tool": "$TOOL", "license": "$LICENSE", "date": "$STAMP",
  "usage": "private archival copy — not for redistribution until permission is recorded in docs/permissions/",
  "publish_with": "scripts/zim/upload-ia.sh once IA_ACCESS_KEY/IA_SECRET_KEY exist and permission is 'license' or 'written'" }
JSON
du -sh "$DEST"; echo "== done. Keep two copies. Do NOT publish before permission (see docs/fr/SAUVEGARDE-URGENTE.md)."
