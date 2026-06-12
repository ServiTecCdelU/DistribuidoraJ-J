#!/usr/bin/env bash
# PostToolUse(Write|Edit): corre ESLint sobre el archivo editado (best-effort, no bloquea).
set -uo pipefail

payload="$(cat)"

if command -v jq >/dev/null 2>&1; then
  file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // ""')"
else
  file="$(printf '%s' "$payload" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:[[:space:]]*"//; s/"$//')"
fi

# Solo archivos JS/TS del proyecto.
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs) : ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

if [ -x "./node_modules/.bin/eslint" ]; then
  ./node_modules/.bin/eslint --fix "$file" 2>&1 || echo "[hook] eslint reportó issues en $file (no bloqueante)" >&2
fi

exit 0
