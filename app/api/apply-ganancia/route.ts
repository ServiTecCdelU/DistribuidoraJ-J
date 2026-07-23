import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/api-auth'
import { parseJsonBody } from '@/lib/api-validation'

const gananciaSchema = z.object({
  porcentaje: z.number().min(0, 'Porcentaje inválido'),
  scope: z.string().optional(),
})

interface ProductoRow {
  id: string
  precio_base: number | null
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, { roles: ['admin'] })
    if (!auth.ok) return auth.response

    const parsed = await parseJsonBody(req, gananciaSchema)
    if (!parsed.ok) return parsed.response
    const { porcentaje, scope } = parsed.data

    // Productos activos, excluyendo los que tienen % individual (no se pisan al aplicar a todos)
    let query = supabaseAdmin
      .from('productos')
      .select('id, precio_base')
      .or('disabled.eq.false,disabled.is.null')
      .or('ganancia_individual.eq.false,ganancia_individual.is.null')

    if (scope === 'medicamentos') {
      query = query.ilike('category', '%medicamento%')
    }

    const { data: productos, error: prodError } = await query
    if (prodError) throw prodError

    const rows = (productos ?? []) as ProductoRow[]
    if (rows.length === 0) {
      return NextResponse.json({ updated: 0 })
    }

    // Productos con precio_base propio (manuales / medicamentos cargados manualmente)
    const conBase = rows.filter((r) => r.precio_base != null && r.precio_base > 0)
    // Productos mayoristas: la base es el precio_lista de mayorista_productos
    const idsSinBase = rows.filter((r) => !(r.precio_base != null && r.precio_base > 0)).map((r) => r.id)

    const precioListaMap = new Map<string, number>()
    for (let i = 0; i < idsSinBase.length; i += 500) {
      const chunk = idsSinBase.slice(i, i + 500)
      const { data: mpRows, error: mpError } = await supabaseAdmin
        .from('mayorista_productos')
        .select('producto_id, precio_lista')
        .in('producto_id', chunk)
      if (mpError) throw mpError
      for (const mp of mpRows ?? []) {
        if (mp.producto_id && mp.precio_lista != null) {
          precioListaMap.set(mp.producto_id, Number(mp.precio_lista))
        }
      }
    }

    const updates: { id: string; price: number }[] = []
    for (const r of conBase) {
      const precio = Math.round(Number(r.precio_base) * (1 + porcentaje / 100) * 100) / 100
      updates.push({ id: r.id, price: precio })
    }
    for (const id of idsSinBase) {
      const base = precioListaMap.get(id)
      if (base == null || base <= 0) continue
      const precio = Math.round(base * (1 + porcentaje / 100) * 100) / 100
      updates.push({ id, price: precio })
    }

    const CONCURRENCY = 20
    let updated = 0
    for (let i = 0; i < updates.length; i += CONCURRENCY) {
      const chunk = updates.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        chunk.map(({ id, price }) =>
          supabaseAdmin
            .from('productos')
            .update({ price, precio_venta: price, ganancia_global: porcentaje, ganancia_individual: false })
            .eq('id', id),
        ),
      )
      updated += results.filter((r) => !r.error).length
    }

    return NextResponse.json({ updated })
  } catch (err: any) {
    console.error('[apply-ganancia]', err)
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 })
  }
}
