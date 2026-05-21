import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const { porcentaje } = await req.json()
    if (typeof porcentaje !== 'number' || porcentaje < 0) {
      return NextResponse.json({ error: 'Porcentaje inválido' }, { status: 400 })
    }

    // Traer todos los mayorista habilitados con producto_id
    const { data: mayoristas, error: fetchErr } = await supabaseAdmin
      .from('mayorista_productos')
      .select('id, producto_id, precio_lista')
      .eq('habilitado', true)
      .not('producto_id', 'is', null)

    if (fetchErr) throw fetchErr
    if (!mayoristas || mayoristas.length === 0) {
      return NextResponse.json({ updated: 0 })
    }

    // Armar array de updates
    const rows = mayoristas.map((m) => ({
      id: m.producto_id as string,
      price: Math.round(Number(m.precio_lista) * (1 + porcentaje / 100) * 100) / 100,
      precio_venta: Math.round(Number(m.precio_lista) * (1 + porcentaje / 100) * 100) / 100,
      ganancia_global: porcentaje,
      ganancia_individual: 0,
    }))

    // Upsert en batches de 500
    let updated = 0
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { error } = await supabaseAdmin
        .from('productos')
        .upsert(chunk, { onConflict: 'id', ignoreDuplicates: false })
      if (error) throw error
      updated += chunk.length
    }

    return NextResponse.json({ updated })
  } catch (err: any) {
    console.error('[apply-ganancia]', err)
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 })
  }
}
