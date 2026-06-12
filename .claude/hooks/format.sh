#!/usr/bin/env bash
# PostToolUse(Write|Edit): formatea el archivo editado con Prettier si está disponible (best-effort).
set -uo pipefail

payload="$(cat)"

if command -v jq >/dev/null 2>&1; then
  file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // ""')"
else
  file="$(printf '%s' "$payload" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:[[:space:]]*"//; s/"$//')"
fi

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.json|*.css|*.md) : ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

# Prettier no es dependencia del proyecto; usar solo si existe localmente.
if [ -x "./node_modules/.bin/prettier" ]; then
  ./node_modules/.bin/prettier --write "$file" >/dev/null 2>&1 || true
fi

exit 0
