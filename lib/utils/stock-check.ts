// Stock disponible por renglón al verificar un pedido antes de armar el remito.
//
// El stock vive por producto, pero un pedido puede tener el mismo producto en más de un
// renglón (distinto precio o distinto descuento; ver items-pedido.ts). Comparar cada renglón
// contra el stock total infla la disponibilidad: dos renglones de 10 contra un stock de 15
// daban "alcanza" las dos veces, cuando en total faltan 5.

export interface ItemConStock {
  productId: string
  quantity?: number | null
  [key: string]: unknown
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Asigna a cada renglón el stock que queda disponible para él, descontando lo que ya
 * comprometieron los renglones anteriores del mismo producto. Nunca devuelve negativos.
 */
export function repartirStockDisponible<T extends ItemConStock>(
  items: T[],
  stockPorProducto: Map<string, number>,
): (T & { stock: number })[] {
  const comprometido = new Map<string, number>()

  return items.map((item) => {
    const total = stockPorProducto.get(item.productId) ?? 0
    const yaTomado = comprometido.get(item.productId) ?? 0
    const disponible = Math.max(0, total - yaTomado)
    comprometido.set(item.productId, yaTomado + num(item.quantity))
    return { ...item, stock: disponible }
  })
}
