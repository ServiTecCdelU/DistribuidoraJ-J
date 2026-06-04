// Promo "cada X comprados, +1 de regalo".
// regaloCada = unidades que el cliente debe comprar para sumar 1 unidad gratis.
// El cliente paga la cantidad pedida y se lleva (pedida + regalo). El stock
// descuenta el total entregado (pedida + regalo). El precio no cambia.

/**
 * Unidades de regalo segun la cantidad comprada.
 * Ej: regaloCada=10, quantity=10 -> 1 ; quantity=25 -> 2.
 */
export function unidadesRegalo(quantity: number, regaloCada?: number | null): number {
  if (!regaloCada || regaloCada <= 0 || quantity <= 0) return 0;
  return Math.floor(quantity / regaloCada);
}

/**
 * Maxima cantidad pagable tal que (pagada + regalo) no supere el stock.
 * Sin promo devuelve el stock tal cual.
 */
export function maxQtyPagable(stock: number, regaloCada?: number | null): number {
  if (stock <= 0) return 0;
  if (!regaloCada || regaloCada <= 0) return stock;
  let q = stock;
  while (q > 0 && q + Math.floor(q / regaloCada) > stock) q--;
  return q;
}
