# Estilo de código

## Visual
- Border-radius estándar: `rounded-2xl`.
- Paleta principal: teal/cyan.
- Revisar estilos existentes antes de tocar cualquier componente visual (consistencia).
- shadcn/ui (Radix) para primitivos. No instalar libs UI nuevas sin consultar.

## TypeScript / React
- Componentes y tipos: `PascalCase`. Hooks: prefijo `use`. Constantes: `UPPER_SNAKE_CASE`.
- Server Components por defecto (App Router); `"use client"` solo cuando hace falta estado/efectos/eventos.
- Forms: `react-hook-form` + `zod`. Validar en el borde.
- Inmutabilidad: crear objetos nuevos, no mutar.
- Early returns en vez de anidar (>3 niveles = refactor).

## Organización
- Muchos archivos chicos > pocos grandes. ~200-400 líneas, 800 máx.
- Organizar por dominio/feature, no por tipo.
- No duplicar lógica: buscar service/hook/util existente primero.

## Errores
- Manejar explícitamente. Mensajes de UI con `sonner` (toast). No tragar errores en silencio.

## Prohibido
- `console.log` de debug en commits.
- Reescribir lógica que ya funciona "para limpiarla".
- Modificar `next.config.mjs`.
- Crear componentes nuevos si ya existe uno similar.
