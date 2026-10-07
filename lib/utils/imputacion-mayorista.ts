// Imputación de pagos a boletas de la cuenta con el mayorista (proveedor).
// Replay holístico: el saldo de cada boleta se deriva de todos los pagos de la cuenta.
// 1) Pagos imputados a una boleta (debtId) bajan esa boleta (hasta su saldo); el excedente pasa a FIFO.
// 2) Pagos por monto (sin debtId) cubren las boletas más antiguas primero (FIFO).
// Lo que sobra queda como saldo a favor (el balance es Σ deudas − Σ pagos).

export interface MovMayorista {
  id: string
  type: 'debt' | 'payment'
  amount: number
  date: Date | string
  debtId?: string | null
}

export const METODOS_PAGO_MAYORISTA = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  otro: 'Otro',
} as const

export type MetodoPagoMayorista = keyof typeof METODOS_PAGO_MAYORISTA

const redondear = (n: number) => Math.round(n * 100) / 100
const ts = (d: Date | string) => new Date(d).getTime()

/** Devuelve el saldo pendiente de cada boleta (id → saldo). */
export function calcularSaldosBoletas(movs: MovMayorista[]): Map<string, number> {
  const deudas = movs
    .filter((m) => m.type === 'debt')
    .sort((a, b) => ts(a.date) - ts(b.date) || a.id.localeCompare(b.id))
  const saldos = new Map<string, number>(deudas.map((d) => [d.id, redondear(d.amount)]))

  const pagos = movs
    .filter((m) => m.type === 'payment')
    .sort((a, b) => ts(a.date) - ts(b.date) || a.id.localeCompare(b.id))

  let generico = 0
  for (const p of pagos) {
    const actual = p.debtId ? saldos.get(p.debtId) : undefined
    if (actual === undefined) { generico += p.amount; continue }
    const aplicado = Math.min(actual, p.amount)
    saldos.set(p.debtId as string, redondear(actual - aplicado))
    generico += p.amount - aplicado
  }

  for (const d of deudas) {
    if (generico <= 0.004) break
    const actual = saldos.get(d.id) ?? 0
    const aplicado = Math.min(actual, generico)
    saldos.set(d.id, redondear(actual - aplicado))
    generico -= aplicado
  }
  return saldos
}

/** Arma la descripción visible del pago. */
export function descripcionPagoMayorista(opts: {
  metodo: MetodoPagoMayorista
  referencia?: string
  notas?: string
  boleta?: string
}): string {
  const partes = [`Pago ${METODOS_PAGO_MAYORISTA[opts.metodo].toLowerCase()}`]
  if (opts.boleta) partes.push(opts.boleta)
  if (opts.referencia?.trim()) partes.push(`Ref. ${opts.referencia.trim()}`)
  const base = partes.join(' · ')
  return opts.notas?.trim() ? `${base} — ${opts.notas.trim()}` : base
}
