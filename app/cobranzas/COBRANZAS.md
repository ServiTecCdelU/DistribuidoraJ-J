# Módulo Cobranzas — funcionamiento

Referencia rápida de `app/cobranzas/page.tsx` (~381 líneas).

## Qué hace

Vista del **vendedor** en la calle: ve sus clientes con deuda y **sube comprobantes de pago**
(foto de transferencia/recibo) para que el admin los apruebe en Cuenta Corriente.

## API (`cobranzasApi`, vía `lib/api` → `services/cobranzas-service.ts`)

- `getClientsBySeller(sellerId)` — clientes del vendedor con su deuda.
- `getComprobantesBySeller(sellerId)` — comprobantes que subió.
- `uploadComprobante({ clientId, amount, file, notes })` — sube el comprobante (queda `pending`).

## Flujo completo

1. Vendedor sube comprobante acá → estado `pending` (archivo a Supabase Storage).
2. Admin lo ve en **Cuenta Corriente → Clientes**, y `approveComprobante` (registra el pago y baja
   la deuda) o `rejectComprobante`.

## Roles

- `seller` (y admin). El admin aprueba/rechaza desde `app/cuenta-corriente`
  (ver `app/cuenta-corriente/CUENTA-CORRIENTE.md`).
