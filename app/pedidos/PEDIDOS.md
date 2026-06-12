# Módulo Pedidos — funcionamiento y maniobras

Documento de referencia rápida del módulo `app/pedidos/`. Explica el flujo, el bug de
pedidos duplicados/fantasma, y cómo diagnosticar y limpiar la base.

## Archivos clave

- `app/pedidos/page.tsx` — página principal. Lógica de listado, generación de remito, cobro.
- `components/pedidos/stock-check-modal.tsx` — modal previo al remito: ajustar cantidades, **reemplazar** por otra marca, o excluir items.
- `components/pedidos/payment-modal.tsx` — modal de cobro (`PaymentModal`). Calcula el total y registra roturas/faltantes.
- `components/pedidos/order-detail-modal.tsx` — detalle del pedido.
- `services/orders-service.ts` — acceso a tabla `pedidos` (`deleteOrder`, `completeOrder`, `saveRemitoToOrder`, `deleteRemitoFromOrder`).
- Tabla Supabase: **`pedidos`** (campo `items` es JSON: `[{ productId, name, price, quantity, codigo, itemDiscount, ... }]`).

## Estados del pedido

```
pending → preparation → delivery → completed
```

Los `completed` NO se muestran en Pedidos (pasan a Ventas).

## Trazabilidad 1 pedido = 1 remito = 1 venta (regla vigente desde 2026-06-12)

- Cada pedido es una fila propia en la lista: **NO se fusionan pedidos del mismo cliente** en
  ningún lado (ni en la tabla, ni en el remito, ni en el cobro, ni en el listado de carga).
- El remito se genera **solo sobre ese pedido** (sin consolidar ni borrar hermanos).
- El cobro (`completed`) procesa **solo ese pedido** → genera **una venta** ligada a ese pedido
  y ese remito.
- **El remito es obligatorio para pasar a reparto**: `handleStatusChange`, "Todos a reparto" y
  el pase seleccionado a reparto bloquean/filtran pedidos sin `remito_number`.
- Esto reemplaza la consolidación por cliente anterior (ver sección histórica más abajo, que
  queda como referencia del comportamiento viejo).

## ¿Cuándo se descuenta el stock?

> **Al generar el remito** (la mercadería sale del depósito), NO al cobrar.

- `generateRemitoForOrder` descuenta el stock de los items del remito (tipo `venta`, motivo `Remito N`)
  y marca el pedido con `stock_descontado = true` (columna en `pedidos`). Es idempotente: regenerar /
  reimprimir el remito NO vuelve a descontar.
- Al cobrar, `processSale` recibe `skipStock: true` cuando el pedido ya descontó → NO descuenta otra vez.
- Reconciliación de ajustes al cobrar (cuando `stock_descontado = true`):
  - **faltante** (no se cargó, vuelve al depósito) y **no_quiere** (devuelto) → se REPONEN al stock (tipo `ajuste`).
  - **rotura** → pérdida real: NO se repone (ya salió en el remito), solo queda registrada en caja.
- Si un pedido se cobra SIN remito previo (`stock_descontado = false`), el stock se descuenta al cobrar
  como antes (comportamiento legacy).
- **Borrar el remito** (`handleDeleteRemito` → `deleteRemitoFromOrder`) REPONE el stock descontado
  (entrada tipo `ajuste`) y resetea `stock_descontado=false`. Al regenerar el remito se vuelve a
  descontar con las cantidades correctas. Así corregir un remito (eliminar → regenerar) ajusta bien el stock.

## Generar remito (con reemplazos / cambio de cantidad)

`handleGenerateRemito` → abre `stock-check-modal` → `handleStockCheckConfirm` →
`generateRemitoForOrder(order, excludeProductIds, replacements, quantities)`.

Dentro de `generateRemitoForOrder`:
1. Construye `replacedItems` aplicando cambios de cantidad (`quantities[i.productId]`) y
   reemplazos (`replacements[i.productId]` → cambia `productId`, `name`, `price`, `codigo`).
2. `filteredItems` = quita los excluidos.
3. Si hubo cambios, hace `UPDATE pedidos SET items = filteredItems` y actualiza el estado local
   (`setOrders`, `setDetailOrder`). **El cambio SÍ se persiste en la base.**
4. Pide número de remito atómico (`rpc("next_remito_number")`), genera el PDF y lo guarda
   (`saveRemitoToOrder`).

> El remito se genera **por pedido individual**.

## Cobro (completar pedido)

`handleStatusChange(orderId, "completed")` (líneas ~424-452 de `page.tsx`):
- Toma **TODOS los pedidos no completados del mismo cliente** (`orders.filter` por `clientName`/`clientId`).
- Los **combina en uno solo** (`mergedOrder`) **sumando las cantidades del mismo producto**
  (`itemMap`, key = `productId || name`).
- `setSelectedOrder(mergedOrder)` y abre `PaymentModal`.

`PaymentModal` y `handleCompleteOrder` calculan el total desde `selectedOrder.items`
(no releen la base). Al confirmar → `salesApi.processSale(...)` (venta atómica) y
`completeOrder` para todos los pedidos del cliente.

> El cobro **agrupa por cliente y suma**. El remito es **por pedido**. Por eso, si un cliente
> tiene más de un pedido abierto, el monto del cobro NO coincide con un remito individual.

## ⚠ Bug conocido: pedidos fantasma / duplicados

**Síntoma:** el remito dice una cantidad (ej. 468) y el detalle/cobro dice otra (ej. 948).

**Causa:** el cliente tiene **más de un pedido abierto** en `delivery`. Como el cobro agrupa
todos los pedidos del cliente y suma por producto, las cantidades se duplican.
Caso real Primavera: pedido con remito (leche 468) + pedido sin remito (leche 480) = **948** al cobrar.

**Por qué aparecen:** pedidos que se "eliminan" desde la app a veces **siguen vivos en la
tabla `pedidos`** con `status=delivery` (la baja no llegó a la base, o se borró el remito y no
el pedido). Quedan como fantasmas y se suman al cobro.

**Agravante:** no hay realtime. El cobro usa el array `orders` en memoria del navegador. Si otro
usuario hizo el reemplazo, el cobrador no lo ve hasta **recargar (F5)**.

### Regla de negocio definida

> En reparto, **los pedidos sin remito NO van**: se eliminan. Lo que vale es el remito.

Cada cliente en `delivery` debe tener **un solo pedido, con remito**.

## Maniobra de limpieza (cómo se hizo)

Scripts Node read-first contra la API REST de Supabase (patrón de `scripts/*.js`):
leer `.env`, usar `SUPABASE_SERVICE_ROLE_KEY`, consultar/borrar vía `fetch` a
`${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/pedidos`.

**1. Diagnóstico** — listar pedidos en reparto, agrupar por cliente, marcar remito sí/no y
productos que se repiten entre pedidos (se suman al cobrar):

```js
// GET pedidos en reparto
fetch(`${URL}/rest/v1/pedidos?status=eq.delivery&select=id,client_name,client_id,remito_number,items&order=client_name.asc`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
// agrupar por client_id; los clientes con >1 pedido son candidatos.
// comparar items: si un producto aparece en el pedido con remito Y en el sin remito → duplicado.
```

**2. Criterio de borrado** (caso por caso, NO a ciegas):
- Sin remito **duplicado dentro** del que tiene remito → fantasma, borrar (Primavera, Alexander).
- Sin remito con productos **propios no facturados** → el remito quedó incompleto; revisar antes.
- Por regla final del dueño: **todo pedido en reparto sin remito se borra.**

**3. Borrado** (equivale a `deleteOrder` = `DELETE FROM pedidos WHERE id = ...`):

```js
fetch(`${URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}`,
  { method: 'DELETE', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=minimal' } })
```

Borrar el pedido NO toca stock (el stock se mueve al generar el remito). Si el pedido borrado ya
tenía remito (`stock_descontado = true`), su stock ya salió: reponer a mano si corresponde.

**4. Verificar:** re-consultar `status=eq.delivery` y confirmar que cada cliente tiene un único
pedido con remito.

### Limpieza realizada (2026-06-03)

Eliminados de `delivery` por estar sin remito / duplicados:
- `pedido_supermercadoprimavera_1` (leche 480 — duplicaba la del remito R-2026-00020).
- `pedido_alexandervenezu_1` (alfajores ya incluidos en remito R-2026-00035).
- `pedido_kiosco23_1` (sin remito).
- `pedido_oliveramiriam_1` (sin remito).
- `pedido_martinezgabriel_1` (sin remito).

Quedaron solo pedidos con remito: R-2026-00035, R-2026-00029, R-2026-00033, R-2026-00020.

## Consolidación al generar remito (cura de raíz)

`generateRemitoForOrder` ahora **consolida todos los pedidos abiertos del cliente en uno**:
1. El remito se arma sobre los items fusionados del cliente (`mergedOrder` de `computeRow`,
   cuya base es el pedido que ya tiene remito para conservar su número).
2. Persiste ese set de items en ESE pedido (`UPDATE pedidos SET items = filteredItems`).
3. Guarda el remito (regenerar conserva el mismo número, no quema uno nuevo).
4. **Borra los pedidos hermanos** del mismo cliente/estado (sus items ya quedaron en el remito).

Resultado: **1 cliente = 1 pedido con remito**. Listado de carga, remito y cobro (todos agrupan
por cliente) coinciden siempre. Esto reemplaza los parches anteriores de exclusión en el cobro.

> Si un pedido viejo quedó con remito incompleto y PDF stale: limpiar `remito_pdf_base64` (NULL)
> conservando `remito_number`, y regenerar desde la app (reusa el número, consolida y reimprime).

## Pendiente / deuda técnica

- **Origen del bug:** revisar el botón de eliminar pedido en la app — está dejando el registro
  vivo en la base (genera fantasmas). La consolidación al generar remito los absorbe, pero
  conviene cortar el origen igual.
- **Cobro stale:** al abrir el cobro, releer el/los pedido(s) desde Supabase (o realtime), en
  vez de usar `orders` en memoria.
