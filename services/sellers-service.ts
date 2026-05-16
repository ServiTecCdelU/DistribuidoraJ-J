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
    employeeType: d.employee_type ?? 'vendedor',
    commissionRate: Number(d.commission_rate) || 10,
    transportistaCommissionRate: d.transportista_commission_rate ? Number(d.transportista_commission_rate) : undefined,
    isActive: d.is_active ?? true,
    totalSales: Number(d.total_sales) || 0,
    totalCommission: Number(d.total_commission) || 0,
    createdAt: new Date(d.created_at),
  }
}

function mapCommission(d: Record<string, any>): SellerCommission {
  return {
    id: d.id,
    sellerId: d.seller_id,
    saleId: d.sale_id,
    saleNumber: d.sale_number ?? undefined,
    clientName: d.seller_name ?? undefined,
    saleTotal: Number(d.sale_total),
    commissionRate: Number(d.commission_rate),
    commissionAmount: Number(d.commission_amount),
    isPaid: d.is_paid ?? false,
    paidAt: d.paid_at ? new Date(d.paid_at) : undefined,
    createdAt: new Date(d.created_at),
  }
}

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

  return updated
}

export const deleteSeller = async (id: string): Promise<void> => {
  await supabase.from('vendedores').delete().eq('id', id)
}

export const getSellerCommissions = async (sellerId: string): Promise<SellerCommission[]> => {
  const { data } = await supabase
    .from('comisiones')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })

  return (data ?? []).map(mapCommission)
}

export const getAllCommissions = async (): Promise<SellerCommission[]> => {
  const { data } = await supabase
    .from('comisiones')
    .select('*')
    .order('created_at', { ascending: false })

  return (data ?? []).map(mapCommission)
}

export const payCommission = async (commissionId: string): Promise<SellerCommission> => {
  const { data } = await supabase
    .from('comisiones')
    .update({ is_paid: true, paid_at: new Date().toISOString() })
    .eq('id', commissionId)
    .select()
    .single()

  if (!data) throw new Error('Commission not found')
  return mapCommission(data)
}

export const payAllCommissions = async (sellerId: string): Promise<void> => {
  await supabase
    .from('comisiones')
    .update({ is_paid: true, paid_at: new Date().toISOString() })
    .eq('seller_id', sellerId)
    .eq('is_paid', false)
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
  // 1. Obtener pendientes
  const { data: pendientes } = await supabase
    .from('comisiones')
    .select('id, commission_amount')
    .eq('seller_id', sellerId)
    .eq('is_paid', false)

  if (!pendientes || pendientes.length === 0) {
    throw new Error('No hay comisiones pendientes para resetear')
  }

  const monto = pendientes.reduce((sum, c) => sum + (Number(c.commission_amount) || 0), 0)

  // 2. Marcar todas como pagadas
  await supabase
    .from('comisiones')
    .update({ is_paid: true, paid_at: new Date().toISOString() })
    .eq('seller_id', sellerId)
    .eq('is_paid', false)

  // 3. Registrar el pago
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
