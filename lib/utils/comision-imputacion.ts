// Imputación FIFO de los pagos sobre las comisiones de un empleado.
//
// El total efectivamente pagado se aplica comisión por comisión, de la más
// antigua a la más nueva. Las que alcanza quedan "pagado", la que se corta
// queda "parcial" y el resto "pendiente".
//
// Se recalcula SIEMPRE sobre todo el historial (replay holístico, no
// incremental) para que no queden residuos si un pago se edita o se borra.
// Mismo criterio que la imputación de saldos de clientes.

export type EstadoPagoComision = 'pagado' | 'parcial' | 'pendiente'

export interface ComisionImputable {
  commissionAmount: number
  createdAt: Date
}

export interface ImputacionResultado<T> {
  items: (T & { montoImputado: number; estadoPago: EstadoPagoComision; isPaid: boolean })[]
  /** Plata pagada que sobró después de cubrir todas las comisiones (adelanto). */
  sobrante: number
}

const EPSILON = 0.01

/**
 * Aplica `totalPagado` sobre las comisiones ordenadas de más vieja a más nueva.
 * Las devoluciones (montos negativos) reducen lo adeudado, así que liberan
 * plata para cubrir comisiones posteriores.
 */
export function imputarComisiones<T extends ComisionImputable>(
  comisiones: T[],
  totalPagado: number,
): ImputacionResultado<T> {
  const orden = [...comisiones].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  let disponible = totalPagado

  const imputados = orden.map((c) => {
    const monto = c.commissionAmount || 0

    // Devolución: no se "paga", descuenta deuda y libera plata.
    if (monto <= 0) {
      disponible -= monto
      return { ...c, montoImputado: monto, estadoPago: 'pagado' as EstadoPagoComision, isPaid: true }
    }

    const imputado = Math.max(0, Math.min(disponible, monto))
    disponible -= imputado

    const estadoPago: EstadoPagoComision =
      imputado >= monto - EPSILON ? 'pagado' : imputado <= EPSILON ? 'pendiente' : 'parcial'

    return { ...c, montoImputado: imputado, estadoPago, isPaid: estadoPago === 'pagado' }
  })

  // Se devuelve en el mismo orden en que llegó la lista original.
  const porRef = new Map(imputados.map((i, idx) => [orden[idx], i]))
  return {
    items: comisiones.map((c) => porRef.get(c)!),
    sobrante: Math.max(0, disponible),
  }
}

/**
 * Comisiones cubiertas por UN pago concreto: la diferencia entre imputar
 * `acumuladoAntes` y `acumuladoAntes + montoPago`. Sirve para el comprobante,
 * que debe listar solo lo que ese pago alcanzó a cubrir.
 *
 * En la comisión que queda parcial se prorratea también el total de la venta,
 * para que "comisión % × ventas netas" siga cerrando con lo que se pagó.
 */
export function comisionesDelPago<T extends ComisionImputable & { saleTotal: number }>(
  comisiones: T[],
  acumuladoAntes: number,
  montoPago: number,
): T[] {
  const antes = imputarComisiones(comisiones, acumuladoAntes).items
  const despues = imputarComisiones(comisiones, acumuladoAntes + montoPago).items

  const cubiertas: T[] = []
  for (let i = 0; i < comisiones.length; i++) {
    const delta = despues[i].montoImputado - antes[i].montoImputado
    if (Math.abs(delta) < EPSILON) continue
    const original = comisiones[i].commissionAmount || 0
    const proporcion = original !== 0 ? delta / original : 1
    cubiertas.push({
      ...comisiones[i],
      commissionAmount: delta,
      saleTotal: comisiones[i].saleTotal * proporcion,
    })
  }
  return cubiertas.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}
