import { supabase } from '@/lib/supabase'
import type { StockMovimiento } from '@/lib/types'

function mapMovimiento(d: Record<string, any>): StockMovimiento {
  return {
    id: String(d.id),
    productoId: d.mayorista_producto_id ?? '',
    tipo: d.tipo ?? 'ajuste',
    cantidad: d.cantidad ?? 0,
    referencia: d.motivo ?? undefined,
    fecha: new Date(d.created_at),
  }
}

export const getMovimientosByProducto = async (productoId: string): Promise<StockMovimiento[]> => {
  const { data } = await supabase
    .from('stock_movimientos')
    .select('*')
    .eq('mayorista_producto_id', productoId)
    .order('created_at', { ascending: false })

  return (data ?? []).map(mapMovimiento)
}

/**
 * Registra un movimiento de stock Y actualiza el campo stock_local del producto.
 * cantidad positiva = entrada (apertura_bulto), negativa = salida (venta).
 */
export const registrarMovimiento = async (params: {
  productoId: string
  tipo: StockMovimiento['tipo']
  cantidad: number
  referencia?: string
}): Promise<void> => {
  const { productoId, tipo, cantidad, referencia } = params

  // Leer stock actual
  const { data: prod } = await supabase
    .from('mayorista_productos')
    .select('stock_local')
    .eq('id', productoId)
    .single()

  const stockAnterior = prod?.stock_local ?? 0
  const stockPosterior = stockAnterior + cantidad

  // Registrar movimiento
  await supabase.from('stock_movimientos').insert({
    mayorista_producto_id: productoId,
    tipo,
    cantidad,
    stock_anterior: stockAnterior,
    stock_posterior: stockPosterior,
    motivo: referencia ?? null,
  })

  // Actualizar stock_local en el producto
  await supabase
    .from('mayorista_productos')
    .update({ stock_local: stockPosterior })
    .eq('id', productoId)
}

/**
 * Descuenta stock de multiples productos en una misma operacion (venta).
 */
export const descontarStockVenta = async (
  items: { productoId: string; cantidad: number }[],
  ventaId: string
): Promise<void> => {
  await Promise.all(
    items.map((item) =>
      registrarMovimiento({
        productoId: item.productoId,
        tipo: 'venta',
        cantidad: -item.cantidad,
        referencia: ventaId,
      })
    )
  )
}

/**
 * Actualiza ventas pendientes por orden de fecha (FIFO) cuando llega stock de un producto.
 */
export const actualizarVentasPendientesFIFO = async (
  productoId: string,
  unidadesDisponibles: number
): Promise<void> => {
  if (unidadesDisponibles <= 0) return

  const { data: ventas } = await supabase
    .from('ventas')
    .select('*')
    .eq('status', 'pendiente')
    .order('created_at', { ascending: true })

  if (!ventas) return

  let restante = unidadesDisponibles

  for (const venta of ventas) {
    if (restante <= 0) break

    const items: any[] = venta.items ?? []

    const tieneProductoPendiente = items.some(
      (i) => i.productId === productoId && (i.cantidadPendienteMayorista ?? 0) > 0
    )
    if (!tieneProductoPendiente) continue

    let cambiado = false
    const newItems = items.map((item) => {
      if (item.productId !== productoId) return item
      const pendiente = item.cantidadPendienteMayorista ?? 0
      if (pendiente <= 0) return item

      const cubrir = Math.min(pendiente, restante)
      restante -= cubrir
      cambiado = true

      return {
        ...item,
        cantidadPendienteMayorista: pendiente - cubrir,
        cantidadStockLocal: (item.cantidadStockLocal ?? 0) + cubrir,
      }
    })

    if (!cambiado) continue

    const todoCubierto = newItems.every(
      (i: any) => (i.cantidadPendienteMayorista ?? 0) === 0
    )

    await supabase.from('ventas').update({
      items: newItems,
      ...(todoCubierto ? { status: 'listo' } : {}),
    }).eq('id', venta.id)
  }
}
