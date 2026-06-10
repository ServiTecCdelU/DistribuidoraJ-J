import { supabase } from '@/lib/supabase'
import type { Transaction } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

export interface CashPaymentResult extends Transaction {
  reciboNumero: string
  saldoAnterior: number
  saldoNuevo: number
}

/**
 * Genera el próximo número de recibo de pago: `REC-{año}-{correlativo 5 díg}`.
 * Sigue la misma lógica que los remitos de venta (`R-{año}-{correlativo}`),
 * distinguido por el prefijo `REC-`.
 */
const generarNumeroRecibo = async (): Promise<string> => {
  const { data: ultimos } = await supabase
    .from('transacciones')
    .select('recibo_numero')
    .not('recibo_numero', 'is', null)
    .order('recibo_numero', { ascending: false })
    .limit(1)

  let ultimoNumero = 0
  if (ultimos && ultimos.length > 0) {
    const match = ultimos[0].recibo_numero?.match(/REC-\d+-(\d+)/)
    if (match) ultimoNumero = parseInt(match[1], 10)
  }
  return `REC-${new Date().getFullYear()}-${String(ultimoNumero + 1).padStart(5, '0')}`
}

export const registerCashPayment = async (data: {
  clientId: string
  amount: number
  description?: string
}): Promise<CashPaymentResult> => {
  // Decrementar saldo del cliente
  const { data: client } = await supabase
    .from('clientes')
    .select('current_balance, name')
    .eq('id', data.clientId)
    .single()

  const saldoAnterior = Number(client?.current_balance) || 0
  const saldoNuevo = saldoAnterior - data.amount
  await supabase
    .from('clientes')
    .update({ current_balance: saldoNuevo })
    .eq('id', data.clientId)

  const clientName = client?.name || 'pago'
  const reciboNumero = await generarNumeroRecibo()
  const docId = await generateReadableId('transacciones', 'transaccion', clientName)
  const description = data.description || 'Pago en efectivo'
  await supabase.from('transacciones').insert({
    id: docId,
    client_id: data.clientId,
    type: 'payment',
    amount: data.amount,
    description,
    date: new Date().toISOString(),
    cuenta: 'minorista',
    recibo_numero: reciboNumero,
  })

  return {
    id: docId,
    clientId: data.clientId,
    type: 'payment',
    amount: data.amount,
    description,
    date: new Date(),
    cuenta: 'minorista',
    reciboNumero,
    saldoAnterior,
    saldoNuevo,
  }
}

/**
 * Guarda el PDF del recibo (base64) en la transacción del pago.
 */
export const saveReciboPdf = async (txId: string, base64: string): Promise<void> => {
  const { error } = await supabase
    .from('transacciones')
    .update({
      recibo_pdf_base64: base64,
      recibo_generado_at: new Date().toISOString(),
    })
    .eq('id', txId)
  if (error) throw error
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
