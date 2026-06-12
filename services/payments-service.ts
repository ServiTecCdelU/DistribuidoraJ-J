import { supabase } from '@/lib/supabase'
import type { Transaction } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

// Baja el saldo de las deudas (remitos/ventas) del cliente.
// - Con debtTxId: imputa el pago a ESA deuda puntual.
// - Sin debtTxId: FIFO — cancela las deudas más antiguas primero.
// Las deudas legacy (saldo null, sin backfill) no se tocan.
const aplicarPagoADeudas = async (
  clientId: string,
  cuenta: 'minorista' | 'mayorista',
  amount: number,
  debtTxId?: string,
): Promise<void> => {
  if (debtTxId) {
    const { data: debt } = await supabase
      .from('transacciones')
      .select('id, saldo, amount')
      .eq('id', debtTxId)
      .single()
    if (!debt) return
    const saldoActual = debt.saldo != null ? Number(debt.saldo) : Number(debt.amount)
    const nuevoSaldo = Math.max(0, saldoActual - amount)
    await supabase.from('transacciones').update({ saldo: nuevoSaldo }).eq('id', debtTxId)
    return
  }

  const { data: debts } = await supabase
    .from('transacciones')
    .select('id, saldo')
    .eq('client_id', clientId)
    .eq('type', 'debt')
    .gt('saldo', 0)
    .or(cuenta === 'minorista' ? 'cuenta.eq.minorista,cuenta.is.null' : 'cuenta.eq.mayorista')
    .order('date', { ascending: true })

  let restante = amount
  for (const d of debts ?? []) {
    if (restante <= 0) break
    const saldo = Number(d.saldo) || 0
    const aplicado = Math.min(saldo, restante)
    await supabase.from('transacciones').update({ saldo: saldo - aplicado }).eq('id', d.id)
    restante -= aplicado
  }
}

const registerPayment = async (
  cuenta: 'minorista' | 'mayorista',
  data: { clientId: string; amount: number; description?: string; debtTxId?: string },
): Promise<Transaction> => {
  const balanceCol = cuenta === 'minorista' ? 'current_balance' : 'current_balance_mayorista'
  const { data: client } = await supabase
    .from('clientes')
    .select(`${balanceCol}, name`)
    .eq('id', data.clientId)
    .single()

  const newBalance = (Number((client as any)?.[balanceCol]) || 0) - data.amount
  await supabase
    .from('clientes')
    .update({ [balanceCol]: newBalance })
    .eq('id', data.clientId)

  // Imputar el pago a la(s) deuda(s): específica o FIFO
  try {
    await aplicarPagoADeudas(data.clientId, cuenta, data.amount, data.debtTxId)
  } catch {
    // Si la columna saldo aún no existe, el pago global sigue funcionando
  }

  const defaultDesc = cuenta === 'minorista' ? 'Pago en efectivo' : 'Pago en efectivo (mayorista)'
  const description = data.description || defaultDesc
  const clientName = (client as any)?.name || 'pago'
  const docId = await generateReadableId('transacciones', 'transaccion', clientName)
  const row: Record<string, unknown> = {
    id: docId,
    client_id: data.clientId,
    type: 'payment',
    amount: data.amount,
    description,
    date: new Date().toISOString(),
    cuenta,
  }
  if (data.debtTxId) row.debt_id = data.debtTxId
  const { error } = await supabase.from('transacciones').insert(row)
  if (error && data.debtTxId) {
    // Columna debt_id aún no creada: registrar el pago sin la referencia
    delete row.debt_id
    await supabase.from('transacciones').insert(row)
  }

  return {
    id: docId,
    clientId: data.clientId,
    type: 'payment',
    amount: data.amount,
    description,
    date: new Date(),
    cuenta,
    debtId: data.debtTxId,
  }
}

export const registerCashPayment = async (data: {
  clientId: string
  amount: number
  description?: string
  debtTxId?: string
}): Promise<Transaction> => registerPayment('minorista', data)

export const registerMayoristaPayment = async (data: {
  clientId: string
  amount: number
  description?: string
  debtTxId?: string
}): Promise<Transaction> => registerPayment('mayorista', data)
