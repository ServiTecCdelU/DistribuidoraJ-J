---
description: Refactor seguro sin cambiar comportamiento
argument-hint: [archivo o área]
---

Objetivo del refactor: $ARGUMENTS

Reglas:
- No cambiar comportamiento observable. Refactor ≠ feature.
- No reescribir lógica que ya funciona solo para "limpiarla" salvo que se pida explícito.
- Edición quirúrgica. Preferir extraer funciones/módulos chicos antes que reescrituras grandes.
- Respetar la fachada `lib/api.ts` y la separación services/hooks/components.

Pasos:
1. Identificá duplicación real o archivos >800 líneas / funciones >50 líneas.
2. Extraé a util/hook/service reutilizable.
3. Mantené inmutabilidad y early returns.
4. `npm run build` + `npm run test` deben pasar igual que antes.
5. Actualizá `.claude/context/codemap.md` si se movieron archivos.
