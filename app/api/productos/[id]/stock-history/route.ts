import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(5, parseInt(searchParams.get('limit') ?? '20')))
  const tipoFilter = searchParams.get('tipo') ?? 'all'

  const { id: productId } = await params

  try {
  // productos.id = prod_mp_{codigo}, mayorista_productos.id = mp_{codigo}
  const mayoristId = productId.replace(/^prod_/, '')
  const offset = (page - 1) * limit

  // Query paginada
  let pageQuery = supabaseAdmin
    .from('stock_movimientos')
    .select('id, tipo, cantidad, stock_anterior, stock_posterior, motivo, created_at', { count: 'exact' })
    .eq('mayorista_producto_id', mayoristId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (tipoFilter !== 'all') {
    pageQuery = (pageQuery as any).eq('tipo', tipoFilter)
  }

  const { data: movimientos, count, error } = await pageQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enriquecer con datos de ventas para los registros de esta página (ventas y regalos)
  const ventaIdsInPage = (movimientos ?? [])
    .filter((m: any) => (m.tipo === 'venta' || m.tipo === 'regalo') && m.motivo)
    .map((m: any) => m.motivo as string)

  let ventaMap: Record<string, { saleNumber: string | null; sellerName: string | null; clientName: string | null; ventaTotal: number | null }> = {}

  if (ventaIdsInPage.length > 0) {
    const { data: ventas } = await supabaseAdmin
      .from('ventas')
      .select('id, sale_number, seller_name, client_name, total, items')
      .in('id', ventaIdsInPage)

    for (const v of (ventas ?? [])) {
      const productItems = ((v.items ?? []) as any[]).filter((i) => i.productId === productId)
      const productTotal = productItems.reduce((s: number, i: any) => {
        const disc = i.itemDiscount ?? 0
        return s + (i.price * i.quantity * (1 - disc / 100))
      }, 0)

      ventaMap[v.id] = {
        saleNumber: v.sale_number ?? null,
        sellerName: v.seller_name ?? null,
        clientName: v.client_name ?? null,
        ventaTotal: productTotal > 0 ? Math.round(productTotal) : (v.total ?? null),
      }
    }
  }

  const data = (movimientos ?? []).map((m: any) => {
    const venta = (m.tipo === 'venta' || m.tipo === 'regalo') && m.motivo ? (ventaMap[m.motivo] ?? null) : null
    return {
      id: String(m.id),
      tipo: m.tipo,
      cantidad: m.cantidad,
      stockAnterior: m.stock_anterior,
      stockPosterior: m.stock_posterior,
      motivo: m.motivo ?? null,
      fecha: m.created_at,
      saleNumber: venta?.saleNumber ?? null,
      sellerName: venta?.sellerName ?? null,
      clientName: venta?.clientName ?? null,
      // Los regalos son gratis: no muestran monto
      ventaTotal: m.tipo === 'regalo' ? null : (venta?.ventaTotal ?? null),
    }
  })

  // Stats: todos los movimientos del producto (solo columnas necesarias)
  const { data: allMovs } = await supabaseAdmin
    .from('stock_movimientos')
    .select('tipo, cantidad, stock_posterior, motivo')
    .eq('mayorista_producto_id', mayoristId)
    .order('created_at', { ascending: false })

  const salesMovs = (allMovs ?? []).filter((m: any) => m.tipo === 'venta')
  const unitsSold = salesMovs.reduce((s: number, m: any) => s + Math.abs(m.cantidad), 0)
  const unitsGifted = (allMovs ?? []).filter((m: any) => m.tipo === 'regalo').reduce((s: number, m: any) => s + Math.abs(m.cantidad), 0)
  const adjustments = (allMovs ?? []).filter((m: any) => m.tipo === 'ajuste' || m.tipo === 'rotura').length
  const lastStock = (allMovs ?? [])[0] ? (allMovs as any[])[0].stock_posterior : null

  // Revenue: batch fetch ventas y sumar por producto
  const allVentaIds = [...new Set(salesMovs.map((m: any) => m.motivo).filter(Boolean))] as string[]
  let totalRevenue = 0
  if (allVentaIds.length > 0) {
    const { data: allVentas } = await supabaseAdmin
      .from('ventas')
      .select('id, items, total')
      .in('id', allVentaIds)

    for (const v of (allVentas ?? [])) {
      const productItems = ((v.items ?? []) as any[]).filter((i) => i.productId === productId)
      if (productItems.length > 0) {
        const amt = productItems.reduce((s: number, i: any) => {
          const disc = i.itemDiscount ?? 0
          return s + (i.price * i.quantity * (1 - disc / 100))
        }, 0)
        totalRevenue += amt
      }
    }
  }

  // Stock en pedidos activos
  const { data: pedidosActivos } = await supabaseAdmin
    .from('pedidos')
    .select('items')
    .in('status', ['pending', 'preparation', 'delivery'])

  let stockEnPedidos = 0
  for (const p of (pedidosActivos ?? [])) {
    const items = ((p.items ?? []) as any[]).filter((i) => i.productId === productId)
    stockEnPedidos += items.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0)
  }

  const stockHistorico = (lastStock ?? 0) + unitsSold

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return NextResponse.json({
    data,
    total,
    page,
    totalPages,
    stats: {
      unitsSold,
      unitsGifted,
      totalRevenue: Math.round(totalRevenue),
      adjustments,
      currentStock: lastStock,
      stockHistorico,
      stockEnPedidos,
    },
  })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 })
  }
}
