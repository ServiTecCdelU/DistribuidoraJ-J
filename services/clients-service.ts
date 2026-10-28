import { supabase } from '@/lib/supabase'
import type { Client, Transaction } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

export interface DeudaDesde {
  debtSince: Date
  deudaAnterior: boolean
}

// Deuda pendiente más antigua por cliente (y si tiene deuda anterior), calculada en la base
// (vista cliente_deuda_desde). Antes se bajaban todas las deudas con .in(cientos de ids) y
// .limit(20000) para recorrerlas en el navegador, y PostgREST cortaba en 1000 filas.
export const getDeudaDesdeMap = async (): Promise<Map<string, DeudaDesde>> => {
  const { data, error } = await supabase
    .from('cliente_deuda_desde')
    .select('client_id, debt_since, deuda_anterior')
  if (error) throw new Error(`No se pudo leer la antigüedad de las deudas: ${error.message}`)
  return new Map(
    (data ?? []).map((d: any) => [d.client_id as string, { debtSince: new Date(d.debt_since), deudaAnterior: !!d.deuda_anterior }]),
  )
}

// Cantidad de compras por cliente (vista compras_por_cliente). Antes el export de Clientes
// bajaba todas las ventas, con sus PDFs, solo para contarlas.
export const getComprasPorCliente = async (): Promise<Map<string, number>> => {
  const { data, error } = await supabase.from('compras_por_cliente').select('client_id, compras')
  if (error) throw new Error(`No se pudieron contar las compras: ${error.message}`)
  return new Map((data ?? []).map((d: any) => [d.client_id as string, Number(d.compras) || 0]))
}

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
    activo: d.activo ?? true,
    cuentaCorrienteHabilitada: d.cuenta_corriente_habilitada ?? true,
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
  if (clients.some((c) => c.currentBalance > 0)) {
    const deudaDesde = await getDeudaDesdeMap()
    for (const c of clients) {
      if (c.currentBalance > 0 && deudaDesde.has(c.id)) c.debtSince = deudaDesde.get(c.id)!.debtSince
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
    cuenta_corriente_habilitada: client.cuentaCorrienteHabilitada ?? false,
  })
  return {
    ...client,
    cuentaCorrienteHabilitada: client.cuentaCorrienteHabilitada ?? false,
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
  if (updates.activo !== undefined) mapped.activo = updates.activo
  if (updates.cuentaCorrienteHabilitada !== undefined) mapped.cuenta_corriente_habilitada = updates.cuentaCorrienteHabilitada

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

// Sin el PDF del recibo (base64): cuenta corriente recarga los movimientos después de cada
// acción. `tiene_recibo_pdf` (columna calculada) dice si hay PDF; se baja con getReciboPdf.
const TX_COLUMNS =
  'id, client_id, type, amount, description, sale_id, date, created_at, cuenta, recibo_numero, ' +
  'recibo_generado_at, saldo, debt_id, anulado, anulado_motivo, anulado_by, anulado_at, foto_url, afecta_saldo, tiene_recibo_pdf'

/** PDF del recibo de un pago (on-demand). */
export const getReciboPdf = async (txId: string): Promise<string | undefined> => {
  const { data, error } = await supabase.from('transacciones').select('recibo_pdf_base64').eq('id', txId).maybeSingle()
  if (error) throw new Error(`No se pudo bajar el recibo: ${error.message}`)
  return data?.recibo_pdf_base64 ?? undefined
}

export const getClientTransactions = async (clientId: string): Promise<Transaction[]> => {
  const { data } = await supabase
    .from('transacciones')
    .select(TX_COLUMNS)
    .eq('client_id', clientId)
    .order('date', { ascending: false })

  return ((data ?? []) as Record<string, any>[]).map((d) => ({
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
    fotoUrl: d.foto_url ?? undefined,
    reciboNumero: d.recibo_numero ?? undefined,
    tieneReciboPdf: d.tiene_recibo_pdf ?? false,
    anulado: d.anulado ?? false,
    anuladoMotivo: d.anulado_motivo ?? undefined,
    anuladoBy: d.anulado_by ?? undefined,
    anuladoAt: d.anulado_at ? new Date(d.anulado_at) : undefined,
    afectaSaldo: d.afecta_saldo ?? true,
  }))
}
