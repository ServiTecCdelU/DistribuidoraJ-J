import { supabase } from '@/lib/supabase'
import { generateReadableId } from '@/services/supabase-helpers'

export interface TransaccionMayorista {
  id: string
  type: 'debt' | 'payment'
  amount: number
  description: string
  date: Date
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
    saldo: d.saldo != null ? Number(d.saldo) : undefined,
    debtId: d.debt_id ?? undefined,
  }
}

export const getTransaccionesMayorista = async (): Promise<TransaccionMayorista[]> => {
  const { data, error } = await supabase
    .from('transacciones_mayorista')
    .select('*')
    .order('date', { ascending: false })
  if (error) {
    console.error('[mayorista-cuenta] Error leyendo transacciones:', error)
    return []
  }
  return (data ?? []).map(mapRow)
}

export const addDeudaMayorista = async (data: {
  amount: number
  description?: string
}): Promise<TransaccionMayorista> => {
  const docId = await generateReadableId('transacciones_mayorista', 'txmay', 'deuda')
  const row = {
    id: docId,
    type: 'debt',
    amount: data.amount,
    saldo: data.amount,
    description: data.description || 'Deuda con mayorista',
    date: new Date().toISOString(),
  }
  const { error } = await supabase.from('transacciones_mayorista').insert(row)
  if (error) throw error
  return { ...row, type: 'debt', date: new Date() }
}

export const pagarBoleta = async (data: {
  debtId: string
  amount: number
  description?: string
}): Promise<TransaccionMayorista> => {
  // Leer saldo actual de la boleta
  const { data: debtRow, error: readErr } = await supabase
    .from('transacciones_mayorista')
    .select('saldo, description')
    .eq('id', data.debtId)
    .single()
  if (readErr || !debtRow) throw new Error('Boleta no encontrada')

  const saldoActual = Number(debtRow.saldo) || 0
  if (data.amount > saldoActual) throw new Error('El monto supera el saldo de la boleta')

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
  }
  const { error: insErr } = await supabase.from('transacciones_mayorista').insert(row)
  if (insErr) throw error
  return { ...row, type: 'payment', date: new Date(), debtId: data.debtId }
}

// Mantener por compatibilidad con cargar deuda manual
export const addPagoMayorista = async (data: {
  amount: number
  description?: string
}): Promise<TransaccionMayorista> => {
  const docId = await generateReadableId('transacciones_mayorista', 'txmay', 'pago')
  const row = {
    id: docId,
    type: 'payment',
    amount: data.amount,
    description: data.description || 'Pago a mayorista',
    date: new Date().toISOString(),
  }
  const { error } = await supabase.from('transacciones_mayorista').insert(row)
  if (error) throw error
  return { ...row, type: 'payment', date: new Date() }
}

export const getBalanceMayorista = async (): Promise<number> => {
  const txs = await getTransaccionesMayorista()
  return txs.reduce((acc, tx) => {
    return tx.type === 'debt' ? acc + tx.amount : acc - tx.amount
  }, 0)
}
