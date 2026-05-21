import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const { porcentaje } = await req.json()
    if (typeof porcentaje !== 'number' || porcentaje < 0) {
      return NextResponse.json({ error: 'Porcentaje inválido' }, { status: 400 })
    }

    // Traer todos los mayorista habilitados con producto_id y precio_lista
    const all: any[] = []
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabaseAdmin
        .from('mayorista_productos')
        .select('producto_id, precio_lista')
        .eq('habilitado', true)
        .not('producto_id', 'is', null)
        .range(from, from + PAGE - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < PAGE) break
      from += PAGE
    }

    if (all.length === 0) {
      return NextResponse.json({ updated: 0 })
    }

    // Actualizar cada producto con update individual pero server-side (sin límite de browser)
    let updated = 0
    for (let i = 0; i < all.length; i += 50) {
      const chunk = all.slice(i, i + 50)
      await Promise.all(
        chunk.map(async (m: any) => {
          const precio = Math.round(Number(m.precio_lista) * (1 + porcentaje / 100) * 100) / 100
          const { error } = await supabaseAdmin
            .from('productos')
            .update({
              price: precio,
              precio_venta: precio,
              ganancia_global: porcentaje,
              ganancia_individual: 0,
            })
            .eq('id', m.producto_id)
          if (!error) updated++
        })
      )
    }

    return NextResponse.json({ updated })
  } catch (err: any) {
    console.error('[apply-ganancia]', err)
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 })
  }
}
