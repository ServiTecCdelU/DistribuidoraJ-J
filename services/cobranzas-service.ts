import { supabase } from '@/lib/supabase'
import type { Client, ComprobantePago, Transaction } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'
import { getSellerIdsByCodigo } from '@/services/sellers-service'
import { SALDO_EPSILON } from '@/lib/utils/saldo-imputacion'
import { esDeudaAnterior } from '@/lib/utils/deuda-anterior'

// Clientes con deuda asignados a un vendedor (incluye clientes de vendedores anteriores
// con el mismo codigo_vendedor, para cubrir reemplazos de personal)
export const getClientsBySeller = async (sellerId: string): Promise<Client[]> => {
  const sellerIds = await getSellerIdsByCodigo(sellerId)
  const { data } = await supabase
    .from('clientes')
    .select('*')
    .in('seller_id', sellerIds)
    .eq('activo', true)
    .gt('current_balance', 0)
    .order('current_balance', { ascending: false })

  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    dni: d.dni ?? '',
    cuit: d.cuit ?? '',
    email: d.email ?? '',
    phone: d.phone ?? '',
    address: d.address ?? '',
    taxCategory: d.tax_category ?? 'consumidor_final',
    creditLimit: Number(d.credit_limit) || 0,
    currentBalance: Number(d.current_balance) || 0,
    sellerId: d.seller_id ?? undefined,
    notes: d.notes ?? '',
    createdAt: new Date(d.created_at),
  }))
}

// Clientes con cuenta corriente (deuda actual o cancelada), filtrado por vendedor opcionalmente.
// Con `includeAll = true` devuelve TODOS los clientes del alcance (sin filtrar por saldo/límite),
// para que un vendedor vea toda la cartera de su código, no solo los que tienen deuda.
export const getDebtClients = async (
  sellerId?: string,
  includeAll = false,
  onlyActive = false,
): Promise<(Client & { sellerName?: string; hasDeudaAnterior?: boolean })[]> => {
  let query = supabase
    .from('clientes')
    .select('*')

  if (!includeAll) {
    query = query.or('current_balance.gt.0,credit_limit.gt.0')
  }
  if (onlyActive) {
    query = query.eq('activo', true)
  }
  query = query.order('current_balance', { ascending: false })

  if (sellerId) {
    const sellerIds = await getSellerIdsByCodigo(sellerId)
    query = query.in('seller_id', sellerIds)
  }

  const { data } = await query

  // Fecha de la deuda pendiente más antigua por cliente (entrada a cuenta corriente)
  const clientIds = (data ?? []).map((d: any) => d.id)
  const debtSinceMap: Record<string, Date> = {}
  const deudaAnteriorSet = new Set<string>()
  if (clientIds.length > 0) {
    const { data: debts } = await supabase
      .from('transacciones')
      .select('client_id, date, saldo, amount, description')
      .in('client_id', clientIds)
      .eq('type', 'debt')
      .order('date', { ascending: true })
      .limit(20000)
    for (const t of debts ?? []) {
      const saldo = t.saldo != null ? Number(t.saldo) : Number(t.amount)
      if (saldo <= SALDO_EPSILON) continue
      // Orden ascendente: la primera deuda pendiente encontrada es la más antigua
      if (!debtSinceMap[t.client_id]) debtSinceMap[t.client_id] = new Date(t.date)
      if (esDeudaAnterior(t.description)) deudaAnteriorSet.add(t.client_id)
    }
  }

  // Obtener nombres de vendedores si hay seller_ids
  const sellerIds = [...new Set((data ?? []).map((d: any) => d.seller_id).filter(Boolean))]
  let sellerMap: Record<string, string> = {}
  if (sellerIds.length > 0) {
    const { data: sellers } = await supabase
      .from('vendedores')
      .select('id, name')
      .in('id', sellerIds)
    for (const s of sellers ?? []) {
      sellerMap[s.id] = s.name
    }
  }

  return (data ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    dni: d.dni ?? '',
    cuit: d.cuit ?? '',
    email: d.email ?? '',
    phone: d.phone ?? '',
    address: d.address ?? '',
    taxCategory: d.tax_category ?? 'consumidor_final',
    creditLimit: Number(d.credit_limit) || 0,
    currentBalance: Number(d.current_balance) || 0,
    currentBalanceMayorista: Number(d.current_balance_mayorista) || 0,
    sellerId: d.seller_id ?? undefined,
    sellerName: d.seller_id ? (sellerMap[d.seller_id] || undefined) : undefined,
    debtClassification: d.debt_classification ?? 'normal',
    diaCobro: d.dia_cobro ?? undefined,
    debtSince: debtSinceMap[d.id] ?? undefined,
    hasDeudaAnterior: deudaAnteriorSet.has(d.id),
    activo: d.activo ?? true,
    notes: d.notes ?? '',
    createdAt: new Date(d.created_at),
  }))
}

function mapComprobante(d: any): ComprobantePago {
  return {
    id: d.id,
    clientId: d.client_id,
    clientName: d.clientes?.name ?? undefined,
    sellerId: d.seller_id,
    sellerName: d.vendedores?.name ?? undefined,
    amount: Number(d.amount),
    notes: d.notes ?? undefined,
    fileUrl: d.file_url,
    fileName: d.file_name ?? undefined,
    status: d.status,
    rejectionReason: d.rejection_reason ?? undefined,
    reviewedAt: d.reviewed_at ? new Date(d.reviewed_at) : undefined,
    reviewedBy: d.reviewed_by ?? undefined,
    transactionId: d.transaction_id ?? undefined,
    createdAt: new Date(d.created_at),
    viaCobrador: d.via_cobrador ?? false,
    autorizado: d.autorizado ?? false,
    autorizadoBy: d.autorizado_by ?? undefined,
    autorizadoAt: d.autorizado_at ? new Date(d.autorizado_at) : undefined,
  }
}

// Subir comprobante de pago
export const uploadComprobante = async (data: {
  clientId: string
  sellerId: string
  amount: number
  notes?: string
  file: File
}): Promise<ComprobantePago> => {
  // Subir archivo a storage
  const ext = data.file.name.split('.').pop() || 'jpg'
  const path = `${data.sellerId}/${Date.now()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('comprobantes')
    .upload(path, data.file, { upsert: false })

  if (uploadError) throw new Error(`Error subiendo archivo: ${uploadError.message}`)

  const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(path)
  const fileUrl = urlData.publicUrl

  // Crear registro
  const docId = await generateReadableId('comprobantes_pago', 'comp', `${data.clientId}`)
  await supabase.from('comprobantes_pago').insert({
    id: docId,
    client_id: data.clientId,
    seller_id: data.sellerId,
    amount: data.amount,
    notes: data.notes || null,
    file_url: fileUrl,
    file_name: data.file.name,
    status: 'pending',
  })

  return {
    id: docId,
    clientId: data.clientId,
    sellerId: data.sellerId,
    amount: data.amount,
    notes: data.notes,
    fileUrl,
    fileName: data.file.name,
    status: 'pending',
    createdAt: new Date(),
  }
}

// Obtener comprobantes con filtros
export const getComprobantes = async (filters?: {
  status?: string
  sellerId?: string
}): Promise<ComprobantePago[]> => {
  try {
    let query = supabase
      .from('comprobantes_pago')
      .select('*, clientes(name), vendedores(name)')
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    if (filters?.sellerId) {
      query = query.eq('seller_id', filters.sellerId)
    }

    const { data, error } = await query
    if (error) return []
    return await adjuntarImputacion((data ?? []).map(mapComprobante))
  } catch {
    return []
  }
}

// Para los cobros de cobrador pendientes de verificación: resuelve qué factura pagan
// (pago.debt_id → deuda.sale_id → venta.remito_number). Pago sin debt_id = "A cuenta".
async function adjuntarImputacion(comps: ComprobantePago[]): Promise<ComprobantePago[]> {
  const txIds = comps
    .filter((c) => c.viaCobrador && !c.autorizado && c.status === 'approved' && c.transactionId)
    .map((c) => c.transactionId as string)
  if (txIds.length === 0) return comps

  const { data: pagos } = await supabase.from('transacciones').select('id, debt_id').in('id', txIds)
  const debtIds = [...new Set((pagos ?? []).map((p: any) => p.debt_id).filter(Boolean))]
  const { data: deudas } = debtIds.length
    ? await supabase.from('transacciones').select('id, sale_id, description, date').in('id', debtIds)
    : { data: [] as any[] }
  const saleIds = [...new Set((deudas ?? []).map((d: any) => d.sale_id).filter(Boolean))]
  const { data: ventas } = saleIds.length
    ? await supabase.from('ventas').select('id, remito_number').in('id', saleIds)
    : { data: [] as any[] }

  const remitoBySale = new Map((ventas ?? []).map((v: any) => [v.id, v.remito_number]))
  const deudaById = new Map((deudas ?? []).map((d: any) => [d.id, d]))
  const imputadoByTx = new Map<string, string>()
  for (const p of pagos ?? []) {
    if (!p.debt_id) { imputadoByTx.set(p.id, 'A cuenta'); continue }
    const deuda = deudaById.get(p.debt_id)
    if (!deuda) continue
    const remito = deuda.sale_id ? remitoBySale.get(deuda.sale_id) : undefined
    imputadoByTx.set(
      p.id,
      remito
        ? `Remito N° ${remito}`
        : esDeudaAnterior(deuda.description)
          ? `Deuda anterior ${new Date(deuda.date).toLocaleDateString('es-AR')}`
          : deuda.description || 'Deuda',
    )
  }

  return comps.map((c) =>
    c.transactionId && imputadoByTx.has(c.transactionId)
      ? { ...c, imputadoA: imputadoByTx.get(c.transactionId) }
      : c,
  )
}

// Comprobantes de un vendedor
export const getComprobantesBySeller = async (sellerId: string): Promise<ComprobantePago[]> => {
  try {
    const sellerIds = await getSellerIdsByCodigo(sellerId)
    const { data, error } = await supabase
      .from('comprobantes_pago')
      .select('*, clientes(name), vendedores(name)')
      .in('seller_id', sellerIds)
      .order('created_at', { ascending: false })

    if (error) return []
    return (data ?? []).map(mapComprobante)
  } catch {
    return []
  }
}

// Sube un comprobante asociado a un pago que un admin acaba de registrar
// (transferencia). No es un cobro de cobrador: queda como constancia adjunta,
// sin flujo de verificación (via_cobrador = false, ya autorizado).
export const uploadComprobantePagoAdmin = async (data: {
  clientId: string
  amount: number
  notes?: string
  file: File
  transactionId: string
  reviewedBy: string
}): Promise<ComprobantePago> => {
  const ext = data.file.name.split('.').pop() || 'jpg'
  const path = `admin/${Date.now()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('comprobantes')
    .upload(path, data.file, { upsert: false })

  if (uploadError) throw new Error(`Error subiendo archivo: ${uploadError.message}`)

  const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(path)
  const fileUrl = urlData.publicUrl

  const docId = await generateReadableId('comprobantes_pago', 'comp', `${data.clientId}`)
  const reviewedAt = new Date()
  await supabase.from('comprobantes_pago').insert({
    id: docId,
    client_id: data.clientId,
    seller_id: null,
    amount: data.amount,
    notes: data.notes || null,
    file_url: fileUrl,
    file_name: data.file.name,
    status: 'approved',
    reviewed_at: reviewedAt.toISOString(),
    reviewed_by: data.reviewedBy,
    transaction_id: data.transactionId,
    via_cobrador: false,
    autorizado: true,
  })

  return {
    id: docId,
    clientId: data.clientId,
    sellerId: undefined,
    amount: data.amount,
    notes: data.notes,
    fileUrl,
    fileName: data.file.name,
    status: 'approved',
    reviewedAt,
    reviewedBy: data.reviewedBy,
    transactionId: data.transactionId,
    createdAt: reviewedAt,
    viaCobrador: false,
    autorizado: true,
  }
}

// Deja constancia de un pago que el cobrador acaba de registrar (el pago/transacción
// y el descuento de saldo ya se hicieron via registerCashPayment). Queda pendiente de
// autorización del admin ("Verificar pago"), tenga o no comprobante adjunto (ej: efectivo).
export const uploadComprobanteAprobado = async (data: {
  clientId: string
  sellerId: string
  amount: number
  notes?: string
  file?: File
  transactionId: string
  reviewedBy: string
}): Promise<ComprobantePago> => {
  let fileUrl = ''
  let fileName: string | undefined

  if (data.file) {
    const ext = data.file.name.split('.').pop() || 'jpg'
    const path = `${data.sellerId}/${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('comprobantes')
      .upload(path, data.file, { upsert: false })

    if (uploadError) throw new Error(`Error subiendo archivo: ${uploadError.message}`)

    const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(path)
    fileUrl = urlData.publicUrl
    fileName = data.file.name
  }

  const docId = await generateReadableId('comprobantes_pago', 'comp', `${data.clientId}`)
  const reviewedAt = new Date()
  const { error: insertError } = await supabase.from('comprobantes_pago').insert({
    id: docId,
    client_id: data.clientId,
    seller_id: data.sellerId,
    amount: data.amount,
    notes: data.notes || null,
    file_url: fileUrl,
    file_name: fileName || null,
    status: 'approved',
    reviewed_at: reviewedAt.toISOString(),
    reviewed_by: data.reviewedBy,
    transaction_id: data.transactionId,
    via_cobrador: true,
  })
  if (insertError) throw new Error(`Error registrando cobro pendiente de verificación: ${insertError.message}`)

  return {
    id: docId,
    clientId: data.clientId,
    sellerId: data.sellerId,
    amount: data.amount,
    notes: data.notes,
    fileUrl,
    fileName,
    status: 'approved',
    reviewedAt,
    reviewedBy: data.reviewedBy,
    transactionId: data.transactionId,
    createdAt: reviewedAt,
    viaCobrador: true,
    autorizado: false,
  }
}

/** Admin marca como revisado/autorizado un cobro registrado por un cobrador (el pago ya estaba aplicado). */
export const authorizeComprobanteCobrador = async (id: string, adminName: string): Promise<void> => {
  const { error } = await supabase
    .from('comprobantes_pago')
    .update({
      autorizado: true,
      autorizado_by: adminName,
      autorizado_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(`No se pudo verificar el cobro: ${error.message}`)
}

/**
 * Deshace una verificación hecha por error: el cobro vuelve a "Verificar pago".
 * Solo quita la constancia de revisión; el pago sigue aplicado como estaba.
 */
export const unauthorizeComprobanteCobrador = async (id: string): Promise<void> => {
  const { data, error } = await supabase
    .from('comprobantes_pago')
    .update({ autorizado: false, autorizado_by: null, autorizado_at: null })
    .eq('id', id)
    .eq('autorizado', true)
    .select('id')
  if (error) throw new Error(`No se pudo volver a verificación: ${error.message}`)
  if (!data || data.length === 0) throw new Error('Este cobro ya no está verificado')
}

/**
 * Admin rechaza un cobro de cobrador: anula el pago (revierte saldo, no lo borra)
 * y deja el comprobante marcado como rechazado con el motivo.
 */
export const voidComprobanteCobrador = async (id: string, adminName: string, motivo: string): Promise<void> => {
  const { data: comp } = await supabase.from('comprobantes_pago').select('*').eq('id', id).single()
  if (!comp) throw new Error('Comprobante no encontrado')

  if (comp.transaction_id) {
    const { voidPayment } = await import('@/services/payments-service')
    await voidPayment(comp.transaction_id, motivo, adminName)
  }

  await supabase
    .from('comprobantes_pago')
    .update({
      status: 'rejected',
      rejection_reason: motivo,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminName,
    })
    .eq('id', id)
}

// Admin aprueba comprobante → registra pago
export const approveComprobante = async (id: string, reviewedBy: string): Promise<ComprobantePago> => {
  // Verificar que sigue pendiente
  const { data: comp } = await supabase
    .from('comprobantes_pago')
    .select('*, clientes(name, current_balance)')
    .eq('id', id)
    .single()

  if (!comp) throw new Error('Comprobante no encontrado')
  if (comp.status !== 'pending') throw new Error('Comprobante ya fue procesado')

  // Tomar el comprobante (pending → approved) antes de registrar nada: si se aprueba dos
  // veces (doble click, dos admins), solo uno pasa y el pago no se duplica.
  const { data: tomado, error: lockErr } = await supabase
    .from('comprobantes_pago')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: reviewedBy })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
  if (lockErr) throw new Error(`No se pudo aprobar el comprobante: ${lockErr.message}`)
  if (!tomado || tomado.length === 0) throw new Error('Comprobante ya fue procesado')

  // Primero el movimiento y después el saldo (antes el saldo bajaba aunque el pago no
  // se grabara). Si el movimiento falla, el comprobante vuelve a quedar pendiente.
  const clientName = comp.clientes?.name || 'pago'
  let docId: string
  try {
    docId = await generateReadableId('transacciones', 'transaccion', clientName)
    const { error: txErr } = await supabase.from('transacciones').insert({
      id: docId,
      client_id: comp.client_id,
      type: 'payment',
      amount: comp.amount,
      description: `Pago con comprobante (${comp.file_name || 'archivo'})`,
      date: new Date().toISOString(),
    })
    if (txErr) throw new Error(txErr.message)
  } catch (e) {
    await supabase.from('comprobantes_pago')
      .update({ status: 'pending', reviewed_at: null, reviewed_by: null })
      .eq('id', id)
    throw new Error(`No se pudo registrar el pago: ${e instanceof Error ? e.message : String(e)}`)
  }

  await supabase.from('comprobantes_pago').update({ transaction_id: docId }).eq('id', id)

  const { data: cr, error: crErr } = await supabase
    .from('clientes')
    .select('current_balance')
    .eq('id', comp.client_id)
    .single()
  if (crErr) throw new Error(`Pago registrado, pero no se pudo leer el saldo del cliente: ${crErr.message}`)
  const { error: balErr } = await supabase
    .from('clientes')
    .update({ current_balance: (Number(cr.current_balance) || 0) - Number(comp.amount) })
    .eq('id', comp.client_id)
  if (balErr) throw new Error(`Pago registrado, pero no se pudo actualizar el saldo del cliente: ${balErr.message}`)

  // Saldos por boleta: mismo replay que el resto de los pagos (FIFO + imputaciones).
  try {
    const { recomputarSaldosDeudas } = await import('@/services/payments-service')
    await recomputarSaldosDeudas(comp.client_id, 'minorista')
  } catch { /* columna saldo aún no creada — no bloquear la aprobación */ }

  return {
    ...mapComprobante(comp),
    status: 'approved',
    reviewedAt: new Date(),
    reviewedBy,
    transactionId: docId,
  }
}

// Admin rechaza comprobante
export const rejectComprobante = async (id: string, reason: string, reviewedBy: string): Promise<ComprobantePago> => {
  const { data: comp } = await supabase
    .from('comprobantes_pago')
    .select('*, clientes(name), vendedores(name)')
    .eq('id', id)
    .single()

  if (!comp) throw new Error('Comprobante no encontrado')
  if (comp.status !== 'pending') throw new Error('Comprobante ya fue procesado')

  await supabase.from('comprobantes_pago').update({
    status: 'rejected',
    rejection_reason: reason,
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewedBy,
  }).eq('id', id)

  return {
    ...mapComprobante(comp),
    status: 'rejected',
    rejectionReason: reason,
    reviewedAt: new Date(),
    reviewedBy,
  }
}
