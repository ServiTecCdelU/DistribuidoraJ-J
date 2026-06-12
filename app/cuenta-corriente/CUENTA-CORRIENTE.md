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
