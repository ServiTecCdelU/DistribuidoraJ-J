/** Helpers puros de la nota de crédito manual (sin venta asociada). */

export interface ItemNotaCredito {
  price: number
  quantity: number
}

export const totalItemsNotaCredito = (items: ItemNotaCredito[]): number =>
  items.reduce((acc, i) => acc + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0)

/** Monto de un descuento: porcentaje (0-100) sobre un importe base, redondeado a centavos. */
export const montoDescuento = (base: number, porcentaje: number): number => {
  const b = Number(base) || 0
  const p = Math.min(100, Math.max(0, Number(porcentaje) || 0))
  return Math.round(b * p) / 100
}
