#!/usr/bin/env bash
# Construit un exécutable autonome (Node SEA) : aucun runtime à installer chez l'utilisateur.
# Builds a self-contained executable (Node Single Executable Application).
# Prérequis : npm run build ; esbuild pour le bundle CommonJS.
set -euo pipefail
npx esbuild dist/cli.js --bundle --platform=node --format=cjs --outfile=build/arche.cjs \
  
cat > build/sea-config.json <<JSON
{ "main": "build/arche.cjs", "output": "build/sea-prep.blob", "disableExperimentalSEAWarning": true,
  "assets": { "catalog": "catalog", "locales": "locales", "web": "dist/web/static" } }
JSON
node --experimental-sea-config build/sea-config.json
BIN=build/arche; [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]] && BIN=build/arche.exe
cp "$(command -v node)" "$BIN"
npx postject "$BIN" NODE_SEA_BLOB build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
echo "Built $BIN"
