# Módulo Caja — funcionamiento

Referencia rápida de `app/caja/page.tsx` (~1710 líneas, todo en un archivo).

## Qué hace

Caja diaria de reparto: abrir/cerrar caja, ver el movimiento del día (ventas, pagos de
comisiones, pérdidas), calcular el efectivo esperado y dejar registrado el cierre con PDF.

## Tabla y datos

- Tabla **`caja`** (una fila por apertura): `opened_at`, `closed_at`, `opened_by`, `closed_by`,
  `initial_amount`, `final_amount`, `expected_amount`, `difference`, `status` (`open`/`closed`), `notes`.
- Lee también **`ventas`** (del día), **`transacciones`** (pérdidas por rotura) y
  **`pagos_comisiones`** (comisiones pagadas en efectivo que salen de la caja).
- `mapRegister(row)` convierte la fila snake_case a `CashRegister` (camelCase).

## Horario fijo 06:00–23:00 (apertura/cierre automático)

`reconciliarCajaHorario()` (corre en `doLoad`, al abrir la página) mantiene la caja en un
horario fijo, sin apertura/cierre manual:
- **Cierra** automáticamente toda caja abierta cuyo cierre programado (23:00 de su día) ya pasó.
  El cierre usa `final = esperado` (no hay conteo físico; se controla por el PDF del historial),
  `closed_by = "Cierre automático"`, `closed_at = 23:00` de ese día.
- **Abre** una caja nueva (`opened_at = 06:00`, `initial_amount = 0`, `opened_by = "Apertura automática"`)
  si estamos dentro del horario y no hay caja del día.
- Fuera de horario (23:00–06:00) no hay caja activa.

El cierre/apertura se **aplican cuando se abre la página de caja** (lógica cliente). Los timestamps
quedan en 23:00 / 06:00 aunque la reconciliación corra más tarde. `loadData` (refresh tras acciones)
NO reconcilia, para que un cierre manual no se reabra solo. Apertura/cierre manual siguen disponibles.

## Solo ventas con remito

Caja toma **únicamente las ventas con `remitoNumber`** (en `loadData`, carga del día e historial).
Una venta sin remito es un cobro duplicado/incompleto (vale el remito) y no debe sumar al efectivo.
Esto neutraliza los duplicados que genera el doble cobro de un mismo pedido.

## Cálculo central

```
expectedCash = initialAmount + efectivoTotal - comisionesTotal
```
(Inicial + lo cobrado en efectivo del día − comisiones pagadas en efectivo.)

`todayStats` agrega del día: `efectivoTotal`, `transferTotal`, `cashTotal`, `creditTotal`,
`total`, `count`, `lossTotal/lossCount` (roturas), `comisionesTotal/Count`.

> Las transferencias y la cuenta corriente NO suman al efectivo esperado en caja; solo el efectivo.

## Acciones

- `handleOpenRegister` → `INSERT` en `caja` con `initial_amount` y `status='open'`.
- `handleCloseRegister` → `UPDATE` con `final_amount` (contado), `expected_amount`, `difference`
  (`final - expected`) y `status='closed'`.
- `handleDownloadPdf` / `handleDownloadHistorialPdf` → genera PDF del cierre con
  `@react-pdf/renderer` (estilos `cajaPdfStyles`).

## Vistas

- **Tabs**: caja del día (abierta) + historial (cajas cerradas, con buscador por fecha vía `Calendar`/`Popover`).
- Resumen del día: venta total, efectivo, transferencia, cta. corriente, comisiones (en naranja, restan), pérdidas.

## Caveats

- Solo `admin` (la página vive bajo `MainLayout allowedRoles={['admin']}`).
- El efectivo esperado depende de que las comisiones pagadas estén en `pagos_comisiones` del día.
- IDs legibles vía `generateReadableId`.
