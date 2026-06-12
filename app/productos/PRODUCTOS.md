# Módulo Productos — funcionamiento

Referencia rápida de `app/productos/page.tsx` (~2294 líneas — el módulo más grande).

## Qué hace

Inventario: listar/buscar productos, alta/edición, ajustes de stock, historial de movimientos,
e importación de remito del proveedor (que carga stock + deuda mayorista de un saque).

## Datos

- Tabla **`productos`**: `name`, `price`, `stock`, `category` (= rubro del listado mayorista),
  `precio_venta`, `ganancia_global`, `ganancia_individual`, `unidades_por_bulto`, `se_divide_en`,
  `codigo`, `image_url`.
- Tabla **`stock_movimientos`**: historial de cada cambio de stock (entrada, salida, rotura, ajuste).
- Mayorista en tabla aparte `mayorista_productos` (ver `app/mayorista/MAYORISTA.md`).

## Componentes y servicios

- `components/productos/product-modal.tsx` (`ProductModal`) — alta/edición.
- `components/productos/remito-import-modal.tsx` (`RemitoImportModal`) — **importar remito proveedor**.
- `components/productos/RecepcionMercaderia.tsx` — recepción de mercadería.
- `services/stock-service.ts` → `registrarMovimiento(...)` — **única vía** para mover stock
  (descuenta/incrementa `productos.stock` y `mayorista_productos.stock_local` y registra el movimiento).
- `productsApi.search/create/update` (vía `lib/api`).

## Importar Remito Proveedor (`RemitoImportModal`)

1. Lee el PDF con `pdfjs` y extrae la **capa de texto** (no hace OCR).
2. `parseRemitoText` interpreta líneas (formato factura León o remito clásico) → código, nombre,
   cantidad, precio.
3. Cruza códigos contra `mayorista_productos` (por `codigo`) para mapear a producto y precio lista.
4. Permite revisar/ajustar/reemplazar y confirma: suma stock y, si hay total, **registra deuda en
   cuenta mayorista** (`mayoristaCuentaApi.addDeuda`).

> ⚠ Si el PDF es una **foto/escaneo** (imagen sin texto), no extrae nada → no toma productos.
> Solo funciona con PDFs digitales con texto seleccionable.

## Caveats

- `registrarMovimiento` ya descuenta stock: NO restar stock por separado (causa doble descuento).
- IDs: `productos.id` = `prod_mp_<codigo>`, `mayorista_productos.id` = `mp_<codigo>`.
- Carga inicial de productos desde Excel: `scripts/habilitar-desde-excel.js` (ver CLAUDE.md).
