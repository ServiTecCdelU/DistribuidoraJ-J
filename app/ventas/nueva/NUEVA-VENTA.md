# Módulo Nueva Venta — funcionamiento

Referencia rápida de `app/ventas/nueva/page.tsx` + `hooks/useCart.ts` (~1171 líneas, el corazón).

## Archivos

- `app/ventas/nueva/page.tsx` — buscador de productos + `UnifiedCart`.
- `hooks/useCart.ts` — TODA la lógica del carrito y la confirmación de venta.
- `components/cart/UnifiedCart.tsx` — carrito único que se adapta por rol (`admin`/`seller`/`null`).
- `services/sales-service.ts` — `processSaleMayorista` (venta atómica), `crearPedidoMayorista`.

## El carrito (`useCart(role, userEmail, externalProducts)`)

Estado: `cart`, `paymentType` (`cash`/`credit`/`mixed`), `paymentMethod` (`efectivo`/`transferencia`),
`deliveryMethod` (`delivery`/`pickup`), cliente/vendedor seleccionados, descuentos, dirección/mapa.

`finalTotal` = ítems − descuento por ítem (`itemDiscount` %) − descuento global (`discount` /
`discountType`). Tope de descuento según perfil del vendedor.

## Confirmar venta — `actions.processSale(modo?)`

Devuelve `"order"`, `"sale"` o `null`. Ramas según rol y entrega:

1. **Rol `null` (cliente público)** → POST `/api/public/pedidos` (server-side). Siempre crea **pedido**.
2. **delivery (admin/seller)** → `ordersApi.createOrder(status: "pending")`. Crea **pedido** (va a Pedidos).
3. **pickup (retiro en local)**:
   - Si falta stock y `modo === "esperar"` → crea **pedido** + **pedido al mayorista automático**
     (`crearPedidoMayorista` con los ítems en déficit) y descuenta cupo de oferta del vendedor.
   - Si hay stock (o `modo === "disponible"`) → **venta atómica** `processSaleMayorista(...)` → devuelve `"sale"`.

`modo` viene del botón: `"esperar"` (esperar reposición) vs `"disponible"` (vender lo que hay).

## Pago

- `cash`: `cashAmount` (puede haber `overpayment` = vuelto si paga de más).
- `credit`: todo a cuenta corriente del cliente (requiere cliente).
- `mixed`: parte efectivo (`cashAmount`) + parte cuenta corriente (`creditAmountInput`).

## Stock y ofertas

- El stock relevante es `product.stockLocal`. Tras vender, alerta si quedan ≤3 unidades.
- `descontarOfertasVendidas()` descuenta el cupo de oferta por vendedor (tabla `descuento_vendedor`)
  para los ítems con `adminDiscount`.

## Caveats

- Para clientes públicos no se toca Firestore/Supabase directo: se usa la API server-side.
- El `productId` mayorista es `mp_XXXX`; el producto con stock es `prod_mp_XXXX`.
- Ver carrito compartido y mapa en la memoria `ref_carrito`.
