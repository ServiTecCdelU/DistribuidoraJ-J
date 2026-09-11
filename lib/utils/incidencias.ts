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

export interface VentaConIncidencias {
  itemsNoEntregados?: ItemNoEntregado[] | null
}

export interface IncidenciasAgregadas {
  /** Solo rotura: mercadería que no vuelve al depósito. */
  perdida: number
  /** Error de carga: la mercadería sigue en stock. No es plata perdida. */
  faltante: number
  /** El cliente lo devolvió en el reparto. */
  rechazo: number
  total: number
  /** Cantidad de ventas con alguna incidencia. */
  count: number
}

/**
 * Suma las incidencias de un conjunto de ventas, con los tres motivos separados.
 * La caja los mostraba fusionados (rotura + faltante bajo "pérdida"), lo que hacía
 * parecer perdido lo que en realidad volvió al depósito.
 */
export function incidenciasDeVentas(ventas: VentaConIncidencias[]): IncidenciasAgregadas {
  let perdida = 0
  let faltante = 0
  let rechazo = 0
  let count = 0

  for (const v of ventas) {
    const items = v?.itemsNoEntregados
    if (!items || items.length === 0) continue
    const s = splitIncidencias(items)
    perdida += s.rotura
    faltante += s.faltante
    rechazo += s.rechazo
    count++
  }

  return { perdida, faltante, rechazo, total: perdida + faltante + rechazo, count }
}
