# Módulo Comisiones — funcionamiento

Referencia rápida de `app/comisiones/page.tsx` (~222 líneas).

## Qué hace

Vista del **vendedor**: resumen y detalle de sus comisiones (total, pendiente, pagado, % promedio)
y la tabla de cada comisión por venta.

## Datos

- `getCommissionsBySeller(sellerId)` de `services/commissions-service.ts` → `SellerCommission[]`
  (`commissionAmount`, `commissionRate`, `isPaid`, fecha, venta asociada).
- La comisión se genera **automáticamente al concretar la venta** (RPC `process_sale()` /
  `processSaleMayorista`), no se carga a mano.
- Los pagos de comisiones (cuando se le paga al vendedor) se registran en `pagos_comisiones`
  y restan del efectivo esperado en Caja (ver `app/caja/CAJA.md`).

## Roles

- `admin` y `seller`. El vendedor ve solo las suyas (`user.sellerId`).
- La administración de vendedores y tasas de comisión está en `app/vendedores` / `app/empleados`
  (ver memoria `ref_empleados`).

## Routing

- Un `seller` tipo `vendedor`/`ambos` aterriza en `/comisiones` al entrar (ver `app/page.tsx`).
