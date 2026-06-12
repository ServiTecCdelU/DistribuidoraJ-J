# Módulo Ventas — funcionamiento

Referencia rápida de `app/ventas/` (listado e historial de ventas ya emitidas).

## Archivos

- `app/ventas/page.tsx` — página fina; toda la lógica vive en `hooks/useVentas.ts`.
- `app/ventas/types.ts` — tipo `Venta` (extiende `Sale`). **Usar este en componentes de ventas.**
- `hooks/useVentas.ts` (~728 líneas) — carga, filtros, acciones (emitir doc, anular, etc.).
- `components/ModalDetalleVenta.tsx`, `components/ListaVentas.tsx` — UI del detalle/listado.

> Ojo tipos: hay un `Venta` en `app/ventas/types.ts` (el de los componentes) y otro distinto en
> `hooks/useVentas.ts` (con `afipData` y campos base64). No confundirlos.

## Qué hace

Lista las ventas (`ventas`) y los pedidos completados, con filtros por fecha, vendedor,
forma de pago (efectivo / transferencia / cuenta corriente / mixto) y método de entrega.
Permite ver el detalle, emitir/descargar documentos (boleta, remito, factura AFIP) y registrar pagos.

## Datos

- Tabla **`ventas`**: `payment_type` (`cash`/`credit`/`mixed`), `payment_method`
  (`efectivo`/`transferencia`), `efectivo_amount`, `transferencia_amount`, montos, cliente, vendedor,
  ítems, y campos de documento (remito/boleta/factura en base64 + número).
- También lee **`pedidos`** completados y **`clientes`** (para teléfono, saldo).

## Filtros (en `useVentas`)

`filtros.paymentFilter`: distingue efectivo vs transferencia mirando `paymentType==='cash'` +
`paymentMethod`. `deliveryFilter` por `deliveryMethod`. Filtro por vendedor vía `filterBySellerId`.

## Acciones típicas

- Ver detalle (`getSale` por id).
- Emitir factura AFIP / boleta / remito (ver módulo facturación, `lib/facturacion-helper.ts`).
- Registrar cobro / actualizar saldo del cliente (`clientes.current_balance`).

## Devoluciones (notas de crédito internas)

Desde `ModalDetalleVenta` (solo admin) → botón **Registrar devolución** → `ModalDevolucion`.
Se eligen productos y cantidades a devolver y, por producto, **Vuelve a stock** o **Pérdida**.

`services/devoluciones-service.ts` (`devolucionesApi`) → tabla **`devoluciones`**. Al confirmar:
1. **Stock**: ítems "stock" se reponen (`registrarMovimiento` tipo `ajuste`, +cantidad); "perdida" no.
2. **Cta cte**: baja `clientes.current_balance` por el monto + `transacciones` (`payment`, `cuenta minorista`,
   `[DEVOLUCION] #venta — ...`). Sin deuda previa queda saldo a favor.
3. **Comisión**: baja `vendedores.total_commission`/`total_sales`; la lista de comisiones la descuenta
   derivando las devoluciones como entradas negativas (`commissions-service.ts`).
4. **Recibo**: `generarReciboDevolucion` (en `useGenerarPdf.tsx`) → PDF doble copia, se descarga y se
   guarda en `devoluciones.recibo_pdf_base64` (descargable desde el detalle).

No emite Nota de Crédito AFIP (es interna). No modifica la venta original.

## Relación con otros módulos

- Las ventas se **crean** desde Nueva Venta (`ventas/nueva`) o al completar Pedidos. Ver
  `app/ventas/nueva/NUEVA-VENTA.md` y `app/pedidos/PEDIDOS.md`.
- La venta atómica (insertar venta + descontar stock + crédito + comisión) la hace la RPC
  `process_sale()` / `processSaleMayorista` en `services/sales-service.ts`.
