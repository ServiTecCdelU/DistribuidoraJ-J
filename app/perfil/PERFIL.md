# Perfil (suscripción del sistema)

Sección solo admin (`/perfil`) con los datos de la distribuidora, el plan contratado y el
historial de pagos del abono mensual del sistema. Pensada para integrarse con el sistema de
control externo de ServiTec.

## Tablas

- `suscripcion` — fila única (`id = 'default'`): datos de la distribuidora + plan
  (`plan`, `monto_mensual`, `moneda`, `sucursales`, `dia_vencimiento`, `fecha_inicio`, `estado`).
- `suscripcion_pagos` — un registro por período (`periodo` `YYYY-MM`, único), con
  `monto`, `fecha_pago`, `metodo`, `comprobante`, `estado` (`pagado` | `pendiente`), `notas`.

## Lógica

`lib/utils/suscripcion.ts` (pura, testeada en `suscripcion.test.ts`):

- Se factura un mes por cada período entre `fecha_inicio` y el mes actual, ambos inclusive.
- Monto por período = `monto_mensual × max(1, sucursales)`.
- Un período con pago en estado `pendiente` cuenta como adeudado.
- `resumirSuscripcion()` devuelve meses pagados/adeudados, deuda, último pago,
  próximo vencimiento y si está al día.

## Integración externa

`GET|POST /api/suscripcion/estado`, autenticada con `SUSCRIPCION_API_KEY`
(`Authorization: Bearer <key>` o header `x-api-key`).

- `GET` → `{ cliente, plan, cuenta (resumen), pagos }`.
- `POST` `{ periodo, monto, fechaPago?, metodo?, comprobante?, estado?, notas? }` →
  registra/actualiza el pago del período (upsert por `periodo`) y devuelve la cuenta recalculada.

No expone datos de clientes ni ventas: solo el estado de la suscripción.
