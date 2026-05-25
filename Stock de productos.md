# Plan: Historial de Movimientos de Stock (por producto)

## Estado actual
- `StockHistoryModal` lee de **localStorage** — datos volátiles, se pierden al limpiar el browser.
- No hay conexión real con `stock_movimientos` en Supabase.
- El modal usa cards, no tabla.
- Sin paginación server-side.

## Objetivo
Reemplazar el historial con datos reales de Supabase, vista tabla paginada, con info de venta/vendedor/cliente enriquecida.

---

## Tablas involucradas

### `stock_movimientos`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid/serial | PK |
| `mayorista_producto_id` | string | FK → `mayorista_productos.id` (`mp_{codigo}`) |
| `tipo` | string | `venta` / `apertura_bulto` / `ajuste` / `rotura` |
| `cantidad` | number | negativo = salida, positivo = entrada |
| `stock_anterior` | number | stock antes del movimiento |
| `stock_posterior` | number | stock después del movimiento |
| `motivo` | string | para ventas: guarda el `ventaId` |
| `created_at` | timestamp | fecha del movimiento |

### `ventas` (para JOIN cuando tipo='venta')
Columnas útiles: `id`, `sale_number`, `seller_name`, `client_name`, `total`

### `pedidos` (para stock reservado en pedidos activos)
Columnas útiles: `status`, `items` (JSONB array con `productId`, `quantity`)  
Estados activos: `pending`, `preparation`, `delivery`

---

## Mapeo de IDs
- `productos.id` = `prod_mp_{codigo}` (lo que recibe el modal)
- `mayorista_productos.id` = `mp_{codigo}`
- Derivación: `productos.id.replace(/^prod_/, '')` → `mayorista_producto_id`

---

## Partes del trabajo

### Parte 1 — API Route (backend)
**Archivo**: `app/api/productos/[id]/stock-history/route.ts`

**GET** `/api/productos/{productId}/stock-history?page=1&limit=20&tipo=all`

Lógica:
1. Derivar `mayoristId = productId.replace(/^prod_/, '')`
2. Query paginada a `stock_movimientos` filtrada por `mayorista_producto_id`
3. Para registros con `tipo='venta'` y `motivo` no-null, batch-lookup en `ventas` → trae `sale_number`, `seller_name`, `client_name`, `total`
4. Query a `pedidos` activos (status != 'completed') con este producto → suma `stockEnPedidos`
5. Calcular stats:
   - `unitsSold`: suma `abs(cantidad)` donde `tipo='venta'`
   - `totalRevenue`: suma `ventaTotal` de ventas encontradas
   - `adjustments`: count de `tipo='ajuste'` + `tipo='rotura'`
   - `currentStock`: último `stock_posterior`
   - `stockHistorico`: `currentStock + unitsSold + roturas`
   - `stockEnPedidos`: cantidad reservada en pedidos activos

**Response**:
```json
{
  "data": [ { "id", "tipo", "cantidad", "stockAnterior", "stockPosterior",
              "fecha", "saleNumber", "sellerName", "clientName", "ventaTotal" } ],
  "total": 150,
  "page": 1,
  "totalPages": 8,
  "stats": { "unitsSold", "totalRevenue", "adjustments", "currentStock",
             "stockHistorico", "stockEnPedidos" }
}
```

---

### Parte 2 — Modal reescrito (frontend)
**Archivo**: `components/productos/stock-history-modal.tsx`

**Cambios**:
- Eliminar props `history: StockMovement[]` (ya no viene de localStorage)
- Agregar fetch interno al abrir el modal (`/api/productos/{id}/stock-history`)
- Paginación interna (20 por página)
- Vista **tabla** responsive:
  - Desktop (≥640px): tabla completa con columnas
  - Mobile: filas compactas stacked

**Columnas de la tabla**:
| # | Columna | Desktop | Mobile |
|---|---|---|---|
| 1 | Fecha | ✓ fecha+hora | solo fecha |
| 2 | Tipo | badge color | badge |
| 3 | Cantidad | +N / -N coloreado | ✓ |
| 4 | Stock | `ant→post` | ✓ |
| 5 | Venta # | sale_number | combinado |
| 6 | Vendedor | seller_name | combinado |
| 7 | Cliente | client_name | combinado |
| 8 | Monto | total de la venta | solo si venta |

**Badges por tipo**:
- `venta` → azul — "Venta"
- `apertura_bulto` → verde — "Ingreso"
- `ajuste` → ámbar — "Ajuste"
- `rotura` → rojo — "Rotura"

**Stats (header del modal)**:
```
Unid. Vendidas | Ingresos | Ajustes | Stock Actual | En Pedidos | Stock Histórico
```

**Filtros** (tabs arriba de la tabla):
Todos | Ventas | Ingresos | Ajustes | Roturas

---

## Orden de commits

1. `feat: agrega api route historial de stock con datos reales de supabase`
   - Crea `app/api/productos/[id]/stock-history/route.ts`
   - Lógica de paginación, JOIN ventas, stats, stock en pedidos

2. `feat: reescribe modal historial de stock con tabla paginada`
   - Reescribe `components/productos/stock-history-modal.tsx`
   - Conecta a la nueva API
   - Vista tabla responsive con paginación

---

## Notas
- El historial de localStorage **no se borra** — sigue funcionando como fallback si no hay datos en Supabase.
- No se requieren cambios en la tabla `stock_movimientos` (se usa la estructura existente).
- El botón "Historial" en cada producto de la lista ya existe y ya llama `handleViewHistory`.
- La prop `product` del modal ya tiene `id` del producto.
