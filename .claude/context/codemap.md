# Codemap — Índice rápido del proyecto

> Propósito: ubicar archivos por área SIN leer todo el proyecto. Una línea por archivo.
> Si un área tiene doc detallado, está en `app/<modulo>/<MODULO>.md` — leerlo primero.

## Stack
Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind v4 · shadcn/ui (Radix) · Supabase · Vitest · Vercel.

---

## Capa de datos / fachada

| Archivo | Qué hace |
|---------|----------|
| `lib/api.ts` | **Fachada única**. Las pages importan de acá, NO de `services/`. |
| `lib/supabase.ts` | Client-side (anon key). |
| `lib/supabase-admin.ts` | Server-side (service role key). |
| `lib/types.ts` | Tipos compartidos del dominio. |
| `lib/api-auth.ts` | Auth en rutas API protegidas. |
| `lib/rate-limit.ts` | Rate limiting in-memory (se resetea en redeploy). |

## Services (acceso a tablas Supabase)

| Service | Tabla / dominio |
|---------|-----------------|
| `sales-service.ts` | `ventas` — RPC atómico `process_sale()`. |
| `orders-service.ts` | `pedidos` — workflow pending→completed. |
| `products-service.ts` / `stock-service.ts` | `productos`, `stock_movimientos`. |
| `clients-service.ts` | `clientes`. |
| `sellers-service.ts` / `users-service.ts` | `vendedores`, `usuarios`. |
| `commissions-service.ts` / `descuento-vendedor-service.ts` | `comisiones`, descuentos. |
| `cobranzas-service.ts` / `payments-service.ts` | cobranzas, cuenta corriente. |
| `mayorista-service.ts` / `pedidos-mayorista-service.ts` / `mayorista-cuenta-service.ts` | `mayorista_productos`, `pedidos_mayorista`. |
| `invoice-service.ts` / `pdf-service.ts` | facturación AFIP, PDFs. |
| `price-list-service.ts` | `listas_precios`. |
| `transfer-config-service.ts` | `configuracion` (key=`transferencia`). |
| `audit-service.ts` | `auditoria`. |
| `dashboard-service.ts` / `faltantes-service.ts` | KPIs, faltantes. |
| `supabase-helpers.ts` | `toDate()`, `slugify()`, `generateReadableId()`. |

## Hooks

| Hook | Uso |
|------|-----|
| `hooks/useCart.ts` | Lógica del carrito (núcleo de `UnifiedCart`). |
| `hooks/useVentas.ts` | Tipo `Venta` con `afipData` + base64. |
| `hooks/use-auth.ts` | Perfil/rol cacheado. `invalidateAuthCache()` tras cambio de rol. |
| `hooks/use-afip-invoice.ts` | Emisión AFIP. |
| `hooks/useGenerarPdf.tsx` | PDF client-side (`@ts-nocheck`). |
| `hooks/use-mobile.ts` / `use-toast.ts` | UI utils. |

## Utilidades

| Archivo | Uso |
|---------|-----|
| `lib/utils/format.ts` | `formatCurrency`, fechas. **Importar siempre de acá.** |
| `lib/utils/doc-actions.ts` | `descargarDocumento()`, `buildDocFilename()`. |
| `lib/utils/promo.ts` | Lógica de promos/descuentos. |
| `lib/facturacion-helper.ts` | Core facturación AFIP unificado. |
| `lib/afip-direct.ts` / `lib/bitingenieria.ts` | AFIP / Bit Ingeniería. |
| `lib/order-constants.ts` | Estados de pedidos. |
| `lib/inventory-history.ts` | Historial de inventario. |

---

## Áreas (pages + componentes + doc)

| Área | Page | Componentes clave | Doc |
|------|------|-------------------|-----|
| **Dashboard** | `app/dashboard/` | `components/dashboard/*` (morosidad, reposicion, rentabilidad, inactivos, resumen-dia) | `app/dashboard/DASHBOARD.md` |
| **Caja** | `app/caja/` | — | `app/caja/CAJA.md` |
| **Ventas** | `app/ventas/`, `app/ventas/nueva/` | `components/ListaVentas.tsx`, `ModalDetalleVenta.tsx`, `ModalEmitirDocumento.tsx` | `app/ventas/VENTAS.md`, `NUEVA-VENTA.md` |
| **Pedidos** | `app/pedidos/` | `components/pedidos/*` (order-card, order-detail-modal, orders-filters, payment-modal, route-map-*, stock-check-modal, success-modal) | `app/pedidos/PEDIDOS.md` |
| **Productos** | `app/productos/` | `components/productos/*` (product-modal, stock-history-modal, remito-import-modal, RecepcionMercaderia, vistaProductosTienda) | `app/productos/PRODUCTOS.md` |
| **Clientes** | `app/clientes/`, `[id]/` | `components/clientes/client-modal.tsx` | `app/clientes/CLIENTES.md` |
| **Mayorista** | `app/mayorista/` | `components/pedidos/PedidoMayoristaTab.tsx`, `VentasMayoristaTab.tsx` | `app/mayorista/MAYORISTA.md` |
| **Gastos** | `app/gastos/` | `components/gastos/gasto-fijo-modal.tsx`, `gasto-variable-modal.tsx` | `app/gastos/GASTOS.md` |
| **Comisiones** | `app/comisiones/` | — | `app/comisiones/COMISIONES.md` |
| **Cobranzas** | `app/cobranzas/` | — | `app/cobranzas/COBRANZAS.md` |
| **Cuenta cte.** | `app/cuenta-corriente/` | — | `app/cuenta-corriente/CUENTA-CORRIENTE.md` |
| **Carrito** | (transversal) | `components/cart/UnifiedCart.tsx`, `map-pin-picker.tsx` | — |
| **Documentos** | (transversal) | `components/documentos/*` (boleta/remito + modales) | — |
| **Tienda** | `app/tienda/` | `components/tienda/hero-carousel.tsx`, `top-products.tsx` | — |
| **Vendedor mobile** | `app/vendedor/` | usa `UnifiedCart` inline | — |
| Otras | `app/empleados`, `vendedores`, `comisiones`, `dashboard`, `reportes`, `auditoria`, `descuentos`, `listas-precios`, `transporte`, `mis-pedidos`, `login` | — | — |

## Layout
`components/layout/main-layout.tsx` (envuelve páginas autenticadas) + `app-sidebar.tsx` (filtra nav por rol) + `route-loader.tsx`.

## API Routes
- Públicas (sin auth): `app/api/public/*` (clientes, productos, pedidos, mas-vendidos, vendedores).
- Protegidas: `facturacion/`, `ventas/emitir`, `afip/`, `generate-pdf`, `import-productos`, `remitos/`, `parse-remito/`, `drive/`, `apply-ganancia` (RPC `apply_ganancia_global`).

## Routing por rol (`app/page.tsx`)
- `admin` → `/caja`
- `seller` + `transportista` → `/pedidos`
- `seller` + `vendedor`/`ambos` → `/comisiones`
