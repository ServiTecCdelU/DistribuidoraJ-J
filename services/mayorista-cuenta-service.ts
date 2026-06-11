import { supabase } from '@/lib/supabase'
import { generateReadableId } from '@/services/supabase-helpers'

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

export const pagarBoleta = async (data: {
  debtId: string
  amount: number
  description?: string
}): Promise<TransaccionMayorista> => {
  // Leer saldo actual de la boleta (y su distribución, que hereda el pago)
  const { data: debtRow, error: readErr } = await supabase
    .from('transacciones_mayorista')
    .select('saldo, description, distribucion')
    .eq('id', data.debtId)
    .single()
  if (readErr || !debtRow) throw new Error('Boleta no encontrada')

  const saldoActual = Number(debtRow.saldo) || 0
  if (data.amount > saldoActual) throw new Error('El monto supera el saldo de la boleta')
  const distribucion: Distribucion = Number(debtRow.distribucion) === 2 ? 2 : 1

  // Decrementar saldo
  const nuevoSaldo = Math.max(0, saldoActual - data.amount)
  const { error: updErr } = await supabase
    .from('transacciones_mayorista')
    .update({ saldo: nuevoSaldo })
    .eq('id', data.debtId)
  if (updErr) throw new Error('Error actualizando saldo')

  // Registrar pago
  const docId = await generateReadableId('transacciones_mayorista', 'txmay', 'pago')
  const desc = data.description || `Pago boleta ${debtRow.description || data.debtId}`
  const row = {
    id: docId,
    type: 'payment',
    amount: data.amount,
    description: desc,
    date: new Date().toISOString(),
    debt_id: data.debtId,
    distribucion,
  }
  const { error: insErr } = await supabase.from('transacciones_mayorista').insert(row)
  if (insErr) throw insErr
  return { ...row, type: 'payment', date: new Date(), debtId: data.debtId, distribucion }
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

export const getBalanceMayorista = async (distribucion?: Distribucion): Promise<number> => {
  const txs = await getTransaccionesMayorista(distribucion)
  return txs.reduce((acc, tx) => {
    return tx.type === 'debt' ? acc + tx.amount : acc - tx.amount
  }, 0)
}
