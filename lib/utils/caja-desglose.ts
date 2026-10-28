// Desglose de una venta en lo que realmente entró: efectivo, transferencia y cuenta corriente.
//
// El total de la venta y el monto cobrado NO son lo mismo. Si un pedido se cobra con un
// ajuste (roturas, faltantes, devoluciones), el repartidor cobra un monto y la venta queda
// con otro total. La caja tiene que informar LO COBRADO; usar el total esconde el descuadre.
//
// Lógica pura, sin Supabase: acepta la venta mapeada (camelCase) o la fila cruda (snake_case).

export interface VentaCobro {
  total?: number | null
  paymentType?: string | null
  paymentMethod?: string | null
  cashAmount?: number | null
  creditAmount?: number | null
  efectivoAmount?: number | null
  transferenciaAmount?: number | null
}

export interface Desglose {
  efectivo: number
  transferencia: number
  credito: number
}

export interface DesgloseAgregado extends Desglose {
  /** Suma de lo efectivamente cobrado (efectivo + transferencia + crédito). */
  cobrado: number
  /** Suma de los totales facturados. */
  total: number
  /** cobrado - total. Distinto de cero = hay ventas cuyo cobro no coincide con su total. */
  desvio: number
  count: number
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Lee un campo aceptando su forma camelCase o snake_case. Null y ausente son equivalentes. */
const campo = (v: VentaCobro, camel: keyof VentaCobro, snake: string): unknown => {
  const directo = v[camel]
  if (directo !== undefined && directo !== null) return directo
  const crudo = (v as Record<string, unknown>)[snake]
  return crudo === null ? undefined : crudo
}

/**
 * Reparte lo cobrado en una venta entre efectivo, transferencia y cuenta corriente.
 *
 * Prioriza los montos explícitos (`efectivoAmount` / `transferenciaAmount`), que son lo que
 * el repartidor declaró haber cobrado. Solo si no están cargados (ventas anteriores a ese
 * campo) cae al total de la venta o a `cashAmount`, según el método de pago.
 */
export function desglosePago(venta: VentaCobro): Desglose {
  const total = num(campo(venta, 'total', 'total'))
  const tipo = (campo(venta, 'paymentType', 'payment_type') as string) ?? 'cash'
  const metodo = (campo(venta, 'paymentMethod', 'payment_method') as string) ?? 'efectivo'

  const efectivoDeclarado = campo(venta, 'efectivoAmount', 'efectivo_amount')
  const transferenciaDeclarada = campo(venta, 'transferenciaAmount', 'transferencia_amount')
  const hayDeclarado = efectivoDeclarado !== undefined || transferenciaDeclarada !== undefined

  if (tipo === 'credit') {
    return { efectivo: 0, transferencia: 0, credito: total }
  }

  const credito = tipo === 'mixed' ? num(campo(venta, 'creditAmount', 'credit_amount')) : 0

  if (hayDeclarado) {
    return {
      efectivo: num(efectivoDeclarado),
      transferencia: num(transferenciaDeclarada),
      credito,
    }
  }

  // Sin desglose cargado: el cobrado es el total (pago simple) o cashAmount (pago mixto).
  const base = tipo === 'mixed' ? num(campo(venta, 'cashAmount', 'cash_amount')) : total
  return metodo === 'transferencia'
    ? { efectivo: 0, transferencia: base, credito }
    : { efectivo: base, transferencia: 0, credito }
}

/** Suma el desglose de un conjunto de ventas y expone el desvío contra lo facturado. */
export function agregarDesglose(ventas: VentaCobro[]): DesgloseAgregado {
  let efectivo = 0
  let transferencia = 0
  let credito = 0
  let total = 0

  for (const v of ventas) {
    const d = desglosePago(v)
    efectivo += d.efectivo
    transferencia += d.transferencia
    credito += d.credito
    total += num(campo(v, 'total', 'total'))
  }

  const cobrado = round2(efectivo + transferencia + credito)
  const totalRedondeado = round2(total)

  return {
    efectivo: round2(efectivo),
    transferencia: round2(transferencia),
    credito: round2(credito),
    cobrado,
    total: totalRedondeado,
    desvio: round2(cobrado - totalRedondeado),
    count: ventas.length,
  }
}

// ── Efectivo esperado en caja ──────────────────────────────────────────────

/** Movimiento de efectivo que no es una venta (RPC caja_movimientos_efectivo). */
export interface MovimientoEfectivo {
  tipo: 'cobro' | 'cobro_cobrador' | 'devolucion' | 'descuento'
  id: string
  fecha: string
  cliente?: string | null
  /** > 0 entra a la caja, < 0 sale. */
  monto: number
  detalle?: string | null
}

export interface TotalesMovimientos {
  /** Cobros de cuenta corriente en efectivo (admin + cobradores autorizados). */
  cobros: number
  /** Efectivo devuelto a clientes (devoluciones y descuentos), en positivo. */
  devoluciones: number
}

export function totalesMovimientos(movs: MovimientoEfectivo[]): TotalesMovimientos {
  let cobros = 0
  let devoluciones = 0
  for (const m of movs) {
    const monto = num(m.monto)
    if (monto >= 0) cobros += monto
    else devoluciones += -monto
  }
  return { cobros: round2(cobros), devoluciones: round2(devoluciones) }
}

/**
 * Efectivo que tiene que haber en caja. Fuente única para la pantalla, el PDF y el cierre
 * automático (antes la pantalla y el PDF no restaban las comisiones y el cron sí).
 */
export function efectivoEsperado(p: {
  inicial: number
  efectivoVentas: number
  cobros: number
  devoluciones: number
  comisiones: number
}): number {
  return round2(num(p.inicial) + num(p.efectivoVentas) + num(p.cobros) - num(p.devoluciones) - num(p.comisiones))
}
