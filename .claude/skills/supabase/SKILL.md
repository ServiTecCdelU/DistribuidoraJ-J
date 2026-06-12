---
name: supabase
description: Acceso a datos con Supabase en este proyecto — clientes anon/admin, services por tabla, RPC atómicas, IDs legibles. Usar al tocar services, rutas API o esquema de BD.
---

# Supabase

PostgreSQL + Auth + Storage. Reemplaza a Firebase (firebase quedó en deps pero sin uso).

## Dos clientes — no confundir
| Cliente | Archivo | Uso | Key |
|---------|---------|-----|-----|
| Anon | `lib/supabase.ts` | client-side | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Admin | `lib/supabase-admin.ts` | server-side (rutas API, RPC) | `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS) |

## Tablas
`ventas`, `clientes`, `productos`, `vendedores`, `pedidos`, `comisiones`, `usuarios`, `caja`, `auditoria`, `listas_precios`, `mayorista_productos`, `pedidos_mayorista`, `stock_movimientos`, `transacciones`, `configuracion`. Schema completo en `PLAN_MIGRACION_SUPABASE.md`.

## Patrón service
- Un `services/<dominio>-service.ts` por dominio. Expuesto por `lib/api.ts`.
- Mayorista: `mayorista_productos` (FK `producto_id`) hace JOIN con `productos`.
- IDs: `generateReadableId()` → `prefix_slug_N`. Mayorista: `mp_{codigo}` / `prod_mp_{codigo}`.
- Fechas legacy: `toDate()` de `supabase-helpers.ts`.

## RPC atómicas (transacción ACID)
Operaciones compuestas se hacen en funciones PostgreSQL, no en JS:
- `process_sale()` — venta + stock + crédito cliente + comisión.
- `apply_ganancia_global` — ganancia global mayorista (vía `/api/apply-ganancia`).

## Storage
Bucket `facturas` para PDFs de facturación.

Seguridad y RLS en `security-rules.md`.
