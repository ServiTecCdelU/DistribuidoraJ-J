# Rediseño de Ofertas/Descuentos — Diseño

Fecha: 2026-06-09

## Problema

El sistema de ofertas actual tiene tres mecánicas por producto (Descuento %, Regala el
mismo, Regala otro) más un sistema de **cupos por vendedor** (tabla `descuento_vendedor`)
que gatea qué vendedor ve cada oferta y cuántas unidades puede dar. Además existe un tope
global de descuento por vendedor (`vendedores.descuento_maximo` / `maxDiscount`). Se quiere
simplificar y dar libertad al vendedor:

1. Eliminar el sistema de **cupos**.
2. El **% del producto pasa a ser el MÁXIMO** que el vendedor puede aplicar (juega de 0 a
   ese tope). Solo los productos con % configurado admiten descuento. Se elimina el tope
   global por vendedor.
3. Los **regalos** (mismo producto y otro) los da el vendedor en la **cantidad que quiera**
   (libre), con un tope opcional por producto. El admin solo habilita y, para "regala otro",
   fija qué producto se regala.

## Decisiones de diseño

- El admin configura por producto. El vendedor decide al vender (descuento 0..máx, regalos
  0..tope-opcional).
- Solo productos con `descuento > 0` admiten descuento. Sin tope global de vendedor.
- Para "regala otro", el producto a regalar lo fija el admin; el vendedor solo decide cuántas.
- Esquema con columnas nuevas de nombres claros (aprobado y ya ejecutado en Supabase).

## Modelo de datos (`productos`)

- `descuento` (int %): **reinterpretado** como "máximo de descuento del vendedor para ese
  producto". `0`/null = no admite descuento. Mismo campo, nuevo significado.
- **Dejan de usarse** (columnas quedan, ignoradas): `descuento_cantidad`, `regalo_cada`,
  `regalo_cantidad`, `regalo_producto_cada`, `regalo_producto_cantidad`.
- **Nuevas** (ya creadas):
  - `regalo_mismo` (boolean, default false): el producto permite regalar unidades del mismo.
  - `regalo_mismo_max` (int, null = libre): tope opcional de unidades a regalar (mismo).
  - `regalo_otro_max` (int, null = libre): tope opcional de unidades a regalar (otro).
- Se mantienen `regalo_producto_id`, `regalo_producto_nombre` (qué producto se regala en "otro").
- Tabla `descuento_vendedor`: **eliminada** (ya dropeada).
- `vendedores.descuento_maximo`: deja de usarse (columna queda, ignorada).

SQL ya ejecutado:
```sql
ALTER TABLE productos ADD COLUMN IF NOT EXISTS regalo_mismo boolean DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS regalo_mismo_max integer;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS regalo_otro_max integer;
DROP TABLE IF EXISTS descuento_vendedor;
```

## Tipos (`lib/types.ts`)

En `Product`:
- Mantener `descuento` (ahora = máximo).
- Quitar `descuentoCantidad`, `regaloCada`, `regaloCantidad`, `regaloProductoCada`,
  `regaloProductoCantidad` del tipo (o dejarlos opcionales legacy sin uso). Se opta por
  **quitarlos** para que el compilador marque los usos viejos.
- Agregar `regaloMismo?: boolean`, `regaloMismoMax?: number | null`, `regaloOtroMax?: number | null`.
- Mantener `regaloProductoId`, `regaloProductoNombre`.

En `Seller`: quitar `maxDiscount` (y su uso). En el tipo del carrito quitar `sellerMaxDiscount`.

## Página de Ofertas (`app/descuentos/page.tsx`)

- **Descuento %**: el input se rotula "Máximo de descuento %". Guarda `descuento`. Sin cambios
  de lógica salvo el label y quitar la recarga de `getTotalesCupos`.
- **Regala mismo**: reemplazar inputs "cada / gratis" por: toggle "Permite regalar el mismo"
  (`regaloMismo`) + input opcional "Máximo a regalar" (`regaloMismoMax`, vacío = libre).
- **Regala otro**: buscador de producto (igual) + input opcional "Máximo a regalar"
  (`regaloOtroMax`). Quitar "cada X".
- **Eliminar**: panel de cupos por vendedor (`toggleCupos`, `setCupo`, `aplicarATodos`,
  `handleSaveCupos`, estados `cupos`/`cuposTotales`/`vendedores`, el aviso "Sin cupos",
  el botón `onCupos` de `OfferRow`), e import de `descuento-vendedor-service`.
- `ofertasDe` / badges: actualizar textos ("Descuento máx X%", "Regala mismo (máx N / libre)",
  "Regala N de [producto]"). Estado activa/sin_stock se mantiene.

## Service de productos (`services/products-service.ts`)

- `mapProduct`: leer `regalo_mismo`, `regalo_mismo_max`, `regalo_otro_max`; dejar de mapear
  los campos viejos de ratio/cupo.
- `update`: persistir los campos nuevos; quitar persistencia de los viejos.
- Quitar `getTotalesCupos`/`getConOfertas` solo si dependían de los viejos (mantener
  `getConOfertas` pero ajustando el criterio de "tiene oferta" a: `descuento>0 || regaloMismo
  || regaloProductoId`).

## Carrito — config (`hooks/useCart.ts`)

- **Quitar**: `sellerMaxDiscount` (estado, set, dependencias), import y uso de
  `descontarVendedor`, lógica de `descuentoCantidad`/`maxOferta`, base `adminDiscount`
  auto-aplicada, y el bloque que descuenta cupos al vender.
- **Descuento por ítem**: `setItemDiscount(item, value)` capa el valor a `producto.descuento`
  (máximo del producto). Si `descuento` es 0/null → no permite (input deshabilitado / cap 0).
  Arranca en 0.
- **Regalo mismo**: nuevo `setItemRegaloMismo(item, n)` que setea `item.regalo = n` (0..tope
  `regaloMismoMax` si existe). Validar que `quantity + regalo <= stock`.
- **Regalo otro**: nuevo `setItemRegaloOtro(item, n)` que registra n unidades del
  `regaloProductoId` configurado (0..`regaloOtroMax` si existe). Al construir la venta, se
  agrega como línea de regalo (precio 0, `esRegalo`, `regaloDe` = id del producto origen) y
  descuenta stock del producto regalado. Validar contra stock del producto regalado.
- Al construir los items de la venta: `regalo` (mismo) y las líneas de regalo cruzado salen de
  los valores manuales, no de `unidadesRegalo`/`calcularRegalosCruzados`.

## Carrito — UI (`components/cart/UnifiedCart.tsx`)

- `ItemDiscountRow`: `maxDiscountAllowed` pasa a ser `item.product.descuento` (no
  `sellerMaxDiscount`). Mostrar solo si `descuento > 0`.
- Por ítem, cuando `product.regaloMismo`: input "Regalar (mismo)" → `setItemRegaloMismo`.
- Por ítem, cuando `product.regaloProductoId`: input "Regalar [nombre]" → `setItemRegaloOtro`.
- Quitar uso de `unidadesRegalo` para auto-calcular; mostrar los regalos manuales elegidos.

## promo.ts (`lib/utils/promo.ts`)

- `unidadesRegalo`, `maxQtyPagable`, `calcularRegalosCruzados` quedan obsoletas (basadas en
  ratio). Eliminar o reducir a helpers de validación de stock simples. Se opta por
  **eliminarlas** y reemplazar la validación de stock con `quantity + regalo <= stock` inline.

## Limpieza transversal

- `services/descuento-vendedor-service.ts`: **borrar**.
- `app/empleados/page.tsx`: quitar campo/uso de `maxDiscount` (`descuento_maximo`).
- `services/sellers-service.ts`: quitar map/create/update de `maxDiscount`.
- `app/api/public/vendedores/route.ts`: quitar `sellerMaxDiscount` de la respuesta.
- `app/ventas/nueva/page.tsx`: quitar `descuentoCantidad` y el texto "Nu en oferta"; el card
  de producto muestra "hasta X% dto." (máximo) en vez del % fijo.
- `services/mayorista-service.ts`: **importa `getAsignacionesVendedor` y
  `getProductosConOfertaVendedor` del service de cupos (que se borra)**. Quitar ese import.
  El filtro `soloDescuento` para un `vendedorId` pasa a filtrar `descuento > 0` para todos
  (sin gate de cupo, líneas ~173-175). Quitar `asignaciones` (~207-208) y dejar
  `descuentoCantidad: descuento > 0 ? null : null` → simplificar a que la oferta mayorista
  aplica para todos cuando `descuento > 0` (sin tope de cupo). No se cambia la semántica del
  precio mayorista, solo se saca el cupo.

## Flujo de datos

```
Admin (Ofertas) configura por producto:
  descuento (máx %)  |  regalo_mismo (+max?)  |  regalo_producto_id (+regalo_otro_max?)
        │
        ▼
Vendedor (carrito) decide por ítem:
  descuento 0..máx   |  regalar N (mismo, 0..max) | regalar N de [producto] (0..max)
        │
        ▼
Venta: item.itemDiscount = % elegido; item.regalo = N (mismo);
       línea regalo (precio 0, esRegalo) para "otro".
  Stock: descuenta (cantidad + regalo) del producto y N del producto regalado.
```

## Errores y casos borde

- Producto sin `descuento` configurado: no se permite descuento (input oculto/cap 0).
- Regalo (mismo): `quantity + regalo` no puede superar el stock del producto.
- Regalo (otro): N no puede superar el stock del producto regalado; si el regalado quedó sin
  stock, se bloquea/avisa (badge "sin stock" en Ofertas ya contempla esto).
- Tope vacío (`regalo_mismo_max`/`regalo_otro_max` null) = sin límite de unidades.
- Ofertas activas: un producto "tiene oferta" si `descuento>0 || regaloMismo || regaloProductoId`.

## Fuera de alcance (YAGNI)

- Descuento general (ya estaba comentado, no se reactiva).
- Migrar datos viejos de `regalo_cada`/`regalo_cantidad` a la nueva semántica (los ratios
  viejos no se traducen automáticamente; el admin reconfigura las promos que quiera).
- Tope global de descuento por vendedor (se elimina).

## Verificación

- `npm run build` sin errores.
- Ofertas: configurar máx %, regalo mismo (con y sin tope), regalo otro (con producto y tope).
- Carrito (vendedor): aplicar descuento hasta el máx y verificar que no deja pasar; regalar
  unidades (mismo y otro) y ver el total y el stock descontado correcto.
- Verificar que no quedan referencias a cupos/`maxDiscount` (build marca los usos al quitar tipos).
