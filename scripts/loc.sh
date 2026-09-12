#!/usr/bin/env bash
# Mesure le noyau (ADR 0013 ; audit, décision 4 : « petit noyau, grande base »).
# Compte les lignes de code TypeScript/JavaScript de src/, examples/ et vendor/ — hors tests
# (*.test.ts), hors déclarations (*.d.ts), hors node_modules/ et fixtures/. Pas de HTML, YAML ni
# Markdown : on mesure le logiciel, pas la connaissance.
# Measures the core: TS/JS lines in src/, examples/ and vendor/, tests and vendored deps excluded.
#
# Usage :
#   scripts/loc.sh                 affiche src/, examples/, vendor/ séparément
#   scripts/loc.sh --max 7000      idem, et échoue (code 1) si src/ dépasse le seuil — c'est la CI
#   scripts/loc.sh --readme        idem, et réécrit le bloc <!-- loc --> … <!-- /loc --> du README
#   scripts/loc.sh --root DIR      mesure un autre dépôt (tests)
#
# Bash 3.2 suffit (macOS), aucune commande externe hors `wc` : pas de find, sed ni awk, pour que
# le même script tourne tel quel sous Linux, macOS et Git Bash (Windows).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAX=""
README=0
while [ $# -gt 0 ]; do
  case "$1" in
    --max) MAX="$2"; shift 2 ;;
    --readme) README=1; shift ;;
    --root) ROOT="$(cd "$2" && pwd)"; shift 2 ;;
    -h|--help) echo "usage: scripts/loc.sh [--max N] [--readme] [--root DIR]"; exit 0 ;;
    *) echo "loc.sh: option inconnue / unknown option: $1" >&2; exit 2 ;;
  esac
done

# Liste récursive des fichiers de code d'un dossier (un chemin par ligne).
list_code() {
  local d="$1" f
  for f in "$d"/*; do
    [ -e "$f" ] || continue
    if [ -d "$f" ]; then
      case "$f" in */node_modules|*/fixtures|*/dist) continue ;; esac
      list_code "$f"
    else
      case "$f" in
        *.test.ts|*.d.ts) ;;
        *.ts|*.tsx|*.js|*.mjs|*.cjs) printf '%s\n' "$f" ;;
      esac
    fi
  done
}

# Nombre de lignes de code d'un dossier (0 s'il n'existe pas).
count() {
  local d="$ROOT/$1" total=0 n f
  [ -d "$d" ] || { echo 0; return; }
  while IFS= read -r f; do
    n=$(wc -l < "$f")
    total=$((total + n))
  done < <(list_code "$d")
  echo "$total"
}

SRC=$(count src)
EXAMPLES=$(count examples)
VENDOR=$(count vendor)

printf '%-10s %6s lignes\n' 'src/' "$SRC" 'examples/' "$EXAMPLES" 'vendor/' "$VENDOR"

if [ "$README" = 1 ]; then
  # Réécrit ce qui se trouve entre <!-- loc --> et <!-- /loc --> (sur une même ligne ou non).
  file="$ROOT/README.md"
  tmp="$file.tmp"
  inside=0
  found=0
  : > "$tmp"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      *'<!-- loc -->'*'<!-- /loc -->'*)
        found=1
        printf '%s\n' "${line%%<!-- loc -->*}<!-- loc -->\`src/\` ${SRC} · \`examples/\` ${EXAMPLES} · \`vendor/\` ${VENDOR}<!-- /loc -->${line#*<!-- /loc -->}" >> "$tmp" ;;
      *'<!-- loc -->'*)
        found=1; inside=1
        printf '%s\n' "$line" >> "$tmp"
        printf '%s\n' "\`src/\` ${SRC} · \`examples/\` ${EXAMPLES} · \`vendor/\` ${VENDOR}" >> "$tmp" ;;
      *'<!-- /loc -->'*)
        inside=0
        printf '%s\n' "$line" >> "$tmp" ;;
      *)
        [ "$inside" = 1 ] || printf '%s\n' "$line" >> "$tmp" ;;
    esac
  done < "$file"
  if [ "$found" = 1 ]; then
    mv "$tmp" "$file"
    echo "README.md mis à jour / updated"
  else
    rm -f "$tmp"
    echo "loc.sh: aucun bloc <!-- loc --> dans README.md" >&2
    exit 2
  fi
fi

if [ -n "$MAX" ] && [ "$SRC" -gt "$MAX" ]; then
  echo "loc.sh: src/ fait $SRC lignes, seuil $MAX (audit, décision 4 : on soustrait, on n'ajoute pas)" >&2
  exit 1
fi
