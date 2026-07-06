import { supabase } from '@/lib/supabase'
import type { SellerCommission } from '@/lib/types'

/**
 * Deriva comisiones desde la tabla `ventas` (source of truth).
 * El estado pagado se determina por los pagos registrados en `pagos_comisiones`:
 * un pago con período [periodo_desde, periodo_hasta] cubre las comisiones cuya
 * fecha cae dentro de esa ventana. Pagos legacy sin período usan cutoff por
 * `created_at` (todo lo anterior o igual queda pagado).
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

  type PagoWindow = { desde: number | null; hasta: number | null; cutoff: number }
  const windows: PagoWindow[] = (pagos ?? []).map((p: any) => ({
    desde: p.periodo_desde ? new Date(p.periodo_desde).getTime() : null,
    hasta: p.periodo_hasta ? new Date(p.periodo_hasta).getTime() : null,
    cutoff: new Date(p.created_at).getTime(),
  }))

  // Devuelve la fecha del pago que cubre esta comisión, o null si está pendiente.
  const coveredBy = (createdAtMs: number): number | null => {
    for (const w of windows) {
      if (w.desde != null && w.hasta != null) {
        if (createdAtMs >= w.desde && createdAtMs <= w.hasta) return w.cutoff
      } else if (createdAtMs <= w.cutoff) {
        return w.cutoff
      }
    }
    return null
  }

  const ventaEntries: SellerCommission[] = ventas.map((v) => {
    const saleTotal = Number(v.total) || 0
    const commissionAmount = saleTotal * (commissionRate / 100)
    const createdAt = new Date(v.created_at)
    const paidAtMs = coveredBy(createdAt.getTime())

    return {
      id: v.id,
      sellerId,
      saleId: v.id,
      saleNumber: v.sale_number ?? undefined,
      clientName: v.client_name ?? undefined,
      saleTotal,
      commissionRate,
      commissionAmount,
      isPaid: paidAtMs != null,
      paidAt: paidAtMs != null ? new Date(paidAtMs) : undefined,
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
    const paidAtMs = coveredBy(createdAt.getTime())
    return {
      id: d.id,
      sellerId,
      saleId: d.sale_id ?? d.id,
      saleNumber: d.sale_number ? `Devolución #${d.sale_number}` : 'Devolución',
      clientName: d.client_name ?? undefined,
      saleTotal: -(Number(d.total) || 0),
      commissionRate: Number(d.commission_rate) || commissionRate,
      commissionAmount: -(Number(d.commission_amount) || 0),
      isPaid: paidAtMs != null,
      paidAt: paidAtMs != null ? new Date(paidAtMs) : undefined,
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
