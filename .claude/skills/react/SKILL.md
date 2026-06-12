---
name: react
description: Patrones de React 19 + Next.js 16 (App Router) de este proyecto — Server/Client Components, data fetching, forms, estado. Usar al crear o modificar componentes/páginas.
---

# React 19 + Next.js 16 (App Router)

Stack: React 19, Next.js 16 App Router, TS, Tailwind v4, shadcn/ui.

## Reglas base
- **Server Components por defecto.** Agregá `"use client"` solo si necesitás estado, efectos, eventos o browser APIs (leaflet, recharts, pdf client-side).
- Data fetching server-side directo en el componente cuando se pueda; en cliente, vía `lib/api.ts`.
- Forms: `react-hook-form` + `zod` (`@hookform/resolvers`).
- Estado del carrito: `hooks/useCart.ts` (no reimplementar).
- Estado de URL (filtros, tab, página): usar search params, no duplicar en estado local.

## Convenciones del proyecto
- Componentes `PascalCase`, hooks `useX`, formato con `lib/utils/format.ts`.
- UI: teal/cyan, `rounded-2xl`, componentes de `components/ui/`.
- Layout: páginas autenticadas envueltas por `components/layout/main-layout.tsx`.

Detalle y ejemplos en `patterns.md`.
