// lib/utils/commissions.ts
// Cálculo puro de comisiones de un vendedor a partir de sus ventas y devoluciones.
// Aislado de Supabase para poder testear y para reusar en el cálculo masivo
// (getAllCommissions) sin caer en N+1 de queries.

import type { SellerCommission } from '@/lib/types'

export interface VentaRow {
  id: string
  sale_number?: string | null
  client_name?: string | null
  total?: number | string | null
  created_at: string
  seller_id?: string | null
}

export interface DevolucionRow {
  id: string
  sale_id?: string | null
  sale_number?: string | null
  client_name?: string | null
  total?: number | string | null
  commission_amount?: number | string | null
  commission_rate?: number | string | null
  created_at: string
}

export function buildSellerCommissions(params: {
  sellerId: string
  commissionRate: number
  ventas: VentaRow[]
  devoluciones: DevolucionRow[]
  paidCutoff: Date | null
}): SellerCommission[] {
  const { sellerId, commissionRate, ventas, devoluciones, paidCutoff } = params

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

  const devEntries: SellerCommission[] = devoluciones.map((d) => {
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
