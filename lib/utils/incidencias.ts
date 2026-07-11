// Cálculo de incidencias de una venta a partir de sus items no entregados.
// Cada item tiene un `motivo`: 'rotura' | 'faltante' | 'no_quiso' (o sin motivo = rotura).
// - rotura  → pérdida real (mercadería rota, no vuelve al stock)
// - faltante→ error de carga (estaba en stock, no se envió)
// - no_quiso→ el cliente lo rechazó en el reparto (devolución)

export interface ItemNoEntregado {
  price?: number
  itemDiscount?: number
  quantity?: number
  motivo?: 'rotura' | 'faltante' | 'no_quiso' | string
}

export interface IncidenciasSplit {
  rotura: number
  faltante: number
  rechazo: number
}

const montoItem = (i: ItemNoEntregado): number =>
  (i.price || 0) * (1 - (i.itemDiscount || 0) / 100) * (i.quantity || 0)

/**
 * Suma el monto de los items no entregados agrupados por motivo.
 * Un item sin motivo (o con motivo desconocido) se cuenta como rotura.
 */
export function splitIncidencias(items: ItemNoEntregado[] | undefined | null): IncidenciasSplit {
  const res: IncidenciasSplit = { rotura: 0, faltante: 0, rechazo: 0 }
  for (const i of items ?? []) {
    const m = montoItem(i)
    if (i.motivo === 'no_quiso') res.rechazo += m
    else if (i.motivo === 'faltante') res.faltante += m
    else res.rotura += m
  }
  return res
}

/** Vista para Ventas: pérdida (solo rotura), faltante y rechazo por separado. */
export function incidenciasVenta(items: ItemNoEntregado[] | undefined | null): {
  perdida: number
  faltante: number
  rechazo: number
} {
  const { rotura, faltante, rechazo } = splitIncidencias(items)
  return { perdida: rotura, faltante, rechazo }
}

/** Vista para Caja de reparto: pérdida (rotura + faltante) y devolución (rechazo). */
export function incidenciasCaja(items: ItemNoEntregado[] | undefined | null): {
  perdida: number
  devolucion: number
} {
  const { rotura, faltante, rechazo } = splitIncidencias(items)
  return { perdida: rotura + faltante, devolucion: rechazo }
}
