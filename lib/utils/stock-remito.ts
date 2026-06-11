// Lógica pura del movimiento de stock asociado a los remitos de pedidos.
// El stock se descuenta al GENERAR el remito (la mercadería sale del depósito), no al cobrar.
// Estas funciones deciden QUÉ mover; el caller (app/pedidos/page.tsx) ejecuta los movimientos.

export interface ItemRemito {
  productId?: string
  quantity?: number
  regalo?: number
}

export type TipoAjusteCobro = 'rotura' | 'faltante' | 'no_quiere'

export interface AjusteCobro {
  productId: string
  type: TipoAjusteCobro
  quantity: number
}

// cantidad < 0 = salida (descuento) · cantidad > 0 = entrada (reposición)
export interface MovStock {
  productId: string
  cantidad: number
}

const salidaItem = (item: ItemRemito): number =>
  (Number(item.quantity) || 0) + (Number(item.regalo) || 0)

/**
 * Salidas de stock al generar el remito: descuenta quantity (+ regalo si lo tuviera) de cada item.
 * Devuelve movimientos con cantidad negativa. Omite items sin productId o sin cantidad.
 */
export function salidasRemito(items: ItemRemito[]): MovStock[] {
  return items
    .filter((i) => i.productId && salidaItem(i) > 0)
    .map((i) => ({ productId: i.productId as string, cantidad: -salidaItem(i) }))
}

/**
 * Reposición de stock al eliminar un remito: devuelve al stock lo que se había descontado.
 * Solo repone si el pedido tenía el stock descontado. Movimientos con cantidad positiva.
 */
export function reposicionEliminarRemito(
  stockDescontado: boolean,
  items: ItemRemito[],
): MovStock[] {
  if (!stockDescontado) return []
  return items
    .filter((i) => i.productId && salidaItem(i) > 0)
    .map((i) => ({ productId: i.productId as string, cantidad: salidaItem(i) }))
}

/**
 * Reconciliación de stock al cobrar el pedido, según los ajustes registrados.
 *
 * - Si el stock YA se descontó (remito generado): la mercadería salió completa.
 *   · faltante (no se cargó, vuelve al depósito) y no_quiere (devuelto) → REPONER (entrada).
 *   · rotura → pérdida real, ya descontada en el remito → no se toca el stock.
 *
 * - Si el stock NO se descontó (pedido cobrado sin remito previo, legacy): processSale
 *   descuenta lo vendido; acá solo se descuenta la rotura (salida).
 *   · faltante / no_quiere → siguen en stock, no se tocan.
 */
export function reconciliarCobro(
  stockDescontado: boolean,
  ajustes: AjusteCobro[],
): MovStock[] {
  if (stockDescontado) {
    return ajustes
      .filter((a) => (a.type === 'faltante' || a.type === 'no_quiere') && a.quantity > 0)
      .map((a) => ({ productId: a.productId, cantidad: a.quantity }))
  }
  return ajustes
    .filter((a) => a.type === 'rotura' && a.quantity > 0)
    .map((a) => ({ productId: a.productId, cantidad: -a.quantity }))
}
