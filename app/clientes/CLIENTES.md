# Módulo Clientes — funcionamiento

Referencia rápida de `app/clientes/page.tsx` (~873 líneas) + `app/clientes/[id]/page.tsx` (detalle).

## Qué hace

ABM de clientes y centro de su cuenta corriente. Lista, busca, crea y edita clientes; muestra
saldos (minorista y mayorista), límite de crédito, clasificación de deuda y categoría fiscal.

## Datos (tabla `clientes`)

- Identidad: `name`, `dni`, `cuit`, `phone`, `email`, `address`, `lat/lng`, `city`.
- **Fiscal**: `tax_category` (`consumidor_final`, `responsable_inscripto`, `monotributo`, etc.) →
  determina qué factura AFIP se emite (A/B/C). En código: `taxCategory`, también `categoria`.
- **Cuenta corriente**:
  - `current_balance` (`currentBalance`) — deuda **minorista**.
  - `current_balance_mayorista` (`currentBalanceMayorista`) — deuda **mayorista**.
  - `credit_limit` (`creditLimit`) — tope de crédito.
  - `debt_classification` (`debtClassification`): `normal` | `moroso` | `incobrable`.
- Vendedor asignado: `seller_id`.

## API (vía `lib/api` → `clientsApi`)

- `clientsApi.getAll()`, `create(data)`, `update(id, changes)`.
- `clientsApi.getTransactions(clientId)` — movimientos de cuenta corriente (tabla `transacciones`),
  cada uno con `cuenta: 'minorista' | 'mayorista'`.

## Relación con otros módulos

- **Cuenta Corriente** (`app/cuenta-corriente`) consume estos saldos y registra pagos/comprobantes.
- **Cobranzas** (`app/cobranzas`) — el vendedor sube comprobantes de pago del cliente.
- El saldo sube al vender a crédito (Nueva Venta / Pedidos con `paymentType` `credit`/`mixed`) y
  baja al registrar pagos o aprobar comprobantes.

## Caveats

- IDs legibles: `cliente_<slug>_<n>`. Clientes legacy pueden tener otro id; lookup dual.
- La clasificación de deuda solo afecta colores/badges y filtros, no bloquea ventas por sí sola.
