---
description: Revisa los cambios sin commitear (calidad + seguridad)
---

Revisá el diff actual del proyecto.

1. Ejecutá `git diff` y `git status` para ver qué cambió.
2. Revisá contra `.claude/rules/security.md` primero (secrets, RLS, auth, input).
3. Luego `.claude/rules/code-style.md` y `architecture.md` (fachada `lib/api.ts`, no duplicar, no mutar, no romper estilos teal/`rounded-2xl`).
4. Reportá hallazgos por severidad: CRITICAL / HIGH / MEDIUM / LOW.
5. Para temas profundos, delegá en los agentes `code-reviewer` y `security-auditor`.

Salida: lista concreta de problemas con `archivo:línea`. Sin relleno.
