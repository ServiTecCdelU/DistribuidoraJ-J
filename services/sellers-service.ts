//services/sellers-service.ts
import { supabase } from '@/lib/supabase'
import type { Seller, SellerCommission } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'
import { calcularSaldo, calcularPago } from '@/lib/utils/comision-pago'

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
    maxDiscount: d.descuento_maximo != null ? Number(d.descuento_maximo) : 6,
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

  const sellers = (data ?? []).map(mapSeller)

  // Derivar totales pendientes desde ventas (fuente de verdad), igual que el detalle.
  // Evita que la lista quede desincronizada de las comisiones reales.
  const { getCommissionsBySeller } = await import('@/services/commissions-service')
  return Promise.all(
    sellers.map(async (s) => {
      const commissions = await getCommissionsBySeller(s.id)
      const pendientes = commissions.filter((c) => !c.isPaid)
      return {
        ...s,
        totalSales: pendientes.reduce((sum, c) => sum + c.saleTotal, 0),
        totalCommission: pendientes.reduce((sum, c) => sum + c.commissionAmount, 0),
      }
    }),
  )
}

/**
 * Devuelve los ids de vendedores que comparten el mismo codigo_vendedor que `sellerId`
 * (incluye a `sellerId`). Permite que un vendedor nuevo con el mismo código vea la
 * cartera de clientes del que se fue, sin tener que reasignar seller_id en la BD.
 * Si el vendedor no tiene codigo_vendedor cargado, devuelve solo su propio id.
 */
export const getSellerIdsByCodigo = async (sellerId: string): Promise<string[]> => {
  const { data: seller } = await supabase
    .from('vendedores')
    .select('codigo_vendedor')
    .eq('id', sellerId)
    .maybeSingle()

  const codigo = seller?.codigo_vendedor
  if (!codigo) return [sellerId]

  const { data: related } = await supabase
    .from('vendedores')
    .select('id')
    .eq('codigo_vendedor', codigo)

  const ids = (related ?? []).map((r) => r.id)
  return ids.length > 0 ? ids : [sellerId]
}

export const getSellerById = async (id: string): Promise<Seller | undefined> => {
  const { data } = await supabase
    .from('vendedores')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!data) return undefined
  const seller = mapSeller(data)
  const { getCommissionsBySeller } = await import('@/services/commissions-service')
  const pendientes = (await getCommissionsBySeller(seller.id)).filter((c) => !c.isPaid)
  return {
    ...seller,
    totalSales: pendientes.reduce((sum, c) => sum + c.saleTotal, 0),
    totalCommission: pendientes.reduce((sum, c) => sum + c.commissionAmount, 0),
  }
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
    descuento_maximo: seller.maxDiscount ?? 6,
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
  if (updates.maxDiscount !== undefined) mapped.descuento_maximo = updates.maxDiscount
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
  monto: number              // devengado del período (comisiones − devoluciones)
  montoPagado: number        // lo que efectivamente se entregó
  saldoAnterior: number      // deuda arrastrada al momento del pago
  saldoRestante: number      // saldoAnterior + monto − montoPagado
  fechaPago: Date            // fecha real del pago (puede ser retroactiva)
  cantidadComisiones: number
  createdAt: Date
  nota?: string
  periodoDesde?: Date
  periodoHasta?: Date
}

function mapPago(d: Record<string, any>): PagoComision {
  const monto = Number(d.monto) || 0
  return {
    id: d.id,
    sellerId: d.seller_id,
    sellerName: d.seller_name ?? '',
    monto,
    // Pagos legacy sin monto_pagado: se asume que se pagó exactamente lo devengado.
    montoPagado: d.monto_pagado != null ? Number(d.monto_pagado) : monto,
    saldoAnterior: Number(d.saldo_anterior) || 0,
    saldoRestante: Number(d.saldo_restante) || 0,
    fechaPago: new Date(d.fecha_pago ?? d.created_at),
    cantidadComisiones: Number(d.cantidad_comisiones) || 0,
    createdAt: new Date(d.created_at),
    nota: d.nota ?? undefined,
    periodoDesde: d.periodo_desde ? new Date(d.periodo_desde) : undefined,
    periodoHasta: d.periodo_hasta ? new Date(d.periodo_hasta) : undefined,
  }
}

/**
 * Saldo pendiente arrastrado del empleado: todo lo devengado y registrado en pagos
 * menos todo lo efectivamente entregado. Positivo = se le debe; negativo = adelanto.
 * Se recalcula siempre sobre todos los pagos (no incremental), para que no se
 * desfase si se edita o borra un registro.
 */
export const getSaldoComisiones = async (sellerId: string): Promise<number> => {
  const pagos = await getPagosComisiones(sellerId)
  return calcularSaldo(pagos)
}

/**
 * Paga exactamente las comisiones PENDIENTES cuya fecha cae en [desde, hasta].
 * Registra un pago con el período pagado; a partir de ahí esas comisiones
 * quedan cubiertas (ver getCommissionsBySeller).
 */
export interface PagoComisionInput {
  /** Lo que efectivamente se entrega. Si se omite, se paga el devengado + saldo anterior. */
  montoPagado?: number
  /** Fecha real del pago. Si se omite, ahora. */
  fechaPago?: Date
  nota?: string
}

export const pagarComisionesPeriodo = async (
  sellerId: string,
  sellerName: string,
  desde: Date,
  hasta: Date,
  input: PagoComisionInput = {},
): Promise<PagoComision> => {
  const { montoPagado, fechaPago, nota } = input
  const { getCommissionsBySeller } = await import('@/services/commissions-service')
  const commissions = await getCommissionsBySeller(sellerId)
  const desdeMs = desde.getTime()
  const hastaMs = hasta.getTime()
  const aPagar = commissions.filter(
    (c) => !c.isPaid && c.createdAt.getTime() >= desdeMs && c.createdAt.getTime() <= hastaMs,
  )

  if (aPagar.length === 0) {
    throw new Error('No hay comisiones pendientes en el período seleccionado')
  }

  const monto = aPagar.reduce((sum, c) => sum + c.commissionAmount, 0)

  const saldoAnterior = await getSaldoComisiones(sellerId)
  const { pagado, saldoRestante } = calcularPago(monto, saldoAnterior, montoPagado)

  const pagoId = `pago_${sellerId}_${Date.now()}`
  const row = {
    id: pagoId,
    seller_id: sellerId,
    seller_name: sellerName,
    monto,
    monto_pagado: pagado,
    saldo_anterior: saldoAnterior,
    saldo_restante: saldoRestante,
    fecha_pago: (fechaPago ?? new Date()).toISOString(),
    cantidad_comisiones: aPagar.length,
    nota: nota || null,
    periodo_desde: desde.toISOString(),
    periodo_hasta: hasta.toISOString(),
  }

  const { data, error } = await supabase
    .from('pagos_comisiones')
    .insert(row)
    .select()
    .single()

  if (error) throw error
  return mapPago(data)
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
    monto_pagado: monto,
    saldo_anterior: 0,
    saldo_restante: 0,
    fecha_pago: new Date().toISOString(),
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
    .order('fecha_pago', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapPago)
}
