import { supabase } from '@/lib/supabase'

export interface GananciaHistorialEntry {
  id: number
  productoId: string
  productoNombre: string
  categoria: string | null
  gananciaAnterior: number | null
  gananciaNueva: number
  createdAt: Date
}

export interface ProductoGananciaDistinta {
  id: string
  name: string
  category: string
  gananciaGlobal: number | null
  price: number
}

function mapHistorialRow(d: Record<string, any>): GananciaHistorialEntry {
  return {
    id: d.id,
    productoId: d.producto_id,
    productoNombre: d.producto_nombre,
    categoria: d.categoria ?? null,
    gananciaAnterior: d.ganancia_anterior != null ? Number(d.ganancia_anterior) : null,
    gananciaNueva: Number(d.ganancia_nueva),
    createdAt: new Date(d.created_at),
  }
}

export const logGananciaIndividual = async (entry: {
  productoId: string
  productoNombre: string
  categoria: string | null
  gananciaAnterior: number | null
  gananciaNueva: number
}): Promise<void> => {
  const { error } = await supabase.from('producto_ganancia_historial').insert({
    producto_id: entry.productoId,
    producto_nombre: entry.productoNombre,
    categoria: entry.categoria,
    ganancia_anterior: entry.gananciaAnterior,
    ganancia_nueva: entry.gananciaNueva,
  })
  if (error) console.error('[logGananciaIndividual]', error.message)
}

export const getGananciaHistorial = async (limit = 100): Promise<GananciaHistorialEntry[]> => {
  const { data, error } = await supabase
    .from('producto_ganancia_historial')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(mapHistorialRow)
}

export const getProductosConGananciaDistinta = async (): Promise<ProductoGananciaDistinta[]> => {
  const { data, error } = await supabase
    .from('productos')
    .select('id, name, category, ganancia_global, price')
    .eq('ganancia_individual', true)
    .or('disabled.eq.false,disabled.is.null')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name ?? '',
    category: d.category ?? '',
    gananciaGlobal: d.ganancia_global != null ? Number(d.ganancia_global) : null,
    price: Number(d.price) || 0,
  }))
}
