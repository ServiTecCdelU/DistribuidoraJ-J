// lib/utils/stock-movimiento.ts
// Construcción pura de la fila a insertar en `stock_movimientos`.
// Aislada para poder testear el mapeo (incluida la trazabilidad de usuario)
// sin depender de Supabase.

export interface MovimientoRowParams {
  mpId: string
  tipo: string
  cantidad: number
  stockAnterior: number
  stockPosterior: number
  referencia?: string | null
  usuario?: { id?: string; nombre?: string }
}

export interface MovimientoRow {
  mayorista_producto_id: string
  tipo: string
  cantidad: number
  stock_anterior: number
  stock_posterior: number
  motivo: string | null
  usuario_id: string | null
  usuario_nombre: string | null
}

export function buildMovimientoRow(p: MovimientoRowParams): MovimientoRow {
  return {
    mayorista_producto_id: p.mpId,
    tipo: p.tipo,
    cantidad: p.cantidad,
    stock_anterior: p.stockAnterior,
    stock_posterior: p.stockPosterior,
    motivo: p.referencia ?? null,
    usuario_id: p.usuario?.id ?? null,
    usuario_nombre: p.usuario?.nombre ?? null,
  }
}
