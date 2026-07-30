# Módulo Cuenta Corriente — funcionamiento

Referencia rápida de `app/cuenta-corriente/page.tsx` (~1335 líneas).

## Qué hace

Dos cuentas en una página, con tabs **Clientes** y **Mayorista**:

1. **Clientes** (lo que los clientes nos deben): deudores, comprobantes de pago a aprobar/rechazar,
   registro de pagos manuales, clasificación de deuda.
2. **Mayorista** (lo que le debemos al proveedor): deudas (boletas) y pagos a esas boletas.

## Saldo por remito (desde 2026-06-12)

Cada deuda en `transacciones` (una por venta/remito, gracias a 1 pedido = 1 remito = 1 venta)
lleva su **saldo pendiente individual** (columna `saldo`):

- Trigger `trg_set_debt_saldo`: toda deuda nueva arranca con `saldo = amount` (cubre `process_sale`).
- SQL de columnas + backfill FIFO en `scripts/sql/saldo-por-remito.sql` (**ejecutar antes de usar**).
- Pagos (`payments-service.ts`): con `debtTxId` se imputan a ese remito puntual (baja su saldo);
  sin `debtTxId` aplican FIFO (deuda más antigua primero). El pago guarda `debt_id`.
- `approveComprobante` también baja saldos FIFO.
- UI detalle de cliente: cada deuda muestra "Saldo: $X" / "Pagado" debajo del monto
  (`MovimientoDeudaCard`), y el diálogo "Registrar pago" tiene selector **Imputar a**
  (remito específico o pago general FIFO).

## Cuenta de Clientes

- Lista deudores (`cobranzasApi.getDebtClients`) con filtros por vendedor, clasificación y búsqueda.
- Comprobantes de pago (`cobranzasApi.getComprobantes`): `approveComprobante` (registra el pago y
  baja la deuda) / `rejectComprobante`.
- Detalle por cliente: separa **cuenta minorista** (`current_balance`) y **cuenta mayorista del
  cliente** (`current_balance_mayorista`), cada una con sus movimientos (`transacciones`, campo `cuenta`).
- Pagos manuales: `paymentsApi.registerCashPayment` (minorista) / `registerMayoristaPayment` (mayorista).

## Deuda anterior (botón "Registrar deuda", rojo — solo admin)

Ventas viejas que quedaron pendientes y nunca pasaron por el sistema. Cargan **solo la deuda**:
sin productos, sin stock, sin comisión, sin remito.

- `paymentsApi.registerDeudaAnterior({ clientId, amount, date, notes, file })`
  (`services/payments-service.ts`) inserta una `transaccion` `type: 'debt'`, `cuenta: 'minorista'`,
  `saldo = amount`, fecha de la venta original (mediodía local) y suma al `current_balance`.
- Descripción marcada con el tag `[DEUDA_ANT]` (helpers puros en `lib/utils/deuda-anterior.ts`).
  En la tabla de movimientos el concepto se muestra como **DEUDA ANT.**, la Descripción es el
  comentario, Incidencias queda vacío, y Debe/Haber/Saldo funcionan como cualquier boleta.
- Foto de la factura (opcional) → bucket `comprobantes`, prefijo `deudas-anteriores/<clientId>/`,
  URL en la columna `foto_url` de `transacciones` (`ALTER TABLE transacciones ADD COLUMN IF NOT
  EXISTS foto_url text;`). Se ve con el botón "Foto" en la fila.
- Al tener `saldo > 0` aparece en el selector **Imputar a** de "Registrar pago", así que se le
  puede pagar puntualmente. Se ordena por su fecha como el resto de los movimientos.

## Cuenta con el Mayorista (proveedor) — tabla `transacciones_mayorista`

Servicio: `services/mayorista-cuenta-service.ts` (API: `mayoristaCuentaApi`).

El proveedor tiene **dos cuentas que se pagan por separado**: Distribución 1 y 2 (columna
`distribucion smallint`, valores 1/2). La tab Mayorista tiene **sub-pestañas** por distribución;
cada una con su balance, sus boletas y sus pagos independientes.

- `getTransacciones(distribucion?)` — movimientos (`type: 'debt' | 'payment'`), filtrables por cuenta.
- `addDeuda({ amount, distribucion, description?, boleta?, date? })` — **Registrar deuda** (botón).
  Carga en la sub-pestaña activa. La boleta se guarda en `description` como `Boleta <nro>`;
  `date` admite `YYYY-MM-DD` (mediodía local para evitar desfase).
- `pagarBoleta({ debtId, amount, description? })` — paga una boleta puntual y baja su `saldo`.
  El pago **hereda la distribución de la boleta**.
- `eliminar(id)` (`deleteTransaccionMayorista`) — borra un movimiento cargado por error (botón papelera
  en la tabla). Una **deuda** solo se borra si no tiene pagos aplicados (saldo intacto), para no dejar
  pagos huérfanos; un **pago** restaura el `saldo` de la boleta a la que se había imputado. El balance
  se recalcula solo (Σ deudas − Σ pagos). Confirmación con diálogo.
- `addPago({ amount, distribucion, description? })` — pago genérico (legacy).
- Balance = Σ deudas − Σ pagos, **por distribución**.
- Import de remito (`RemitoImportModal`) detecta la distribución del destinatario
  (`J & J DISTRIBUCIONES 1/2`) y carga la deuda en la cuenta correcta.

> La deuda mayorista también se carga **automáticamente** al importar un remito de proveedor
> desde Productos (`RemitoImportModal` → `addDeuda`). Si esa carga falla (ej. PDF sin texto), se
> usa el botón **Registrar deuda** manual (fecha, monto, boleta).

## Caveats

- Solo `admin`.
- Estructura de movimientos: cada `transaccion` de cliente lleva `cuenta` (`minorista`/`mayorista`).
- La deuda con el proveedor (`transacciones_mayorista`) es **independiente** de la deuda mayorista
  de cada cliente (`current_balance_mayorista`). No mezclar.
