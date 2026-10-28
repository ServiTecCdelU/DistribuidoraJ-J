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
 * Registra un movimiento de stock Y actualiza el stock del producto (productos.stock y
 * mayorista_productos.stock_local). cantidad positiva = entrada, negativa = salida.
 *
 * Lo hace la RPC `mover_stock` en una sola transacción con lock de fila: antes se leía el
 * stock en el navegador y dos movimientos simultáneos del mismo producto se pisaban.
 * `clave` (opcional) lo hace idempotente: un reintento con la misma clave no se repite.
 * El stock nunca queda negativo.
 */
export const registrarMovimiento = async (params: {
  productoId: string
  tipo: StockMovimiento['tipo']
  cantidad: number
  referencia?: string
  clave?: string
}): Promise<void> => {
  const { productoId, tipo, cantidad, referencia, clave } = params
  const { error } = await supabase.rpc('mover_stock', {
    p_producto_id: productoId,
    p_tipo: tipo,
    p_cantidad: cantidad,
    p_motivo: referencia ?? null,
    p_clave: clave ?? null,
  })
  if (error) throw new Error(`No se pudo mover el stock: ${error.message}`)
}

export interface ProductoARevisar {
  productoId: string // prod_mp_XXXX
  mayoristaProductoId: string // mp_XXXX
  nombre: string
  codigo: string
  stockActual: number
  cantidadMovimientos: number
  unidadesFaltantes: number
  ultimaFecha: Date
  ultimoMotivo: string
}

/**
 * Productos con irregularidad de stock: movimientos de salida donde se intentó
 * descontar más de lo disponible (incluye "descontar de 0"). El sistema frena el
 * stock en 0 (Math.max(0, ...)), ocultando el descuento; este faltante queda
 * registrado como stock_anterior + cantidad < 0.
 */
export const getProductosARevisar = async (): Promise<ProductoARevisar[]> => {
  // Agrupado en la base (RPC productos_a_revisar): antes se bajaban ~3600 movimientos en
  // páginas de 1000 y se agrupaban acá.
  const { data, error } = await supabase.rpc('productos_a_revisar')
  if (error) throw new Error(`No se pudieron cargar los productos a revisar: ${error.message}`)
  return ((data ?? []) as Record<string, any>[])
    .map((r) => ({
      productoId: `prod_${r.mayorista_producto_id}`,
      mayoristaProductoId: String(r.mayorista_producto_id),
      nombre: r.nombre,
      codigo: String(r.codigo),
      stockActual: Number(r.stock_actual) || 0,
      cantidadMovimientos: Number(r.cantidad_movimientos) || 0,
      unidadesFaltantes: Number(r.unidades_faltantes) || 0,
      ultimaFecha: new Date(r.ultima_fecha),
      ultimoMotivo: r.ultimo_motivo ?? '',
    }))
    .sort((a, b) => b.ultimaFecha.getTime() - a.ultimaFecha.getTime())
}

/**
 * Descuenta stock de multiples productos en una misma operacion (venta).
 */
export const descontarStockVenta = async (
  items: { productoId: string; cantidad: number }[],
  ventaId: string
): Promise<void> => {
  await Promise.all(
    items.map((item, i) =>
      registrarMovimiento({
        productoId: item.productoId,
        tipo: 'venta',
        cantidad: -item.cantidad,
        referencia: ventaId,
        // Un reintento del cobro no vuelve a descontar la misma línea.
        clave: `venta:${ventaId}:${i}:${item.productoId}`,
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
      .map((item, i) =>
        registrarMovimiento({
          productoId: item.productoId,
          tipo: 'regalo',
          cantidad: -item.cantidad,
          referencia: ventaId,
          clave: `regalo:${ventaId}:${i}:${item.productoId}`,
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
