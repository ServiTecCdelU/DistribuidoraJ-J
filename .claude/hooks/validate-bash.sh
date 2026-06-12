#!/usr/bin/env bash
# PreToolUse(Bash): bloquea comandos peligrosos y posibles fugas de secrets.
# Recibe el payload del hook por stdin (JSON). Exit 2 = bloquear.
set -euo pipefail

payload="$(cat)"

# Extrae el comando (con jq si está; si no, grep simple).
if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')"
else
  cmd="$(printf '%s' "$payload" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*:[[:space:]]*"//; s/"$//')"
fi

block() { echo "[hook] BLOQUEADO: $1" >&2; exit 2; }

# Destructivos
case "$cmd" in
  *"rm -rf /"*|*"rm -rf ~"*|*":(){ :|:&};:"*) block "comando destructivo" ;;
  *"git push --force"*|*"git push -f"*) block "force push (revisar antes)" ;;
  *"DROP TABLE"*|*"TRUNCATE "*) block "SQL destructivo en CLI" ;;
esac

# Fuga de secrets de Supabase service role en comandos
if printf '%s' "$cmd" | grep -Eq 'sb_secret_|service_role'; then
  block "posible secret de Supabase en el comando — usar variable de entorno"
fi

exit 0
