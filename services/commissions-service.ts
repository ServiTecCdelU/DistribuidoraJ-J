import { supabase } from '@/lib/supabase'
import type { SellerCommission } from '@/lib/types'

/**
 * Deriva comisiones desde la tabla `ventas` (source of truth).
 * El estado pagado se determina por la fecha del último pago en `pagos_comisiones`.
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

  // Último pago registrado para determinar cutoff de "pagado"
  const { data: ultimoPago } = await supabase
    .from('pagos_comisiones')
    .select('created_at')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const paidCutoff = ultimoPago?.created_at ? new Date(ultimoPago.created_at) : null

  const ventaEntries: SellerCommission[] = ventas.map((v) => {
    const saleTotal = Number(v.total) || 0
    const commissionAmount = saleTotal * (commissionRate / 100)
    const createdAt = new Date(v.created_at)
    const isPaid = paidCutoff ? createdAt <= paidCutoff : false

    return {
      id: v.id,
      sellerId,
      saleId: v.id,
      saleNumber: v.sale_number ?? undefined,
      clientName: v.client_name ?? undefined,
      saleTotal,
      commissionRate,
      commissionAmount,
      isPaid,
      paidAt: isPaid && paidCutoff ? paidCutoff : undefined,
      createdAt,
    }
  })

  // Devoluciones: descuentan comisión como entradas negativas
  const { data: devoluciones } = await supabase
    .from('devoluciones')
    .select('id, sale_id, sale_number, client_name, total, commission_amount, commission_rate, created_at')
    .eq('seller_id', sellerId)

  const devEntries: SellerCommission[] = (devoluciones ?? []).map((d) => {
    const createdAt = new Date(d.created_at)
    const isPaid = paidCutoff ? createdAt <= paidCutoff : false
    return {
      id: d.id,
      sellerId,
      saleId: d.sale_id ?? d.id,
      saleNumber: d.sale_number ? `Devolución #${d.sale_number}` : 'Devolución',
      clientName: d.client_name ?? undefined,
      saleTotal: -(Number(d.total) || 0),
      commissionRate: Number(d.commission_rate) || commissionRate,
      commissionAmount: -(Number(d.commission_amount) || 0),
      isPaid,
      paidAt: isPaid && paidCutoff ? paidCutoff : undefined,
      createdAt,
    }
  })

  return [...ventaEntries, ...devEntries].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )
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
