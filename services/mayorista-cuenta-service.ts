import { supabase } from '@/lib/supabase'
import { generateReadableId } from '@/services/supabase-helpers'
import { calcularSaldosBoletas, descripcionPagoMayorista, type MetodoPagoMayorista } from '@/lib/utils/imputacion-mayorista'

export type Distribucion = 1 | 2

export interface TransaccionMayorista {
  id: string
  type: 'debt' | 'payment'
  amount: number
  description: string
  date: Date
  distribucion: Distribucion   // cuenta del proveedor: Distribución 1 o 2
  saldo?: number   // solo en deudas: cuánto queda por pagar
  debtId?: string   // solo en pagos: a qué boleta se aplicó
}

function mapRow(d: Record<string, any>): TransaccionMayorista {
  return {
    id: d.id,
    type: d.type as 'debt' | 'payment',
    amount: Number(d.amount) || 0,
    description: d.description ?? '',
    date: new Date(d.date),
    distribucion: (Number(d.distribucion) === 2 ? 2 : 1) as Distribucion,
    saldo: d.saldo != null ? Number(d.saldo) : undefined,
    debtId: d.debt_id ?? undefined,
  }
}

export const getTransaccionesMayorista = async (
  distribucion?: Distribucion
): Promise<TransaccionMayorista[]> => {
  let query = supabase
    .from('transacciones_mayorista')
    .select('*')
    .order('date', { ascending: false })
  if (distribucion) query = query.eq('distribucion', distribucion)
  const { data, error } = await query
  if (error) {
    console.error('[mayorista-cuenta] Error leyendo transacciones:', error)
    return []
  }
  return (data ?? []).map(mapRow)
}

export const addDeudaMayorista = async (data: {
  amount: number
  distribucion: Distribucion
  description?: string
  boleta?: string
  date?: string   // 'YYYY-MM-DD' o ISO; default hoy
}): Promise<TransaccionMayorista> => {
  const docId = await generateReadableId('transacciones_mayorista', 'txmay', 'deuda')
  const boleta = data.boleta?.trim()
  const desc = boleta
    ? `Boleta ${boleta}${data.description ? ` — ${data.description}` : ''}`
    : (data.description || 'Deuda con mayorista')
  // Si viene 'YYYY-MM-DD' fijar mediodía local para evitar desfase de zona horaria
  const dateIso = data.date
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(data.date) ? `${data.date}T12:00:00` : data.date).toISOString()
    : new Date().toISOString()
  const row = {
    id: docId,
    type: 'debt',
    amount: data.amount,
    saldo: data.amount,
    description: desc,
    date: dateIso,
    distribucion: data.distribucion,
  }
  const { error } = await supabase.from('transacciones_mayorista').insert(row)
  if (error) throw error
  return { ...row, type: 'debt', date: new Date(dateIso), distribucion: data.distribucion }
}

// Recalcula el saldo de todas las boletas de una distribución a partir de sus pagos
// (imputados a boleta + pagos por monto FIFO). Solo actualiza las que cambiaron.
export const recomputarSaldosMayorista = async (distribucion: Distribucion): Promise<Map<string, number>> => {
  const { data, error } = await supabase
    .from('transacciones_mayorista')
    .select('id, type, amount, date, saldo, debt_id')
    .eq('distribucion', distribucion)
  if (error) throw new Error('No se pudieron leer los movimientos')
  const rows = data ?? []
  const saldos = calcularSaldosBoletas(
    rows.map((r) => ({ id: r.id, type: r.type, amount: Number(r.amount) || 0, date: r.date, debtId: r.debt_id }))
  )
  const cambios = rows.filter(
    (r) => r.type === 'debt' && Math.abs((Number(r.saldo) || 0) - (saldos.get(r.id) ?? 0)) > 0.004
  )
  for (const r of cambios) {
    const { error: updErr } = await supabase
      .from('transacciones_mayorista')
      .update({ saldo: saldos.get(r.id) ?? 0 })
      .eq('id', r.id)
    if (updErr) throw new Error('Error actualizando saldo de boleta')
  }
  return saldos
}

// Registra un pago al mayorista. Sin debtId es un pago por monto (cubre boletas FIFO);
// con debtId se imputa a esa boleta. Devuelve el pago y los saldos recalculados.
export const registrarPagoMayorista = async (data: {
  amount: number
  distribucion: Distribucion
  date?: string   // 'YYYY-MM-DD' o ISO; default hoy
  metodo: MetodoPagoMayorista
  referencia?: string
  notas?: string
  debtId?: string
}): Promise<{ pago: TransaccionMayorista; saldos: Map<string, number> }> => {
  if (!(data.amount > 0)) throw new Error('Monto inválido')
  let boleta: string | undefined
  if (data.debtId) {
    const { data: debtRow, error: readErr } = await supabase
      .from('transacciones_mayorista')
      .select('description, distribucion')
      .eq('id', data.debtId)
      .single()
    if (readErr || !debtRow) throw new Error('Boleta no encontrada')
    if ((Number(debtRow.distribucion) === 2 ? 2 : 1) !== data.distribucion) {
      throw new Error('La boleta es de otra distribución')
    }
    boleta = debtRow.description || undefined
  }

  const dateIso = data.date
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(data.date) ? `${data.date}T12:00:00` : data.date).toISOString()
    : new Date().toISOString()
  const docId = await generateReadableId('transacciones_mayorista', 'txmay', 'pago')
  const row = {
    id: docId,
    type: 'payment',
    amount: data.amount,
    description: descripcionPagoMayorista({ metodo: data.metodo, referencia: data.referencia, notas: data.notas, boleta }),
    date: dateIso,
    debt_id: data.debtId ?? null,
    distribucion: data.distribucion,
  }
  const { error: insErr } = await supabase.from('transacciones_mayorista').insert(row)
  if (insErr) throw insErr
  const saldos = await recomputarSaldosMayorista(data.distribucion)
  return {
    pago: { ...row, type: 'payment', date: new Date(dateIso), debtId: data.debtId, distribucion: data.distribucion },
    saldos,
  }
}

// Mantener por compatibilidad con cargar pago manual
export const addPagoMayorista = async (data: {
  amount: number
  distribucion: Distribucion
  description?: string
}): Promise<TransaccionMayorista> => {
  const docId = await generateReadableId('transacciones_mayorista', 'txmay', 'pago')
  const row = {
    id: docId,
    type: 'payment',
    amount: data.amount,
    description: data.description || 'Pago a mayorista',
    date: new Date().toISOString(),
    distribucion: data.distribucion,
  }
  const { error } = await supabase.from('transacciones_mayorista').insert(row)
  if (error) throw error
  return { ...row, type: 'payment', date: new Date(), distribucion: data.distribucion }
}

// Elimina un movimiento (deuda o pago) cargado por error.
// - Deuda: solo si NO tiene pagos imputados a ella (para no dejar pagos huérfanos);
//   los pagos por monto que la cubrían se redistribuyen FIFO al recalcular.
// - Pago: se borra y se recalculan los saldos de las boletas.
// El balance se recalcula solo (es Σ deudas − Σ pagos).
export const deleteTransaccionMayorista = async (id: string): Promise<void> => {
  const { data: tx, error } = await supabase
    .from('transacciones_mayorista')
    .select('id, type, amount, saldo, debt_id, distribucion')
    .eq('id', id)
    .single()
  if (error || !tx) throw new Error('Movimiento no encontrado')

  if (tx.type === 'debt') {
    const { data: pagos } = await supabase
      .from('transacciones_mayorista')
      .select('id')
      .eq('debt_id', id)
      .limit(1)
    if (pagos && pagos.length > 0) {
      throw new Error('La boleta tiene pagos imputados. Eliminá primero esos pagos.')
    }
  }

  const { error: delErr } = await supabase.from('transacciones_mayorista').delete().eq('id', id)
  if (delErr) throw delErr
  await recomputarSaldosMayorista(Number(tx.distribucion) === 2 ? 2 : 1)
}

export const getBalanceMayorista = async (distribucion?: Distribucion): Promise<number> => {
  const txs = await getTransaccionesMayorista(distribucion)
  return txs.reduce((acc, tx) => {
    return tx.type === 'debt' ? acc + tx.amount : acc - tx.amount
  }, 0)
}
