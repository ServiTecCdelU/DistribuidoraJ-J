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
  // Candidatos: salidas que quedaron clampeadas en 0.
  const { data: movs } = await supabase
    .from('stock_movimientos')
    .select('mayorista_producto_id, cantidad, stock_anterior, stock_posterior, motivo, created_at')
    .eq('stock_posterior', 0)
    .lt('cantidad', 0)
    .order('created_at', { ascending: false })

  if (!movs || movs.length === 0) return []

  // Solo los que realmente intentaron descontar más de lo que había.
  const irregulares = movs.filter(
    (m) => Number(m.stock_anterior) + Number(m.cantidad) < 0
  )
  if (irregulares.length === 0) return []

  // Agrupar por producto.
  const porProducto = new Map<
    string,
    { cantidad: number; faltante: number; ultimaFecha: Date; ultimoMotivo: string }
  >()
  for (const m of irregulares) {
    const mpId = String(m.mayorista_producto_id)
    if (!mpId) continue
    const faltanteMov = -(Number(m.stock_anterior) + Number(m.cantidad))
    const prev = porProducto.get(mpId)
    if (prev) {
      prev.cantidad += 1
      prev.faltante += faltanteMov
    } else {
      porProducto.set(mpId, {
        cantidad: 1,
        faltante: faltanteMov,
        ultimaFecha: new Date(m.created_at), // primer registro = más reciente (orden desc)
        ultimoMotivo: m.motivo ?? '',
      })
    }
  }

  const mpIds = [...porProducto.keys()]
  const prodIds = mpIds.map((id) => `prod_${id}`)

  const { data: prods } = await supabase
    .from('productos')
    .select('id, name, codigo, stock')
    .in('id', prodIds)

  const prodById = new Map((prods ?? []).map((p) => [String(p.id), p]))

  return mpIds
    .map((mpId) => {
      const agg = porProducto.get(mpId)!
      const p = prodById.get(`prod_${mpId}`)
      return {
        productoId: `prod_${mpId}`,
        mayoristaProductoId: mpId,
        nombre: p?.name ?? mpId,
        codigo: String(p?.codigo ?? mpId.replace(/^mp_/, '')),
        stockActual: Number(p?.stock ?? 0),
        cantidadMovimientos: agg.cantidad,
        unidadesFaltantes: agg.faltante,
        ultimaFecha: agg.ultimaFecha,
        ultimoMotivo: agg.ultimoMotivo,
      }
    })
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
