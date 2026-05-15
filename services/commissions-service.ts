import { supabase } from '@/lib/supabase'
import type { SellerCommission } from '@/lib/types'

export const getCommissionsBySeller = async (sellerId: string): Promise<SellerCommission[]> => {
  const { data } = await supabase
    .from('comisiones')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })

  return (data ?? []).map((d) => ({
    id: d.id,
    sellerId: d.seller_id,
    saleId: d.sale_id,
    saleNumber: d.sale_number ?? undefined,
    clientName: d.client_name ?? undefined,
    saleTotal: Number(d.sale_total),
    commissionRate: Number(d.commission_rate),
    commissionAmount: Number(d.commission_amount),
    isPaid: d.is_paid ?? false,
    paidAt: d.paid_at ? new Date(d.paid_at) : undefined,
    createdAt: new Date(d.created_at),
  }))
}

export const getCommissionSummaryBySeller = async (sellerId: string) => {
  const commissions = await getCommissionsBySeller(sellerId)
  const total = commissions.reduce((acc, commission) => acc + commission.commissionAmount, 0)
  const pending = commissions.filter((commission) => !commission.isPaid)
  const pendingTotal = pending.reduce((acc, commission) => acc + commission.commissionAmount, 0)
  return {
    total,
    pendingTotal,
    count: commissions.length,
    pendingCount: pending.length,
  }
}
