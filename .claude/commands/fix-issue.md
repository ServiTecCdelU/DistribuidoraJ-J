---
description: Diagnostica y corrige un bug
argument-hint: [descripción del bug o área]
---

Bug a resolver: $ARGUMENTS

1. Ubicá el área en `.claude/context/codemap.md` y leé el `<MODULO>.md` correspondiente.
2. Diagnosticá la causa raíz ANTES de parchear. No agregar código defensivo sin entender el origen.
3. Si es un problema de datos en Supabase, revisá si hay un `scripts/diag-*.js` reutilizable o creá uno temporal.
4. Edición quirúrgica: cambiá solo lo necesario.
5. Verificá: `npm run build` y, si toca lógica de negocio, agregá/corré test con `npm run test`.
6. No commitear hasta que el build pase.
