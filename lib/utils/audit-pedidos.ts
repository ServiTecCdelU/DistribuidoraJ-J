// Agrupación de la auditoría por pedido: todo lo que pasó con un mismo pedido
// (cambios de estado, ediciones al generar el remito, faltantes al cobrar, anulación)
// se muestra junto, en vez de disperso entre los movimientos del día.

import type { AuditEntry } from '@/lib/types'

export type TipoNovedad = 'agregado' | 'quitado' | 'cantidad' | 'precio' | 'descuento' | 'no_entregado'

export interface NovedadCarga {
  tipo: TipoNovedad
  name: string
  antes?: number
  despues?: number
  motivo?: string
  fecha: Date
}

export interface GrupoPedido {
  orderId: string
  clientName?: string
  remitoNumber?: string
  saleId?: string
  entries: AuditEntry[]
  novedades: NovedadCarga[]
  primera: Date
  ultima: Date
}

/** `Pedido de "BIBIANA LUSIMA"` / `pedido de "BIBIANA LUSIMA"` → BIBIANA LUSIMA */
export function clienteDeDescripcion(description: string): string | undefined {
  const m = description.match(/"([^"]+)"/)
  return m?.[1]
}

const MOTIVOS: Record<string, string> = {
  rotura: 'rotura',
  faltante: 'faltante',
  no_quiso: 'no lo quiso',
  no_quiere: 'no lo quiso',
}

export function etiquetaMotivo(motivo?: string): string | undefined {
  if (!motivo) return undefined
  return MOTIVOS[motivo] ?? motivo
}

function novedadesDeEntrada(entry: AuditEntry): NovedadCarga[] {
  const meta = (entry.metadata ?? {}) as Record<string, any>
  const salida: NovedadCarga[] = []

  for (const c of Array.isArray(meta.cambios) ? meta.cambios : []) {
    salida.push({
      tipo: c.tipo,
      name: String(c.name ?? c.productId ?? ''),
      antes: c.antes,
      despues: c.despues,
      fecha: entry.createdAt,
    })
  }

  for (const i of Array.isArray(meta.noEntregados) ? meta.noEntregados : []) {
    salida.push({
      tipo: 'no_entregado',
      name: String(i.name ?? ''),
      antes: Number(i.quantity) || 0,
      motivo: i.motivo,
      fecha: entry.createdAt,
    })
  }

  for (const i of Array.isArray(meta.faltantes) ? meta.faltantes : []) {
    salida.push({
      tipo: i.despues != null ? 'cantidad' : 'quitado',
      name: String(i.name ?? ''),
      antes: i.antes,
      despues: i.despues,
      fecha: entry.createdAt,
    })
  }

  return salida
}

/** Texto corto de una novedad, para mostrar en la tarjeta del pedido. */
export function textoNovedad(n: NovedadCarga): string {
  switch (n.tipo) {
    case 'agregado':
      return `Agregado: ${n.name} x${n.despues}`
    case 'quitado':
      return `No se envió: ${n.name} x${n.antes}`
    case 'cantidad':
      return `Faltante: ${n.name}: ${n.despues} de ${n.antes}`
    case 'precio':
      return `Precio: ${n.name}: ${n.antes} → ${n.despues}`
    case 'descuento':
      return `Descuento: ${n.name}: ${n.antes}% → ${n.despues}%`
    case 'no_entregado': {
      const motivo = etiquetaMotivo(n.motivo)
      return `No entregado: ${n.name} x${n.antes}${motivo ? ` (${motivo})` : ''}`
    }
  }
}

/**
 * Agrupa las entradas de auditoría de tipo `order` por pedido.
 * Las entradas que no son de pedidos se devuelven aparte, sin agrupar.
 */
export function agruparPorPedido(entries: AuditEntry[]): {
  grupos: GrupoPedido[]
  sueltas: AuditEntry[]
} {
  const mapa = new Map<string, GrupoPedido>()
  const sueltas: AuditEntry[] = []

  for (const e of entries) {
    if (e.entityType !== 'order' || !e.entityId) {
      sueltas.push(e)
      continue
    }
    const grupo = mapa.get(e.entityId)
    const meta = (e.metadata ?? {}) as Record<string, any>
    if (!grupo) {
      mapa.set(e.entityId, {
        orderId: e.entityId,
        clientName: clienteDeDescripcion(e.description),
        remitoNumber: meta.remitoNumber ?? undefined,
        saleId: meta.saleId ?? undefined,
        entries: [e],
        novedades: novedadesDeEntrada(e),
        primera: e.createdAt,
        ultima: e.createdAt,
      })
      continue
    }
    grupo.entries.push(e)
    grupo.novedades.push(...novedadesDeEntrada(e))
    grupo.clientName = grupo.clientName ?? clienteDeDescripcion(e.description)
    grupo.remitoNumber = grupo.remitoNumber ?? meta.remitoNumber ?? undefined
    grupo.saleId = grupo.saleId ?? meta.saleId ?? undefined
    if (e.createdAt < grupo.primera) grupo.primera = e.createdAt
    if (e.createdAt > grupo.ultima) grupo.ultima = e.createdAt
  }

  const grupos = [...mapa.values()]
  for (const g of grupos) {
    g.entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    g.novedades.sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
  }
  grupos.sort((a, b) => b.ultima.getTime() - a.ultima.getTime())

  return { grupos, sueltas }
}
