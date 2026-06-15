import { supabase } from '@/lib/supabase'
import type { SellerCommission } from '@/lib/types'
import { buildSellerCommissions } from '@/lib/utils/commissions'

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

  // Devoluciones: descuentan comisión como entradas negativas
  const { data: devoluciones } = await supabase
    .from('devoluciones')
    .select('id, sale_id, sale_number, client_name, total, commission_amount, commission_rate, created_at')
    .eq('seller_id', sellerId)

  return buildSellerCommissions({
    sellerId,
    commissionRate,
    ventas: ventas ?? [],
    devoluciones: devoluciones ?? [],
    paidCutoff,
  })
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
