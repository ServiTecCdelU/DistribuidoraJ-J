import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/api-auth'

export const runtime = 'nodejs'

interface RankingItem {
  id: string
  name: string
  category: string
  price: number
  stock: number
  soldCount: number
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, { roles: ['admin'] })
    if (!auth.ok) return auth.response

    const [ventasRes, productosRes] = await Promise.all([
      supabaseAdmin.from('ventas').select('items'),
      supabaseAdmin.from('productos').select('id, name, category, price, stock, disabled'),
    ])
    if (ventasRes.error) throw ventasRes.error
    if (productosRes.error) throw productosRes.error

    const countMap: Record<string, number> = {}
    for (const row of ventasRes.data ?? []) {
      const items: { productId: string; quantity: number }[] = row.items || []
      for (const item of items) {
        if (item.productId) {
          countMap[item.productId] = (countMap[item.productId] || 0) + (item.quantity || 1)
        }
      }
    }

    const productos = (productosRes.data ?? []).filter((p) => p.disabled !== true)
    const conVentas: RankingItem[] = productos.map((p) => ({
      id: p.id,
      name: p.name ?? '',
      category: p.category ?? '',
      price: Number(p.price) || 0,
      stock: p.stock ?? 0,
      soldCount: countMap[p.id] || 0,
    }))

    const masVendidos = [...conVentas].filter((p) => p.soldCount > 0).sort((a, b) => b.soldCount - a.soldCount)
    const menosVendidos = [...conVentas].filter((p) => p.soldCount > 0).sort((a, b) => a.soldCount - b.soldCount)
    const sinVender = conVentas.filter((p) => p.soldCount === 0).sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      masVendidos,
      menosVendidos,
      sinVender,
      sinVenderCount: sinVender.length,
    })
  } catch (err: any) {
    console.error('[ranking-ventas]', err)
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 })
  }
}
