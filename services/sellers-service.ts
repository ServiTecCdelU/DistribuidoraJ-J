//services/sellers-service.ts
import { supabase } from '@/lib/supabase'
import type { Seller, SellerCommission } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

function mapSeller(d: Record<string, any>): Seller {
  return {
    id: d.id,
    name: d.name,
    email: d.email ?? '',
    phone: d.phone ?? '',
    codigoVendedor: d.codigo_vendedor ?? undefined,
    employeeType: d.employee_type ?? 'vendedor',
    commissionRate: Number(d.commission_rate) || 10,
    transportistaCommissionRate: d.transportista_commission_rate ? Number(d.transportista_commission_rate) : undefined,
    isActive: d.is_active ?? true,
    totalSales: Number(d.total_sales) || 0,
    totalCommission: Number(d.total_commission) || 0,
    createdAt: new Date(d.created_at),
  }
}

// mapCommission removido — comisiones se derivan de ventas via commissions-service

export const getSellers = async (): Promise<Seller[]> => {
  const { data } = await supabase
    .from('vendedores')
    .select('*')
    .order('created_at', { ascending: false })

  return (data ?? []).map(mapSeller)
}

export const getSellerById = async (id: string): Promise<Seller | undefined> => {
  const { data } = await supabase
    .from('vendedores')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  return data ? mapSeller(data) : undefined
}

export const createSeller = async (
  seller: Omit<Seller, 'id' | 'createdAt' | 'totalSales' | 'totalCommission'>
): Promise<Seller> => {
  const docId = await generateReadableId('vendedores', 'vendedor', seller.name)
  const row: Record<string, any> = {
    id: docId,
    name: seller.name,
    email: seller.email || null,
    phone: seller.phone || null,
    codigo_vendedor: seller.codigoVendedor || null,
    employee_type: seller.employeeType,
    commission_rate: seller.commissionRate,
    transportista_commission_rate: seller.transportistaCommissionRate ?? null,
    is_active: seller.isActive,
    total_sales: 0,
    total_commission: 0,
  }
  await supabase.from('vendedores').insert(row)
  return {
    ...seller,
    id: docId,
    totalSales: 0,
    totalCommission: 0,
    createdAt: new Date(),
  }
}

export const updateSeller = async (id: string, updates: Partial<Seller>): Promise<Seller> => {
  const mapped: Record<string, any> = {}
  if (updates.name !== undefined) mapped.name = updates.name
  if (updates.email !== undefined) mapped.email = updates.email
  if (updates.phone !== undefined) mapped.phone = updates.phone
  if (updates.employeeType !== undefined) mapped.employee_type = updates.employeeType
  if (updates.commissionRate !== undefined) mapped.commission_rate = updates.commissionRate
  if (updates.transportistaCommissionRate !== undefined) mapped.transportista_commission_rate = updates.transportistaCommissionRate
  if (updates.isActive !== undefined) mapped.is_active = updates.isActive
  if (updates.totalSales !== undefined) mapped.total_sales = updates.totalSales
  if (updates.totalCommission !== undefined) mapped.total_commission = updates.totalCommission
  if (updates.codigoVendedor !== undefined) mapped.codigo_vendedor = updates.codigoVendedor || null

  await supabase.from('vendedores').update(mapped).eq('id', id)
  const updated = await getSellerById(id)
  if (!updated) throw new Error('Seller not found')

  // Si cambio el employeeType, actualizar tambien el usuario vinculado
  if (updates.employeeType) {
    await supabase
      .from('usuarios')
      .update({ employee_type: updates.employeeType })
      .eq('seller_id', id)
  }

  // Propagar el estado activo/inactivo al usuario de login vinculado:
  // un vendedor inactivo no debe poder entrar al sistema.
  if (updates.isActive !== undefined) {
    await supabase
      .from('usuarios')
      .update({ is_active: updates.isActive })
      .eq('seller_id', id)
  }

  return updated
}

export const deleteSeller = async (id: string): Promise<void> => {
  // Desvincular referencias antes de borrar
  await Promise.all([
    supabase.from('usuarios').update({ seller_id: null }).eq('seller_id', id),
    supabase.from('clientes').update({ seller_id: null }).eq('seller_id', id),
  ])

  const { error } = await supabase.from('vendedores').delete().eq('id', id)
  if (error) {
    // Si hay FKs que impiden borrar, hacer soft-delete
    const { error: softErr } = await supabase
      .from('vendedores')
      .update({ is_active: false })
      .eq('id', id)
    if (softErr) throw new Error('No se pudo eliminar el vendedor')
    // Bloquear tambien el login del usuario vinculado
    await supabase.from('usuarios').update({ is_active: false }).eq('seller_id', id)
  }
}

export { getCommissionsBySeller as getSellerCommissions } from '@/services/commissions-service'

export const getAllCommissions = async (): Promise<SellerCommission[]> => {
  // Traer todos los vendedores activos y derivar comisiones de ventas
  const { getCommissionsBySeller } = await import('@/services/commissions-service')
  const { data: sellers } = await supabase
    .from('vendedores')
    .select('id')
  if (!sellers) return []
  const all = await Promise.all(sellers.map(s => getCommissionsBySeller(s.id)))
  return all.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

// ─── Reseteo de comisiones con registro de pago ──────────────────────────────

export interface PagoComision {
  id: string
  sellerId: string
  sellerName: string
  monto: number
  cantidadComisiones: number
  createdAt: Date
  nota?: string
}

function mapPago(d: Record<string, any>): PagoComision {
  return {
    id: d.id,
    sellerId: d.seller_id,
    sellerName: d.seller_name ?? '',
    monto: Number(d.monto) || 0,
    cantidadComisiones: Number(d.cantidad_comisiones) || 0,
    createdAt: new Date(d.created_at),
    nota: d.nota ?? undefined,
  }
}

export const resetCommissions = async (sellerId: string, sellerName: string, nota?: string): Promise<PagoComision> => {
  const { getCommissionsBySeller } = await import('@/services/commissions-service')
  const commissions = await getCommissionsBySeller(sellerId)
  const pendientes = commissions.filter(c => !c.isPaid)

  if (pendientes.length === 0) {
    throw new Error('No hay comisiones pendientes para resetear')
  }

  const monto = pendientes.reduce((sum, c) => sum + c.commissionAmount, 0)

  // Resetear comisiones y ventas pendientes del vendedor
  await supabase
    .from('vendedores')
    .update({ total_commission: 0, total_sales: 0 })
    .eq('id', sellerId)

  // Registrar el pago — el timestamp actúa como cutoff para marcar comisiones como pagadas
  const pagoId = `pago_${sellerId}_${Date.now()}`
  const row = {
    id: pagoId,
    seller_id: sellerId,
    seller_name: sellerName,
    monto,
    cantidad_comisiones: pendientes.length,
    nota: nota || null,
  }

  const { data, error } = await supabase
    .from('pagos_comisiones')
    .insert(row)
    .select()
    .single()

  if (error) throw error
  return mapPago(data)
}

export const getPagosComisiones = async (sellerId: string): Promise<PagoComision[]> => {
  const { data, error } = await supabase
    .from('pagos_comisiones')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapPago)
}
