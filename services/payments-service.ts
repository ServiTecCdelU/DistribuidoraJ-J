import { supabase } from '@/lib/supabase'
import type { Transaction } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'
import { imputarADeuda, imputarFIFO } from '@/lib/utils/saldo-imputacion'

// Baja el saldo de las deudas (remitos/ventas) del cliente.
// - Con debtTxId: imputa el pago a ESA deuda puntual.
// - Sin debtTxId: FIFO — cancela las deudas más antiguas primero.
// Las deudas legacy (saldo null, sin backfill) no se tocan.
// Exportada para reutilizar en devoluciones (que también bajan saldos).
export const aplicarPagoADeudas = async (
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
    const nuevoSaldo = imputarADeuda(saldoActual, amount)
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

  for (const upd of imputarFIFO(debts ?? [], amount)) {
    await supabase.from('transacciones').update({ saldo: upd.nuevoSaldo }).eq('id', upd.id)
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

  // Número de recibo atómico y consecutivo (función next_recibo_number en Postgres).
  // Si la función no existe todavía, fallback con timestamp para no bloquear el pago.
  let reciboNumero: string
  const { data: nroRecibo, error: reciboErr } = await supabase.rpc('next_recibo_number')
  reciboNumero = !reciboErr && nroRecibo ? String(nroRecibo) : `RC-${Date.now()}`

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
    recibo_numero: reciboNumero,
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
    reciboNumero,
  }
}

/**
 * Devuelve el número de recibo de una transacción de pago. Si todavía no tiene
 * (pagos legacy), genera uno atómico con next_recibo_number() y lo persiste.
 */
export const ensureReciboNumero = async (txId: string): Promise<string> => {
  const { data: tx } = await supabase
    .from('transacciones')
    .select('recibo_numero')
    .eq('id', txId)
    .single()
  const existing = (tx as any)?.recibo_numero
  if (existing) return String(existing)

  const { data: nro, error } = await supabase.rpc('next_recibo_number')
  const reciboNumero = !error && nro ? String(nro) : `RC-${Date.now()}`
  await supabase.from('transacciones').update({ recibo_numero: reciboNumero }).eq('id', txId)
  return reciboNumero
}

export interface ReciboMatch {
  txId: string
  clientId: string
  clientName: string
  reciboNumero: string
  amount: number
  date: Date
  cuenta: 'minorista' | 'mayorista'
  reciboPdfBase64?: string
}

/**
 * Busca recibos de pago por número (ej: "RC-2026-00012", "N° RC-2026-00012" o "12").
 * Devuelve el/los pagos que coinciden junto con el cliente al que pertenecen.
 */
export const findReciboByNumero = async (query: string): Promise<ReciboMatch[]> => {
  const term = query.replace(/n[°ºo]/gi, '').replace(/\s+/g, '').toUpperCase()
  if (!term) return []

  const { data: txs } = await supabase
    .from('transacciones')
    .select('id, client_id, recibo_numero, amount, date, cuenta, recibo_pdf_base64')
    .eq('type', 'payment')
    .not('recibo_numero', 'is', null)
    .ilike('recibo_numero', `%${term}%`)
    .order('date', { ascending: false })
    .limit(10)

  if (!txs || txs.length === 0) return []

  const clientIds = [...new Set(txs.map((t) => t.client_id))]
  const { data: clients } = await supabase
    .from('clientes')
    .select('id, name')
    .in('id', clientIds)
  const nameById = new Map((clients ?? []).map((c) => [c.id, c.name as string]))

  return txs.map((t) => ({
    txId: t.id,
    clientId: t.client_id,
    clientName: nameById.get(t.client_id) || 'Cliente',
    reciboNumero: String(t.recibo_numero),
    amount: Number(t.amount),
    date: new Date(t.date),
    cuenta: (t.cuenta as 'minorista' | 'mayorista') ?? 'minorista',
    reciboPdfBase64: t.recibo_pdf_base64 ?? undefined,
  }))
}

/** Guarda el PDF del recibo (base64) en la transacción de pago. */
export const saveReciboPdf = async (txId: string, pdfBase64: string): Promise<void> => {
  await supabase
    .from('transacciones')
    .update({ recibo_pdf_base64: pdfBase64, recibo_generado_at: new Date().toISOString() })
    .eq('id', txId)
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
