import { supabase } from '@/lib/supabase'
import type { Transaction } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'
import { imputarADeuda, imputarFIFO, recomputarSaldos } from '@/lib/utils/saldo-imputacion'

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

// Recalcula desde cero el saldo por-boleta de un cliente/cuenta replayeando
// TODOS los pagos no anulados en orden cronológico sobre las deudas restauradas
// a su monto original. Es la fuente de verdad del detalle por-boleta: evita los
// residuos que deja imputar cada pago suelto contra las deudas abiertas "en ese
// momento" (pagos retroactivos, previos a su venta, o devoluciones). Idempotente.
// No toca current_balance (ese lo maneja quien registra el pago/devolución).
export const recomputarSaldosDeudas = async (
  clientId: string,
  cuenta: 'minorista' | 'mayorista',
): Promise<void> => {
  const cuentaFilter = cuenta === 'minorista' ? 'cuenta.eq.minorista,cuenta.is.null' : 'cuenta.eq.mayorista'

  // Deudas con saldo trackeado (las legacy de saldo null no se tocan), FIFO.
  const { data: debts } = await supabase
    .from('transacciones')
    .select('id, amount, saldo')
    .eq('client_id', clientId)
    .eq('type', 'debt')
    .eq('anulado', false)
    .not('saldo', 'is', null)
    .or(cuentaFilter)
    .order('date', { ascending: true })
  if (!debts || debts.length === 0) return

  // Pagos/devoluciones vigentes, en orden cronológico.
  const { data: pagos } = await supabase
    .from('transacciones')
    .select('amount, debt_id')
    .eq('client_id', clientId)
    .eq('type', 'payment')
    .eq('anulado', false)
    .or(cuentaFilter)
    .order('date', { ascending: true })

  const nuevos = recomputarSaldos(
    debts.map((d) => ({ id: d.id, amount: Number(d.amount) })),
    (pagos ?? []).map((p) => ({ monto: Number(p.amount), debtId: (p as any).debt_id ?? undefined })),
  )

  // Persistir solo las boletas cuyo saldo cambió.
  for (const d of debts) {
    const nuevo = nuevos.get(d.id)
    if (nuevo != null && Math.abs(nuevo - Number(d.saldo)) > 1e-9) {
      await supabase.from('transacciones').update({ saldo: nuevo }).eq('id', d.id)
    }
  }
}

const registerPayment = async (
  cuenta: 'minorista' | 'mayorista',
  data: { clientId: string; amount: number; description?: string; debtTxId?: string; date?: string },
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

  // Número de recibo atómico y consecutivo (función next_recibo_number en Postgres).
  // Si la función no existe todavía, fallback con timestamp para no bloquear el pago.
  let reciboNumero: string
  const { data: nroRecibo, error: reciboErr } = await supabase.rpc('next_recibo_number')
  reciboNumero = !reciboErr && nroRecibo ? String(nroRecibo) : `RC-${Date.now()}`

  const defaultDesc = cuenta === 'minorista' ? 'Pago en efectivo' : 'Pago en efectivo (mayorista)'
  const description = data.description || defaultDesc
  const clientName = (client as any)?.name || 'pago'
  const docId = await generateReadableId('transacciones', 'transaccion', clientName)
  // Día en que el cliente pagó (elegido al registrar); si no se especifica, ahora mismo.
  const fecha = data.date ? new Date(`${data.date}T12:00:00`) : new Date()
  const row: Record<string, unknown> = {
    id: docId,
    client_id: data.clientId,
    type: 'payment',
    amount: data.amount,
    description,
    date: fecha.toISOString(),
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

  // Recalcular saldos por-boleta con el pago ya persistido: replay holístico de
  // todos los pagos vigentes. Evita residuos por pagos retroactivos o previos a
  // su venta (imputar el pago suelto solo veía las boletas abiertas del momento).
  try {
    await recomputarSaldosDeudas(data.clientId, cuenta)
  } catch {
    // Si la columna saldo aún no existe, el pago global sigue funcionando
  }

  return {
    id: docId,
    clientId: data.clientId,
    type: 'payment',
    amount: data.amount,
    description,
    date: fecha,
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

/**
 * Elimina un pago registrado por error y revierte sus efectos:
 * - Devuelve el monto al saldo del cliente (current_balance / current_balance_mayorista).
 * - Recalcula los saldos por remito de esa cuenta: restaura cada deuda a su monto
 *   original y vuelve a imputar los pagos restantes en orden cronológico (FIFO o
 *   imputación puntual según tenían). Así el estado queda consistente sin importar
 *   si el pago borrado era el último o uno intermedio.
 * Solo borra transacciones de tipo 'payment'.
 */
export const deletePayment = async (txId: string): Promise<void> => {
  const { data: tx } = await supabase
    .from('transacciones')
    .select('id, client_id, type, amount, cuenta')
    .eq('id', txId)
    .single()
  if (!tx) throw new Error('Pago no encontrado')
  if (tx.type !== 'payment') throw new Error('Solo se pueden eliminar pagos')

  const cuenta: 'minorista' | 'mayorista' = (tx.cuenta as any) ?? 'minorista'
  const clientId = tx.client_id
  const amount = Number(tx.amount)
  const balanceCol = cuenta === 'minorista' ? 'current_balance' : 'current_balance_mayorista'

  // Borrar primero cualquier comprobante vinculado (FK hacia esta transacción), si no,
  // el delete de abajo falla por violar la constraint y el pago queda sin borrarse.
  await supabase.from('comprobantes_pago').delete().eq('transaction_id', txId)

  // Borrar el pago
  const { error: deleteError } = await supabase.from('transacciones').delete().eq('id', txId)
  if (deleteError) throw new Error(`No se pudo eliminar el pago: ${deleteError.message}`)

  // Devolver el monto al saldo del cliente
  const { data: client } = await supabase
    .from('clientes')
    .select(balanceCol)
    .eq('id', clientId)
    .single()
  const newBalance = (Number((client as any)?.[balanceCol]) || 0) + amount
  await supabase.from('clientes').update({ [balanceCol]: newBalance }).eq('id', clientId)

  // Recalcular saldos por remito: replay de los pagos restantes (el borrado ya no está).
  try {
    await recomputarSaldosDeudas(clientId, cuenta)
  } catch {
    // Si la columna saldo no existe, el balance del cliente ya quedó corregido
  }
}

/**
 * Anula un pago sin borrarlo: revierte sus efectos (igual que deletePayment) pero
 * la transacción queda en el historial marcada como anulada (motivo, quién y cuándo).
 * Solo se puede anular una vez.
 */
export const voidPayment = async (txId: string, motivo: string, adminName: string): Promise<void> => {
  const { data: tx } = await supabase
    .from('transacciones')
    .select('id, client_id, type, amount, cuenta, anulado')
    .eq('id', txId)
    .single()
  if (!tx) throw new Error('Pago no encontrado')
  if (tx.type !== 'payment') throw new Error('Solo se pueden anular pagos')
  if ((tx as any).anulado) throw new Error('Este pago ya fue anulado')

  const cuenta: 'minorista' | 'mayorista' = (tx.cuenta as any) ?? 'minorista'
  const clientId = tx.client_id
  const amount = Number(tx.amount)
  const balanceCol = cuenta === 'minorista' ? 'current_balance' : 'current_balance_mayorista'

  await supabase
    .from('transacciones')
    .update({
      anulado: true,
      anulado_motivo: motivo,
      anulado_by: adminName,
      anulado_at: new Date().toISOString(),
    })
    .eq('id', txId)

  // Devolver el monto al saldo del cliente
  const { data: client } = await supabase
    .from('clientes')
    .select(balanceCol)
    .eq('id', clientId)
    .single()
  const newBalance = (Number((client as any)?.[balanceCol]) || 0) + amount
  await supabase.from('clientes').update({ [balanceCol]: newBalance }).eq('id', clientId)

  // Recalcular saldos por remito: replay de los pagos vigentes (el anulado ya
  // quedó marcado y el helper lo excluye).
  try {
    await recomputarSaldosDeudas(clientId, cuenta)
  } catch {
    // Si la columna saldo no existe, el balance del cliente ya quedó corregido
  }
}

export const registerCashPayment = async (data: {
  clientId: string
  amount: number
  description?: string
  debtTxId?: string
  date?: string
}): Promise<Transaction> => registerPayment('minorista', data)

export const registerMayoristaPayment = async (data: {
  clientId: string
  amount: number
  description?: string
  debtTxId?: string
  date?: string
}): Promise<Transaction> => registerPayment('mayorista', data)
