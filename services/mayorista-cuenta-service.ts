import { supabase } from '@/lib/supabase'
import { generateReadableId } from '@/services/supabase-helpers'

export interface TransaccionMayorista {
  id: string
  type: 'debt' | 'payment'
  amount: number
  description: string
  date: Date
}

function mapRow(d: Record<string, any>): TransaccionMayorista {
  return {
    id: d.id,
    type: d.type as 'debt' | 'payment',
    amount: Number(d.amount) || 0,
    description: d.description ?? '',
    date: new Date(d.date),
  }
}

export const getTransaccionesMayorista = async (): Promise<TransaccionMayorista[]> => {
  const { data, error } = await supabase
    .from('transacciones_mayorista')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRow)
}

export const getBalanceMayorista = async (): Promise<number> => {
  const txs = await getTransaccionesMayorista()
  return txs.reduce((acc, tx) => {
    return tx.type === 'debt' ? acc + tx.amount : acc - tx.amount
  }, 0)
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
    description: data.description || 'Deuda con mayorista',
    date: new Date().toISOString(),
  }
  const { error } = await supabase.from('transacciones_mayorista').insert(row)
  if (error) throw error
  return { ...row, type: 'debt', date: new Date() }
}

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
