import { supabase } from '@/lib/supabase'
import type { SellerCommission } from '@/lib/types'
import { imputarComisiones } from '@/lib/utils/comision-imputacion'

/**
 * Deriva comisiones desde la tabla `ventas` (source of truth).
 * El estado de pago sale de imputar FIFO el total efectivamente pagado
 * (`pagos_comisiones.monto_pagado`) sobre las comisiones ordenadas de la más
 * vieja a la más nueva: las que alcanza quedan pagadas, la que se corta queda
 * parcial y el resto pendiente. Ver `lib/utils/comision-imputacion.ts`.
 */
export const getCommissionsBySeller = async (sellerId: string): Promise<SellerCommission[]> => {
  // Traer tasa de comisión del vendedor
  const { data: seller } = await supabase
    .from('vendedores')
    .select('commission_rate')
    .eq('id', sellerId)
    .single()

  const commissionRate = Number(seller?.commission_rate) || 10

  // Traer ventas de este vendedor
  const { data: ventas } = await supabase
    .from('ventas')
    .select('id, sale_number, client_name, total, created_at, seller_id')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })

  if (!ventas || ventas.length === 0) return []

  // Todos los pagos registrados (con o sin período) para determinar cobertura de "pagado"
  const { data: pagos } = await supabase
    .from('pagos_comisiones')
    .select('*')
    .eq('seller_id', sellerId)

  // Total efectivamente entregado al vendedor (pagos legacy sin monto_pagado
  // se asumen pagados por el devengado del período).
  const totalPagado = (pagos ?? []).reduce(
    (s: number, p: any) => s + (Number(p.monto_pagado ?? p.monto) || 0),
    0,
  )

  const ventaEntries: SellerCommission[] = ventas.map((v) => {
    const saleTotal = Number(v.total) || 0
    const commissionAmount = saleTotal * (commissionRate / 100)

    return {
      id: v.id,
      sellerId,
      saleId: v.id,
      saleNumber: v.sale_number ?? undefined,
      clientName: v.client_name ?? undefined,
      saleTotal,
      commissionRate,
      commissionAmount,
      isPaid: false,
      createdAt: new Date(v.created_at),
    }
  })

  // Devoluciones: descuentan comisión como entradas negativas
  const { data: devoluciones } = await supabase
    .from('devoluciones')
    .select('id, sale_id, sale_number, client_name, total, commission_amount, commission_rate, created_at')
    .eq('seller_id', sellerId)

  const devEntries: SellerCommission[] = (devoluciones ?? []).map((d) => {
    const createdAt = new Date(d.created_at)
    return {
      id: d.id,
      sellerId,
      saleId: d.sale_id ?? d.id,
      saleNumber: d.sale_number ? `Devolución #${d.sale_number}` : 'Devolución',
      clientName: d.client_name ?? undefined,
      saleTotal: -(Number(d.total) || 0),
      commissionRate: Number(d.commission_rate) || commissionRate,
      commissionAmount: -(Number(d.commission_amount) || 0),
      isPaid: false,
      createdAt,
    }
  })

  const { items } = imputarComisiones([...ventaEntries, ...devEntries], totalPagado)

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export const getCommissionSummaryBySeller = async (sellerId: string) => {
  const commissions = await getCommissionsBySeller(sellerId)
  const total = commissions.reduce((acc, c) => acc + c.commissionAmount, 0)
  const pending = commissions.filter((c) => !c.isPaid)
  const pendingTotal = pending.reduce((acc, c) => acc + c.commissionAmount, 0)
  return {
    total,
    pendingTotal,
    count: commissions.length,
    pendingCount: pending.length,
  }
}
