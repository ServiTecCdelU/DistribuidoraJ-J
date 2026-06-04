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

  // Aceptar tanto "mp_XXXX" como "prod_mp_XXXX" y normalizar ambos IDs.
  const prodId = productoId.startsWith('prod_') ? productoId : `prod_${productoId}`
  const mpId = productoId.startsWith('prod_') ? productoId.slice('prod_'.length) : productoId

  // Fuente de verdad = productos.stock (lo que ve la UI y el carrito).
  // Se cae a stock_local solo si el producto no existe en `productos`.
  const { data: prod } = await supabase
    .from('productos')
    .select('stock')
    .eq('id', prodId)
    .maybeSingle()

  let stockAnterior: number
  if (prod && prod.stock != null) {
    stockAnterior = Number(prod.stock)
  } else {
    const { data: mp } = await supabase
      .from('mayorista_productos')
      .select('stock_local')
      .eq('id', mpId)
      .maybeSingle()
    stockAnterior = Number(mp?.stock_local ?? 0)
  }

  // El stock físico nunca debe quedar negativo
  const stockPosterior = Math.max(0, stockAnterior + cantidad)

  // Registrar movimiento
  await supabase.from('stock_movimientos').insert({
    mayorista_producto_id: mpId,
    tipo,
    cantidad,
    stock_anterior: stockAnterior,
    stock_posterior: stockPosterior,
    motivo: referencia ?? null,
  })

  // Mantener ambas tablas sincronizadas con el mismo valor
  await supabase
    .from('mayorista_productos')
    .update({ stock_local: stockPosterior })
    .eq('id', mpId)
  await supabase
    .from('productos')
    .update({ stock: stockPosterior })
    .eq('id', prodId)
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
 * Descuenta stock de productos REGALADOS por oferta (no se cobran).
 * Igual que descontarStockVenta pero registra el movimiento como tipo 'regalo'.
 */
export const descontarStockRegalo = async (
  items: { productoId: string; cantidad: number }[],
  ventaId: string
): Promise<void> => {
  await Promise.all(
    items
      .filter((item) => item.cantidad > 0)
      .map((item) =>
        registrarMovimiento({
          productoId: item.productoId,
          tipo: 'regalo',
          cantidad: -item.cantidad,
          referencia: ventaId,
        })
      )
  )
}

/**
 * Registra un movimiento de stock en stock_movimientos usando los valores de productos.stock.
 * No falla ni interrumpe el flujo si hay error (FK sin mayorista, etc.).
 */
export const registrarMovimientoStock = async (params: {
  productoId: string
  tipo: 'venta' | 'apertura_bulto' | 'ajuste' | 'rotura' | 'regalo'
  cantidad: number
  stockAnterior: number
  stockPosterior: number
  motivo?: string
}): Promise<void> => {
  const mayoristId = params.productoId.replace(/^prod_/, '')
  try {
    await supabase.from('stock_movimientos').insert({
      mayorista_producto_id: mayoristId,
      tipo: params.tipo,
      cantidad: params.cantidad,
      stock_anterior: params.stockAnterior,
      stock_posterior: params.stockPosterior,
      motivo: params.motivo ?? null,
    })
  } catch {
    // no interrumpir el flujo
  }
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
