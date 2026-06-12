---
description: Implementa una feature nueva respetando la arquitectura
argument-hint: [descripción de la feature]
---

Feature: $ARGUMENTS

1. Leé `.claude/context/codemap.md` y el `<MODULO>.md` del área afectada.
2. Reutilizá lo existente: buscá service/hook/componente antes de crear algo nuevo. El carrito es `UnifiedCart` (no duplicar).
3. Si requiere tabla/columna nueva en Supabase → informá el SQL (`ALTER`/`CREATE`) ANTES de escribir código. Esperá a que se ejecute.
4. Acceso a datos vía `lib/api.ts` (fachada), no directo a `services/`.
5. UI consistente: teal/cyan, `rounded-2xl`, shadcn/ui. Forms con `react-hook-form` + `zod`.
6. Verificá `npm run build`. Agregá test si toca lógica crítica.
7. Actualizá el `<MODULO>.md` y el codemap si cambió la estructura.
