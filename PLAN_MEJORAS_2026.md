# Plan de Mejoras — Distribuidora Patricia

> Rama: `feat/mejoras`. Basado en análisis del código real (jun 2026).
> Prioridad: P0 crítico · P1 alto · P2 medio · P3 valor agregado.

---

## 0. Hallazgos críticos (estado actual)

| # | Hallazgo | Evidencia | Impacto |
|---|----------|-----------|---------|
| H1 | El historial de stock vive en **localStorage**, no en BD | `lib/inventory-history.ts`, `app/productos/page.tsx:432-510` (`stockHistory`, `inventoryHistory`) | Se pierde por navegador, máx 200 registros, **no dice qué admin** sumó/restó |
| H2 | `stock_movimientos` **no guarda el usuario** | `services/stock-service.ts:65`, `app/api/productos/[id]/movimiento/route.ts:27` | Imposible saber quién hizo cada ajuste |
| H3 | Auditoría existe pero **está muerta** | `logAudit` definido en `services/audit-service.ts` pero **nunca se invoca** | Tabla `auditoria` vacía; no hay trazabilidad |
| H4 | **RLS deshabilitado** en Supabase | `PLAN_MEJORAS.md` 1.1, `.claude/rules/security.md` | Cualquier anon key puede leer/escribir todo |
| H5 | `/api/productos/[id]/movimiento` usa **service role sin validar auth** | `route.ts` no llama `api-auth` | Cualquiera inserta movimientos de stock |
| H6 | Secreto Supabase **hardcodeado** en `settings.local.json` | `CLAUDE.local.md` pendientes | Rotar |

---

## 1. Historial de producto con trazabilidad real (P0)

**Objetivo:** saber con exactitud qué admin sumó o restó stock, cuándo y por qué.

### SQL previo (ejecutar antes del código)
```sql
ALTER TABLE stock_movimientos
  ADD COLUMN IF NOT EXISTS usuario_id   text,
  ADD COLUMN IF NOT EXISTS usuario_nombre text,
  ADD COLUMN IF NOT EXISTS origen       text; -- 'admin_ajuste' | 'venta' | 'apertura_bulto' | 'rotura' | 'import'

CREATE INDEX IF NOT EXISTS idx_stock_mov_producto_fecha
  ON stock_movimientos (mayorista_producto_id, created_at DESC);
```

### Cambios de código
1. `registrarMovimiento` y la ruta `/movimiento` reciben y persisten `usuario_id`, `usuario_nombre`, `origen` (tomar de la sesión, no del cliente).
2. `components/productos/stock-history-modal.tsx`: leer de `stock_movimientos` (vía service), **eliminar** la lectura de localStorage.
3. Borrar `lib/inventory-history.ts` y el bloque localStorage de `app/productos/page.tsx` (deuda muerta).
4. Cada acción admin (crear/editar/eliminar producto, cambio de precio, ajuste de stock) llama `logAudit` → resucitar la tabla `auditoria`.
5. Modal de historial: filtros por tipo, usuario y rango de fecha; mostrar "Juan (admin) +50 un. · motivo · 14/06 10:32".

---

## 2. Auditoría general (P1)

- Conectar `logAudit` en todos los services que mutan: `products`, `sellers`, `clients`, `sales`, `price-list`, `caja`, `cobranzas`.
- Página `app/auditoria/page.tsx`: filtros por usuario, entidad, acción y fecha; export a Excel.
- Helper `withAudit()` para no repetir el patrón en cada service.

---

## 3. Rendimiento y velocidad (P1)

### Frontend
- **Pages gigantes** (client components) inflan el bundle y la hidratación:
  - productos 2378 · pedidos 2179 · caja 1823 · mayorista 1739 · cuenta-corriente 1645 · tienda 1613 líneas.
  - Partir en subcomponentes (`<800` líneas) y mover lo estático a **Server Components**.
  - `UnifiedCart` 1352 y `product-modal` 1135: extraer secciones.
- Lazy-load de modales pesados (`route-map-modal`, `remito-import-modal`, PDF) con `dynamic()`.
- `tienda`: virtualizar grilla de productos y usar `next/image` (hoy `images.unoptimized`).

### Backend / queries
- **N+1 en comisiones:** `getAllCommissions` (`sellers-service.ts:130`) hace 1 query por vendedor. Reemplazar por una sola query agregada / RPC.
- `descontarStockVenta`: cada item dispara select+select+insert+2 updates. Mover a **RPC batch** (`registrar_movimientos_venta`).
- `actualizarVentasPendientesFIFO`: trae todas las ventas pendientes y filtra en JS. Filtrar en SQL.
- Confirmar que **toda** venta pasa por la RPC `process_sale` (atómica) y no por inserts sueltos.

---

## 4. Consumo de BD (P2)

- Eliminar `select('*')` donde se usan pocas columnas (`sellers`, `audit`, `stock`, listados). Traer solo lo necesario.
- **Doble fuente de stock:** cada movimiento actualiza `productos.stock` **y** `mayorista_productos.stock_local` (2 updates por item). Definir una sola fuente de verdad y derivar la otra.
- Índices faltantes:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_ventas_status_fecha ON ventas (status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_clientes_seller ON clientes (seller_id);
  ```
- Paginar las vistas que hoy traen todo (cuenta-corriente, mayorista, ventas).
- Cachear catálogo público (`/api/public/productos`) con `revalidate`.

---

## 5. Seguridad (P0/P1)

- **P0** Aplicar RLS en Supabase (políticas por rol). Ver `PLAN_MEJORAS.md` 1.1.
- **P0** Rotar el secreto Supabase hardcodeado en `settings.local.json`.
- **P1** Toda ruta con `supabaseAdmin` (service role) debe validar sesión + rol con `lib/api-auth.ts`. Auditar: `/api/productos/[id]/movimiento`, `apply-ganancia`, `import-productos`, `remitos`.
- **P1** Validar `params.id` y todos los body con `zod` (varios ya lo hacen; faltan los `[id]`).
- **P2** Rate-limit en endpoints de mutación (hoy solo in-memory; documentar reset en redeploy).
- **P2** No filtrar `error.message` crudo al cliente (`/movimiento:37`). Loguear server, devolver genérico.

---

## 6. Vendedores (P1)

- Panel por vendedor: ventas, comisiones, clientes asignados y **actividad** (de `auditoria`).
- Corregir N+1 de comisiones (sección 3).
- Registrar en auditoría alta/baja/edición de vendedor.
- Ranking y métricas (ticket promedio, % cumplimiento) con Recharts.
- App de campo (`app/vendedor`): geolocalizar visita al registrar pedido (sección 7).

---

## 7. Responsive (P2)

- Replicar el patrón ya usado en `pedidos` (tabla desktop `hidden lg:block` + lista compacta mobile) en: **productos, caja, cuenta-corriente, mayorista, empleados**.
- Auditar overflow horizontal en tablas anchas (320/375/768/1024).
- Modales a pantalla completa en mobile (`product-modal`, `order-detail-modal`).
- Sidebar: verificar colapso y navegación táctil.

---

## 8. APIs externas para sumar valor (P3)

| API | Uso | Beneficio |
|-----|-----|-----------|
| **AFIP Padrón A5** (ya hay SDK AFIP) | Autocompletar razón social y condición fiscal por CUIT al alta de cliente | Menos errores de facturación |
| **WhatsApp** (`wa.me` / Business API) | Enviar remito/factura y **recordatorio de deuda** al cliente | Cobranza más rápida |
| **dolarapi / BCRA** | Mostrar cotización y **reajuste masivo de precios** por inflación | Precios al día |
| **Resend / email** | Comprobantes y resumen de cuenta por mail | Profesionaliza |
| **Mercado Pago** | Pago online en la tienda (checkout) | Más ventas |
| **OSRM / Mapbox Directions** | Optimizar rutas de reparto (ya hay Leaflet + route-map) | Menos km, menos combustible |
| **Nominatim / Google Geocoding** | Geocodificar direcciones de clientes | Mapa de pedidos preciso |

---

## Orden de ejecución sugerido

1. **Sprint 1 (P0):** Historial de producto con usuario (sec. 1) + auth en rutas service-role + RLS + rotar secreto (sec. 5).
2. **Sprint 2 (P1):** Auditoría general (sec. 2) + N+1 comisiones y RPC de stock (sec. 3) + panel vendedores (sec. 6).
3. **Sprint 3 (P2):** Consumo BD/índices (sec. 4) + responsive (sec. 7) + partir pages gigantes (sec. 3).
4. **Sprint 4 (P3):** APIs externas priorizadas (WhatsApp deuda, AFIP padrón, reajuste por dólar).

> Cada cambio de lógica de negocio (ventas, stock, comisiones) lleva test Vitest.
