import { supabase } from '@/lib/supabase'
import type { Client, Transaction } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

function mapClient(d: Record<string, any>): Client {
  return {
    id: d.id,
    codigo: d.codigo ?? undefined,
    codigoExterno: d.codigo_externo ?? undefined,
    name: d.name,
    dni: d.dni ?? '',
    cuit: d.cuit ?? '',
    email: d.email ?? '',
    phone: d.phone ?? '',
    address: d.address ?? '',
    addresses: Array.isArray(d.addresses)
      ? d.addresses.filter((a: any) => a && typeof a.address === 'string')
      : undefined,
    taxCategory: d.tax_category ?? 'consumidor_final',
    creditLimit: Number(d.credit_limit) || 0,
    currentBalance: Number(d.current_balance) || 0,
    currentBalanceMayorista: Number(d.current_balance_mayorista) || 0,
    sellerId: d.seller_id ?? undefined,
    debtClassification: d.debt_classification ?? 'normal',
    diaCobro: d.dia_cobro ?? undefined,
    notes: d.notes ?? '',
    createdAt: new Date(d.created_at),
  }
}

export const getClients = async (): Promise<Client[]> => {
  const { data } = await supabase
    .from('clientes')
    .select('*')
    .order('created_at', { ascending: false })

  const clients = (data ?? []).map(mapClient)

  // Fecha de la deuda pendiente más antigua por cliente (define la clasificación por días)
  const deudores = clients.filter((c) => c.currentBalance > 0).map((c) => c.id)
  if (deudores.length > 0) {
    const { data: debts } = await supabase
      .from('transacciones')
      .select('client_id, date, saldo, amount')
      .in('client_id', deudores)
      .eq('type', 'debt')
      .order('date', { ascending: true })
      .limit(20000)
    const debtSinceMap: Record<string, Date> = {}
    for (const t of debts ?? []) {
      const saldo = t.saldo != null ? Number(t.saldo) : Number(t.amount)
      if (saldo <= 0) continue
      if (!debtSinceMap[t.client_id]) debtSinceMap[t.client_id] = new Date(t.date)
    }
    for (const c of clients) {
      if (debtSinceMap[c.id]) c.debtSince = debtSinceMap[c.id]
    }
  }

  return clients
}

export const getClientById = async (id: string): Promise<Client | undefined> => {
  const { data } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  return data ? mapClient(data) : undefined
}

export const createClient = async (
  client: Omit<Client, 'id' | 'createdAt' | 'currentBalance'>
): Promise<Client> => {
  const docId = await generateReadableId('clientes', 'cliente', client.name)
  await supabase.from('clientes').insert({
    id: docId,
    name: client.name,
    email: client.email || null,
    phone: client.phone || null,
    dni: client.dni || null,
    cuit: client.cuit || null,
    tax_category: client.taxCategory ?? 'consumidor_final',
    credit_limit: client.creditLimit || 0,
    current_balance: 0,
    addresses: client.addresses ?? [],
    notes: client.notes ?? '',
    seller_id: client.sellerId || null,
    codigo_externo: client.codigoExterno || null,
    dia_cobro: client.diaCobro || null,
  })
  return {
    ...client,
    taxCategory: client.taxCategory ?? 'consumidor_final',
    currentBalance: 0,
    notes: client.notes ?? '',
    id: docId,
    createdAt: new Date(),
  }
}

export const updateClient = async (id: string, updates: Partial<Client>): Promise<Client> => {
  const mapped: Record<string, any> = {}
  if (updates.name !== undefined) mapped.name = updates.name
  if (updates.email !== undefined) mapped.email = updates.email
  if (updates.phone !== undefined) mapped.phone = updates.phone
  if (updates.dni !== undefined) mapped.dni = updates.dni
  if (updates.cuit !== undefined) mapped.cuit = updates.cuit
  if (updates.taxCategory !== undefined) mapped.tax_category = updates.taxCategory
  if (updates.creditLimit !== undefined) mapped.credit_limit = updates.creditLimit
  if (updates.currentBalance !== undefined) mapped.current_balance = updates.currentBalance
  if (updates.currentBalanceMayorista !== undefined) mapped.current_balance_mayorista = updates.currentBalanceMayorista
  if (updates.address !== undefined) mapped.address = updates.address
  if (updates.addresses !== undefined) mapped.addresses = updates.addresses
  if (updates.notes !== undefined) mapped.notes = updates.notes
  if (updates.sellerId !== undefined) mapped.seller_id = updates.sellerId || null
  if (updates.debtClassification !== undefined) mapped.debt_classification = updates.debtClassification
  if (updates.codigoExterno !== undefined) mapped.codigo_externo = updates.codigoExterno || null
  if (updates.diaCobro !== undefined) mapped.dia_cobro = updates.diaCobro || null

  await supabase.from('clientes').update(mapped).eq('id', id)
  const updated = await getClientById(id)
  if (!updated) throw new Error('Client not found')
  return updated
}

export const deleteClient = async (id: string): Promise<void> => {
  await supabase.from('clientes').delete().eq('id', id)
}

export const getClientsPaginated = async (
  pageSize: number = 50,
  lastDoc?: any,
): Promise<{ data: Client[]; lastDoc: any; hasMore: boolean }> => {
  const offset = lastDoc ?? 0
  const { data } = await supabase
    .from('clientes')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  const clients = (data ?? []).map(mapClient)
  return {
    data: clients,
    lastDoc: clients.length === pageSize ? offset + pageSize : null,
    hasMore: clients.length === pageSize,
  }
}

export const getClientTransactions = async (clientId: string): Promise<Transaction[]> => {
  const { data } = await supabase
    .from('transacciones')
    .select('*')
    .eq('client_id', clientId)
    .order('date', { ascending: false })

  return (data ?? []).map((d) => ({
    id: d.id,
    clientId: d.client_id,
    type: d.type as 'debt' | 'payment',
    amount: Number(d.amount),
    description: d.description ?? '',
    date: new Date(d.date),
    saleId: d.sale_id ?? undefined,
    cuenta: (d.cuenta as 'minorista' | 'mayorista') ?? 'minorista',
    saldo: d.saldo != null ? Number(d.saldo) : null,
    debtId: d.debt_id ?? undefined,
    reciboNumero: d.recibo_numero ?? undefined,
    reciboPdfBase64: d.recibo_pdf_base64 ?? undefined,
  }))
}
