#!/usr/bin/env bash
# Construit la base SQLite (corpus, ADR 0014) d'UNE ressource du catalogue dans une machine jetable (GitHub Actions ou
# n'importe quel runner) : télécharge la ressource, installe zim-tools et Ollama, embarque, écrit
# build.json pour upload-ia.sh et update-catalog.ts. Rien ne passe par la machine du mainteneur.
# Builds ONE catalog resource's SQLite corpus on a disposable machine.
#
# Usage : scripts/index/build.sh <resource-id> [out-dir] [embed-model]
set -euo pipefail
ID="${1:?resource id}"; OUT="${2:-build/index}"; MODEL="${3:-bge-m3}"; mkdir -p "$OUT"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; LIB="${ARCHE_LIBRARY:-$PWD/build/lib}"; mkdir -p "$LIB"
echo "== index $ID ($MODEL) → $OUT (library $LIB)"

# 1. La ressource elle-même (reprise auto, checksum) — c'est la même commande que chez l'utilisateur.
node "$ROOT/dist/cli.js" download --only "$ID" --library "$LIB" -y

# 2. zim-tools (zimdump) : binaire statique dans la bibliothèque, comme chez l'utilisateur (ADR 0008).
if ! command -v zimdump >/dev/null; then
  ZT_URL=$(curl -sSL https://api.github.com/repos/openzim/zim-tools/releases/latest | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(r.assets.find(a=>/linux-x86_64.*\.tar\.gz$/.test(a.name)).browser_download_url)")
  mkdir -p "$LIB/software/zim-tools" && curl -sSL "$ZT_URL" | tar -xz --strip-components=1 -C "$LIB/software/zim-tools"
  export PATH="$LIB/software/zim-tools:$PATH"
fi

# 3. Ollama + modèle d'embedding (CPU sur un runner GitHub : ~30 chunks/s, prévoir le temps).
if ! command -v ollama >/dev/null; then curl -fsSL https://ollama.com/install.sh | sh; fi
(ollama serve >/tmp/ollama.log 2>&1 &) ; sleep 5
ollama pull "$MODEL"

# 4. La base SQLite du corpus (ADR 0014), reprenable : un runner qui expire reprend au dernier lot commis au run
#    suivant si build/ est en cache. zstd est installé sur les runners GitHub : le .zst est produit à côté.
node "$ROOT/dist/cli.js" index build "$ID" --library "$LIB" --model "$MODEL" --out "$OUT/$ID.arche.sqlite" --json > "$OUT/result.json"
FILE="$ID.arche.sqlite"; [ -f "$OUT/$ID.arche.sqlite.zst" ] && FILE="$ID.arche.sqlite.zst"
sha256sum "$OUT/$FILE" | awk '{print $1}' > "$OUT/$FILE.sha256"

# build.json pour upload-ia.sh et update-catalog.ts (M1-10 les fait passer au bloc `index` de l'ADR 0014 : format, .zst, licence héritée).
node -e "
const fs=require('fs');const r=JSON.parse(fs.readFileSync('$OUT/result.json','utf8'));const p=r.zst??r;
const b={resource:'$ID',file:'$FILE',size_bytes:p.bytes,sha256:p.sha256,bytes_unpacked:r.bytes,model:r.model,dims:r.dims,chunks:r.chunks,articles:r.articles,built_at:r.built_at,ia_item:'arche-index-$ID',lexical:true};
fs.writeFileSync('$OUT/build.json',JSON.stringify(b,null,2));console.log(JSON.stringify(b));"
echo "== done: $OUT/build.json"
