import { supabase } from '@/lib/supabase'

// Asignaciones de unidades de oferta por (producto, vendedor).
// El descuento aplica a un vendedor solo si tiene cantidad > 0 para ese producto.

export const getAsignacionesProducto = async (productoId: string): Promise<Record<string, number>> => {
  const { data } = await supabase
    .from('descuento_vendedor')
    .select('vendedor_id, cantidad')
    .eq('producto_id', productoId)
  const map: Record<string, number> = {}
  ;(data ?? []).forEach((r: any) => { map[r.vendedor_id] = Number(r.cantidad) || 0 })
  return map
}

export const setAsignacion = async (productoId: string, vendedorId: string, cantidad: number): Promise<void> => {
  if (!productoId || !vendedorId) return
  if (cantidad <= 0) {
    await supabase.from('descuento_vendedor').delete().eq('producto_id', productoId).eq('vendedor_id', vendedorId)
    return
  }
  await supabase
    .from('descuento_vendedor')
    .upsert({ producto_id: productoId, vendedor_id: vendedorId, cantidad }, { onConflict: 'producto_id,vendedor_id' })
}

// Mapa producto_id -> unidades restantes para un vendedor (para la pantalla de venta).
export const getAsignacionesVendedor = async (vendedorId: string, productoIds: string[]): Promise<Record<string, number>> => {
  if (!vendedorId || productoIds.length === 0) return {}
  const map: Record<string, number> = {}
  for (let i = 0; i < productoIds.length; i += 500) {
    const chunk = productoIds.slice(i, i + 500)
    const { data } = await supabase
      .from('descuento_vendedor')
      .select('producto_id, cantidad')
      .eq('vendedor_id', vendedorId)
      .in('producto_id', chunk)
    ;(data ?? []).forEach((r: any) => { map[r.producto_id] = Number(r.cantidad) || 0 })
  }
  return map
}

// Producto_ids con cantidad > 0 para un vendedor (para el filtro "con descuento").
export const getProductosConOfertaVendedor = async (vendedorId: string): Promise<string[]> => {
  if (!vendedorId) return []
  const { data } = await supabase
    .from('descuento_vendedor')
    .select('producto_id')
    .eq('vendedor_id', vendedorId)
    .gt('cantidad', 0)
  return (data ?? []).map((r: any) => r.producto_id)
}

// Descuenta unidades de la oferta de un vendedor al vender.
export const descontarVendedor = async (productoId: string, vendedorId: string, cantidad: number): Promise<void> => {
  if (!productoId || !vendedorId || cantidad <= 0) return
  const { data } = await supabase
    .from('descuento_vendedor')
    .select('cantidad')
    .eq('producto_id', productoId)
    .eq('vendedor_id', vendedorId)
    .single()
  if (!data) return
  const nuevo = Math.max(0, Number(data.cantidad) - cantidad)
  await supabase
    .from('descuento_vendedor')
    .update({ cantidad: nuevo })
    .eq('producto_id', productoId)
    .eq('vendedor_id', vendedorId)
}
