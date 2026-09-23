// services/remitos-anulados-service.ts
import { supabase } from '@/lib/supabase'
import { generateReadableId } from '@/services/supabase-helpers'

export interface RemitoAnulado {
  id: string
  orderId?: string
  clientName?: string
  remitoNumber?: string
  nota: string
  stockRepuesto: boolean
  userId?: string
  userName?: string
  createdAt: Date
}

function mapRemitoAnulado(d: Record<string, any>): RemitoAnulado {
  return {
    id: d.id,
    orderId: d.order_id ?? undefined,
    clientName: d.client_name ?? undefined,
    remitoNumber: d.remito_number ?? undefined,
    nota: d.nota ?? '',
    stockRepuesto: d.stock_repuesto ?? false,
    userId: d.user_id ?? undefined,
    userName: d.user_name ?? undefined,
    createdAt: new Date(d.created_at),
  }
}

export const registrarRemitoAnulado = async (entry: {
  orderId?: string
  clientName?: string
  remitoNumber?: string
  nota: string
  stockRepuesto: boolean
  userId?: string
  userName?: string
}): Promise<void> => {
  const id = await generateReadableId('remitos_anulados', 'remito_anulado', entry.clientName || 'sin_cliente')
  const { error } = await supabase.from('remitos_anulados').insert({
    id,
    order_id: entry.orderId ?? null,
    client_name: entry.clientName ?? null,
    remito_number: entry.remitoNumber ?? null,
    nota: entry.nota,
    stock_repuesto: entry.stockRepuesto,
    user_id: entry.userId ?? null,
    user_name: entry.userName ?? null,
  })
  if (error) throw new Error(`Error registrando remito anulado: ${error.message}`)
}

export const getRemitosAnulados = async (): Promise<RemitoAnulado[]> => {
  const { data, error } = await supabase
    .from('remitos_anulados')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Error cargando remitos anulados: ${error.message}`)
  return (data ?? []).map(mapRemitoAnulado)
}
