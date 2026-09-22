// services/audit-service.ts
import { supabase } from '@/lib/supabase'
import type { AuditAction, AuditEntry } from '@/lib/types'
import { generateReadableId } from '@/services/supabase-helpers'

export const logAudit = async (entry: {
  action: AuditAction;
  userId: string;
  userName: string;
  description: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}) => {
  try {
    const userName = entry.userName || 'Desconocido'
    const docId = await generateReadableId('auditoria', 'auditoria', userName)
    await supabase.from('auditoria').insert({
      id: docId,
      action: entry.action,
      user_id: entry.userId,
      user_email: userName,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      details: { description: entry.description, ...entry.metadata },
    })
  } catch (error) {
    console.error("[Audit] Error logging:", error)
  }
}

const mapAuditRow = (d: Record<string, any>): AuditEntry => ({
  id: d.id,
  action: d.action as AuditAction,
  userId: d.user_id ?? '',
  userName: d.user_email ?? '',
  description: d.details?.description ?? d.action,
  entityType: d.entity_type,
  entityId: d.entity_id,
  metadata: d.details,
  createdAt: new Date(d.created_at),
})

export const getAuditLog = async (
  date: string,
  dateTo?: string,
  maxEntries = 1000,
): Promise<AuditEntry[]> => {
  const [from, to] = dateTo && dateTo < date ? [dateTo, date] : [date, dateTo || date]
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T23:59:59.999`)

  const { data } = await supabase
    .from('auditoria')
    .select('*')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: false })
    .limit(maxEntries)

  return (data ?? []).map(mapAuditRow)
}

/**
 * Busca en toda la auditoría sin necesidad de elegir fecha: por número de remito,
 * por cliente o por texto de la descripción. El remito y el cliente no viven en la
 * tabla `auditoria`, así que primero se resuelven contra `pedidos` y después se
 * traen todos los movimientos de esos pedidos.
 */
export const searchAuditLog = async (term: string, maxEntries = 500): Promise<AuditEntry[]> => {
  // Comas, paréntesis y comillas rompen el parseo del filtro `or` de PostgREST.
  const texto = term.trim().replace(/[(),"']/g, ' ').trim()
  if (texto.length < 2) return []
  const like = `%${texto}%`

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('id')
    .or(`remito_number.ilike.${like},client_name.ilike.${like},id.ilike.${like}`)
    .limit(200)

  const orderIds = (pedidos ?? []).map((p: { id: string }) => p.id)

  const [porTexto, porPedido] = await Promise.all([
    supabase
      .from('auditoria')
      .select('*')
      .or(`details->>description.ilike.${like},entity_id.ilike.${like},user_email.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(maxEntries),
    orderIds.length > 0
      ? supabase
          .from('auditoria')
          .select('*')
          .in('entity_id', orderIds)
          .order('created_at', { ascending: false })
          .limit(maxEntries)
      : Promise.resolve({ data: [] as Record<string, any>[] }),
  ])

  const porId = new Map<string, AuditEntry>()
  for (const fila of [...(porTexto.data ?? []), ...(porPedido.data ?? [])]) {
    porId.set(fila.id, mapAuditRow(fila))
  }

  return [...porId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export interface AuditOrderInfo {
  id: string
  clientName?: string
  remitoNumber?: string
  status?: string
  saleId?: string
  saleNumber?: string
  notes?: string
  createdAt?: Date
}

/** Datos de cabecera de los pedidos referenciados por la auditoría (cliente, remito, venta). */
export const getAuditOrdersInfo = async (ids: string[]): Promise<Record<string, AuditOrderInfo>> => {
  if (ids.length === 0) return {}
  const { data } = await supabase
    .from('pedidos')
    .select('id, client_name, remito_number, status, sale_id, notes, created_at')
    .in('id', ids)

  // Si el pedido ya se cobró, el número de venta es lo que busca el operador.
  const saleIds = (data ?? []).map((d) => d.sale_id).filter(Boolean)
  const numerosVenta: Record<string, string> = {}
  if (saleIds.length > 0) {
    const { data: ventas } = await supabase
      .from('ventas')
      .select('id, sale_number')
      .in('id', saleIds)
    for (const v of ventas ?? []) numerosVenta[v.id] = v.sale_number ?? ''
  }

  const mapa: Record<string, AuditOrderInfo> = {}
  for (const d of data ?? []) {
    mapa[d.id] = {
      id: d.id,
      clientName: d.client_name ?? undefined,
      remitoNumber: d.remito_number ?? undefined,
      status: d.status ?? undefined,
      saleId: d.sale_id ?? undefined,
      saleNumber: d.sale_id ? numerosVenta[d.sale_id] || undefined : undefined,
      notes: d.notes ?? undefined,
      createdAt: d.created_at ? new Date(d.created_at) : undefined,
    }
  }
  return mapa
}

export const getAuditByEntity = async (
  entityType: string,
  entityId: string,
): Promise<AuditEntry[]> => {
  const { data } = await supabase
    .from('auditoria')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  return (data ?? []).map(mapAuditRow)
}
