# Módulo Mayorista — funcionamiento

Referencia rápida de `app/mayorista/page.tsx` (~1601 líneas) + `services/mayorista-service.ts`.

## Qué hace

Gestión del catálogo y precios del mayorista (~7400 productos). Buscar, filtrar por rubro,
habilitar productos, editar y **actualizar precios masivamente** aplicando ganancia global.

## Datos

- Tabla **`mayorista_productos`** (separada de `productos`), con FK `producto_id`:
  `codigo`, `descripcion`, `precio_lista`, `rubro`, `subrubro`, `stock_local`, `unidades_por_bulto`, `se_divide_en`.
- Se hace JOIN con `productos` para `precio_venta`, `ganancia_global`, `stock`.
- IDs: `mayorista_productos.id` = `mp_<codigo>`, producto asociado = `prod_mp_<codigo>`.

## Servicios (`services/mayorista-service.ts`)

- `searchMayoristaProductos(params)` — búsqueda paginada (`MayoristaSearchParams`).
- `getMayoristaRubros()` — lista de rubros para filtro.
- `actualizarPreciosMayorista(rows)` — actualización masiva de precios.
- `editarProductoMayorista(producto, data)` — edición individual.
- `getMayoristaPrefs / saveMayoristaPrefs` — preferencias del usuario (ganancia por defecto, etc.).
- `upsertMayoristaProductos`, `invalidateMayoristaCache`.

## Ganancia global

- `precio_venta` se calcula aplicando `ganancia_global` (%) sobre `precio_lista`.
- Recálculo masivo vía RPC **`apply_ganancia_global`** (ruta `/api/apply-ganancia`).

## Stock mayorista

- Movimientos en `stock_movimientos`; el stock local del mayorista es `stock_local`.
- Se mueve siempre con `registrarMovimiento` (ver `app/productos/PRODUCTOS.md`).

## Cuenta corriente con el proveedor

- NO está en esta página. La deuda con el proveedor mayorista vive en
  `app/cuenta-corriente` (pestaña Mayorista) sobre la tabla `transacciones_mayorista`.

## Caveats

- Solo `admin`.
- La vista de mayorista es para **actualizar precios**; la edición completa de producto está
  parcialmente deshabilitada acá (se hace desde Productos).
