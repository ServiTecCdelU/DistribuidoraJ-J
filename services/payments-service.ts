import { supabase } from '@/lib/supabase'
import type { Transaction } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

export const registerCashPayment = async (data: {
  clientId: string
  amount: number
  description?: string
}): Promise<Transaction> => {
  // Decrementar saldo del cliente
  const { data: client } = await supabase
    .from('clientes')
    .select('current_balance, name')
    .eq('id', data.clientId)
    .single()

  const newBalance = (Number(client?.current_balance) || 0) - data.amount
  await supabase
    .from('clientes')
    .update({ current_balance: newBalance })
    .eq('id', data.clientId)

  const clientName = client?.name || 'pago'
  const docId = await generateReadableId('transacciones', 'transaccion', clientName)
  await supabase.from('transacciones').insert({
    id: docId,
    client_id: data.clientId,
    type: 'payment',
    amount: data.amount,
    description: data.description || 'Pago en efectivo',
    date: new Date().toISOString(),
    cuenta: 'minorista',
  })

  return {
    id: docId,
    clientId: data.clientId,
    type: 'payment',
    amount: data.amount,
    description: data.description || 'Pago en efectivo',
    date: new Date(),
    cuenta: 'minorista',
  }
}

export const registerMayoristaPayment = async (data: {
  clientId: string
  amount: number
  description?: string
}): Promise<Transaction> => {
  const { data: client } = await supabase
    .from('clientes')
    .select('current_balance_mayorista, name')
    .eq('id', data.clientId)
    .single()

  const newBalance = (Number(client?.current_balance_mayorista) || 0) - data.amount
  await supabase
    .from('clientes')
    .update({ current_balance_mayorista: newBalance })
    .eq('id', data.clientId)

  const clientName = client?.name || 'pago'
  const docId = await generateReadableId('transacciones', 'transaccion', clientName)
  await supabase.from('transacciones').insert({
    id: docId,
    client_id: data.clientId,
    type: 'payment',
    amount: data.amount,
    description: data.description || 'Pago en efectivo (mayorista)',
    date: new Date().toISOString(),
    cuenta: 'mayorista',
  })

  return {
    id: docId,
    clientId: data.clientId,
    type: 'payment',
    amount: data.amount,
    description: data.description || 'Pago en efectivo (mayorista)',
    date: new Date(),
    cuenta: 'mayorista',
  }
}
