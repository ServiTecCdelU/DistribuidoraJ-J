// Resumen de comisiones a partir de la lista de SellerCommission.
// FUENTE ÚNICA de los totales que ve el vendedor (app/comisiones) y el admin
// (app/empleados). Las devoluciones vienen como entradas con commissionAmount < 0,
// por eso "finales" (neto) = brutas − devoluciones.

export interface ComisionLike {
  commissionAmount: number
  isPaid?: boolean
  /** Parte cubierta por los pagos (imputación FIFO). Si falta, se deduce de isPaid. */
  montoImputado?: number
}

export interface ResumenComisiones {
  brutas: number          // suma de comisiones de ventas (commissionAmount >= 0)
  devoluciones: number    // magnitud (positiva) de las devoluciones
  finales: number         // neto = brutas − devoluciones = Σ commissionAmount
  pendiente: number       // neto no pagado
  cobrado: number         // neto pagado
  ventasCount: number
  devolucionesCount: number
  pendienteCount: number
}

export function resumenComisiones(commissions: ComisionLike[] | undefined | null): ResumenComisiones {
  const res: ResumenComisiones = {
    brutas: 0,
    devoluciones: 0,
    finales: 0,
    pendiente: 0,
    cobrado: 0,
    ventasCount: 0,
    devolucionesCount: 0,
    pendienteCount: 0,
  }
  for (const c of commissions ?? []) {
    const amount = c.commissionAmount || 0
    if (amount < 0) {
      res.devoluciones += -amount
      res.devolucionesCount++
    } else {
      res.brutas += amount
      res.ventasCount++
    }
    res.finales += amount
    // Con imputación parcial, "cobrado" es lo efectivamente cubierto por los pagos.
    const imputado = c.montoImputado != null ? c.montoImputado : c.isPaid ? amount : 0
    res.cobrado += imputado
    res.pendiente += amount - imputado
    if (!c.isPaid) res.pendienteCount++
  }
  return res
}
