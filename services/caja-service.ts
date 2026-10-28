// services/caja-service.ts
import { supabase } from '@/lib/supabase'
import type { Sale } from '@/lib/types'
import type { MovimientoEfectivo } from '@/lib/utils/caja-desglose'
import { mapSale } from '@/services/sales-service'

export interface CajaDia {
  caja: Record<string, any> | null
  desde: Date
  ventas: Sale[]
  perdidas: { id: string; amount: number; description: string; date: string }[]
  comisiones: { id: string; sellerName: string; monto: number; createdAt: string }[]
  rechazados: { id: string; clientName: string; remitoNumber?: string; date: string }[]
  movimientos: MovimientoEfectivo[]
}

// Todo lo que muestra Caja para un día en una sola llamada (RPC `caja_dia`): la caja, las ventas
// con remito, pérdidas, comisiones pagadas, pedidos rechazados y cobros/devoluciones en efectivo.
// Los totales se calculan con la fórmula única de lib/utils/caja-desglose.ts.
export const getCajaDia = async (hoy: Date, hasta: Date, incluirCerrada = false): Promise<CajaDia> => {
  const { data, error } = await supabase.rpc('caja_dia', {
    p_hoy: hoy.toISOString(),
    p_hasta: hasta.toISOString(),
    p_incluir_cerrada: incluirCerrada,
  })
  if (error) throw new Error(error.message)
  const r = data as Record<string, any>
  return {
    caja: r.caja ?? null,
    desde: new Date(r.desde),
    ventas: (r.ventas ?? []).map(mapSale),
    perdidas: (r.perdidas ?? []).map((l: any) => ({
      id: l.id,
      amount: Math.abs(Number(l.amount)) || 0,
      description: (l.description || '').replace('[ROTURA] ', ''),
      date: l.date,
    })),
    comisiones: (r.comisiones ?? []).map((p: any) => ({
      id: p.id,
      sellerName: p.seller_name,
      monto: Number(p.monto_pagado ?? p.monto) || 0,
      createdAt: p.fecha_pago ?? p.created_at,
    })),
    rechazados: (r.rechazados ?? []).map((p: any) => ({
      id: p.id,
      clientName: p.client_name,
      remitoNumber: p.remito_number ?? undefined,
      date: p.updated_at,
    })),
    movimientos: (r.movimientos ?? []) as MovimientoEfectivo[],
  }
}
