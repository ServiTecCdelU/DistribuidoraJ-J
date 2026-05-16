import { supabase } from '@/lib/supabase'
import type { Client, ComprobantePago, Transaction } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

// Clientes con deuda asignados a un vendedor
export const getClientsBySeller = async (sellerId: string): Promise<Client[]> => {
  const { data } = await supabase
    .from('clientes')
    .select('*')
    .eq('seller_id', sellerId)
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

// Todos los clientes con deuda (para admin), opcionalmente filtrado por vendedor
export const getDebtClients = async (sellerId?: string): Promise<(Client & { sellerName?: string })[]> => {
  let query = supabase
    .from('clientes')
    .select('*')
    .gt('current_balance', 0)
    .order('current_balance', { ascending: false })

  if (sellerId) {
    query = query.eq('seller_id', sellerId)
  }

  const { data } = await query

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
    sellerId: d.seller_id ?? undefined,
    sellerName: d.seller_id ? (sellerMap[d.seller_id] || undefined) : undefined,
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
    return (data ?? []).map(mapComprobante)
  } catch {
    return []
  }
}

// Comprobantes de un vendedor
export const getComprobantesBySeller = async (sellerId: string): Promise<ComprobantePago[]> => {
  try {
    const { data, error } = await supabase
      .from('comprobantes_pago')
      .select('*, clientes(name), vendedores(name)')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })

    if (error) return []
    return (data ?? []).map(mapComprobante)
  } catch {
    return []
  }
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

  // Decrementar saldo del cliente
  const newBalance = (Number(comp.clientes?.current_balance) || 0) - Number(comp.amount)
  await supabase
    .from('clientes')
    .update({ current_balance: newBalance })
    .eq('id', comp.client_id)

  // Crear transacción
  const clientName = comp.clientes?.name || 'pago'
  const docId = await generateReadableId('transacciones', 'transaccion', clientName)
  await supabase.from('transacciones').insert({
    id: docId,
    client_id: comp.client_id,
    type: 'payment',
    amount: comp.amount,
    description: `Pago con comprobante (${comp.file_name || 'archivo'})`,
    date: new Date().toISOString(),
  })

  // Actualizar comprobante
  await supabase.from('comprobantes_pago').update({
    status: 'approved',
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewedBy,
    transaction_id: docId,
  }).eq('id', id)

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
