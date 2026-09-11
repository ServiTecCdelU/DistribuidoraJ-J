// Identidad de un renglón del pedido.
//
// Las ediciones (cantidad, descuento, reemplazo, exclusión) se indexaban por productId. Eso
// alcanza mientras haya un renglón por producto, pero consolidarItems() deja a propósito
// separados los renglones del mismo producto a distinto precio o descuento: fusionarlos
// cambiaría lo que se le cobra al cliente. Para esos, editar por productId afectaba a los dos.
//
// La clave usa producto + precio + descuento, que es exactamente el criterio con el que
// consolidarItems() decide qué fusionar. Así dos renglones que sobreviven a la consolidación
// tienen siempre claves distintas, y uno consolidado tiene una sola.

// Sin index signature: así lo cumple cualquier objeto que tenga estos campos, incluidos
// StockCheckItem y los items del pedido, sin necesidad de castear.
export interface LineaIdentificable {
  productId: string
  price?: number | null
  itemDiscount?: number | null
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Clave estable de un renglón. Misma clave = mismo renglón. */
export function claveLinea(item: LineaIdentificable): string {
  return `${item.productId}|${num(item.price)}|${num(item.itemDiscount)}`
}

/** Claves de una lista de renglones, en orden. */
export function clavesDeLineas(items: LineaIdentificable[]): string[] {
  return items.map(claveLinea)
}
