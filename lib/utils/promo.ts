// Promo "cada X comprados, +N de regalo".
// regaloCada     = unidades que el cliente debe comprar para activar el regalo.
// regaloCantidad = cuántas unidades gratis entran por cada bloque de X (default 1).
// El cliente paga la cantidad pedida y se lleva (pedida + regalo). El stock
// descuenta el total entregado (pedida + regalo). El precio no cambia.

/** Unidades gratis por cada bloque comprado (mínimo 1, default 1). */
function porBloque(regaloCantidad?: number | null): number {
  if (!regaloCantidad || regaloCantidad <= 0) return 1;
  return Math.floor(regaloCantidad);
}

/**
 * Unidades de regalo segun la cantidad comprada.
 * Ej: regaloCada=10, regaloCantidad=2, quantity=10 -> 2 ; quantity=25 -> 4.
 */
export function unidadesRegalo(
  quantity: number,
  regaloCada?: number | null,
  regaloCantidad?: number | null,
): number {
  if (!regaloCada || regaloCada <= 0 || quantity <= 0) return 0;
  return Math.floor(quantity / regaloCada) * porBloque(regaloCantidad);
}

/**
 * Maxima cantidad pagable tal que (pagada + regalo) no supere el stock.
 * Sin promo devuelve el stock tal cual.
 */
export function maxQtyPagable(
  stock: number,
  regaloCada?: number | null,
  regaloCantidad?: number | null,
): number {
  if (stock <= 0) return 0;
  if (!regaloCada || regaloCada <= 0) return stock;
  let q = stock;
  while (q > 0 && q + unidadesRegalo(q, regaloCada, regaloCantidad) > stock) q--;
  return q;
}
