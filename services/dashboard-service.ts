// services/dashboard-service.ts
import { supabase } from '@/lib/supabase'
import type { Client, Product, Sale } from '@/lib/types'
import { incidenciasVenta } from '@/lib/utils/incidencias'

export function invalidateDashboardCache(): void {
  // No-op con Supabase
}

async function fetchDashboardData() {
  const now = new Date()

  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  sixMonthsAgo.setHours(0, 0, 0, 0)

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  const [salesRes, productsRes, ordersRes, debtorsRes, devolucionesRes] = await Promise.all([
    // Solo las columnas que usa el dashboard: evita arrastrar PDFs base64 y datos AFIP (muy pesado)
    supabase
      .from('ventas')
      .select('id, total, created_at, items, seller_name, items_no_entregados')
      .gte('created_at', sixMonthsAgo.toISOString())
      .not('remito_number', 'is', null) // igual que /ventas: solo ventas con remito
      .order('created_at', { ascending: false }),
    supabase
      .from('productos')
      .select('id, name, price, stock, image_url, category, disabled, created_at'),
    supabase
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'completed'),
    supabase
      .from('clientes')
      .select('id, name, cuit, email, phone, address, tax_category, credit_limit, current_balance, notes, created_at')
      .gt('current_balance', 0),
    supabase
      .from('devoluciones')
      .select('total, created_at, sale_id')
      .gte('created_at', sixMonthsAgo.toISOString()),
  ])

  const sales: Sale[] = (salesRes.data ?? []).map((d) => ({
    id: d.id,
    ...d,
    items: d.items ?? [],
    itemsNoEntregados: d.items_no_entregados ?? [],
    total: Number(d.total) || 0,
    createdAt: new Date(d.created_at),
  } as Sale))

  const products: Product[] = (productsRes.data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    price: Number(d.price) || 0,
    stock: d.stock ?? 0,
    imageUrl: d.image_url ?? '',
    category: d.category ?? '',
    disabled: d.disabled ?? false,
    createdAt: new Date(d.created_at),
  } as Product))

  const debtors: Client[] = (debtorsRes.data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    cuit: d.cuit ?? '',
    email: d.email ?? '',
    phone: d.phone ?? '',
    address: d.address ?? '',
    taxCategory: d.tax_category ?? 'consumidor_final',
    creditLimit: Number(d.credit_limit) || 0,
    currentBalance: Number(d.current_balance) || 0,
    notes: d.notes ?? '',
    createdAt: new Date(d.created_at),
  } as Client)).sort((a, b) => b.currentBalance - a.currentBalance)

  // Stats
  const todaySales = sales.filter((s) => {
    const d = new Date(s.createdAt)
    return d >= todayStart && d <= todayEnd
  })

  const stats = {
    todaySales: todaySales.reduce((acc, s) => acc + (s.total ?? 0), 0),
    todayOrders: todaySales.length,
    lowStockProducts: products.filter((p) => !p.disabled && p.stock < 10).length,
    totalDebt: debtors.reduce((acc, c) => acc + (c.currentBalance ?? 0), 0),
    pendingOrders: ordersRes.count ?? 0,
  }

  // Ventas ultimos 7 dias
  const formatter7 = new Intl.DateTimeFormat('es-AR', { weekday: 'short' })
  const salesLastDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayStart)
    d.setDate(todayStart.getDate() - (6 - i))
    return { date: d, total: 0 }
  })
  sales.forEach((s) => {
    const sd = new Date(s.createdAt)
    sd.setHours(0, 0, 0, 0)
    const bucket = salesLastDays.find((b) => b.date.getTime() === sd.getTime())
    if (bucket) bucket.total += s.total ?? 0
  })

  // Ventas por hora hoy
  const hourBuckets: { hour: string; total: number }[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h.toString().padStart(2, '0'),
    total: 0,
  }))
  todaySales.forEach((s) => {
    const h = new Date(s.createdAt).getHours()
    if (h >= 0 && h < 24) hourBuckets[h].total += s.total ?? 0
  })

  // Ventas ultimos 6 meses
  const formatterM = new Intl.DateTimeFormat('es-AR', { month: 'short' })
  const salesLastMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { date: d, total: 0, count: 0, perdida: 0, faltante: 0, rechazo: 0, incidenciasCount: 0, nc: 0 }
  })
  // Mapa saleId -> índice de mes, para imputar la NC al mes de la venta (igual que /ventas)
  const saleMonthIdx = new Map<string, number>()
  sales.forEach((s) => {
    const sd = new Date(s.createdAt)
    const sm = new Date(sd.getFullYear(), sd.getMonth(), 1)
    const idx = salesLastMonths.findIndex((b) => b.date.getTime() === sm.getTime())
    if (idx < 0) return
    const bucket = salesLastMonths[idx]
    saleMonthIdx.set(s.id, idx)
    bucket.total += s.total ?? 0
    bucket.count += 1
    const inc = incidenciasVenta((s as any).itemsNoEntregados)
    bucket.perdida += inc.perdida
    bucket.faltante += inc.faltante
    bucket.rechazo += inc.rechazo
    if (inc.perdida + inc.faltante + inc.rechazo > 0) bucket.incidenciasCount += 1
  })
  // Notas de crédito (devoluciones): se imputan al mes de la venta asociada.
  ;(devolucionesRes.data ?? []).forEach((d: any) => {
    const idx = d.sale_id != null ? saleMonthIdx.get(d.sale_id) : undefined
    if (idx === undefined) return // NC sin venta en la ventana (o venta sin remito) → no se muestra
    salesLastMonths[idx].nc += Number(d.total) || 0
  })

  const salesThisMonth = salesLastMonths[5]?.total ?? 0
  const salesPrevMonth = salesLastMonths[4]?.total ?? 0
  const monthDeltaPct = salesPrevMonth > 0
    ? ((salesThisMonth - salesPrevMonth) / salesPrevMonth) * 100
    : 0

  const productMap = new Map(products.map((p) => [p.id, p]))

  // Top productos + rubros más vendidos.
  // Los ítems de venta usan IDs mayorista (mp_XXXX); en `productos` son prod_mp_XXXX.
  const normId = (id: string) => (id?.startsWith('mp_') ? `prod_${id}` : id)

  const productSales: Record<string, { units: number; revenue: number }> = {}
  const soldIds = new Set<string>()
  sales.forEach((s) => {
    s.items?.forEach((item: any) => {
      const pid = item.productId
      if (!pid) return
      const qty = Number(item.quantity) || 0
      const rev = (Number(item.price) || 0) * qty
      if (!productSales[pid]) productSales[pid] = { units: 0, revenue: 0 }
      productSales[pid].units += qty
      productSales[pid].revenue += rev
      soldIds.add(pid)
    })
  })

  // Resolver rubro/nombre/imagen de los productos vendidos (incluye mayorista mp_ → prod_mp_)
  const realIds = [...new Set([...soldIds].map(normId))]
  const soldProdMap = new Map<string, { name: string; category: string; imageUrl: string }>()
  for (let i = 0; i < realIds.length; i += 400) {
    const chunk = realIds.slice(i, i + 400)
    const { data } = await supabase
      .from('productos')
      .select('id, name, category, image_url')
      .in('id', chunk)
    ;(data ?? []).forEach((r: any) => {
      soldProdMap.set(r.id, {
        name: r.name ?? '',
        category: (r.category ?? '').trim(),
        imageUrl: r.image_url ?? '',
      })
    })
  }
  const resolveProd = (pid: string) =>
    soldProdMap.get(normId(pid)) ?? productMap.get(pid)

  const categoryAgg: Record<string, { units: number; revenue: number }> = {}
  Object.entries(productSales).forEach(([pid, st]) => {
    const cat = (resolveProd(pid)?.category || '').trim() || 'Sin rubro'
    if (!categoryAgg[cat]) categoryAgg[cat] = { units: 0, revenue: 0 }
    categoryAgg[cat].units += st.units
    categoryAgg[cat].revenue += st.revenue
  })

  const topProducts = Object.entries(productSales)
    .map(([productId, st]) => {
      const p = resolveProd(productId)
      return p ? { id: normId(productId), name: p.name, category: p.category, units: st.units, revenue: st.revenue, imageUrl: (p as any).imageUrl ?? '' } : null
    })
    .filter(Boolean)
    .sort((a, b) => b!.units - a!.units)
    .slice(0, 6)

  const categoryRanking = Object.entries(categoryAgg)
    .map(([name, v]) => ({ name, units: v.units, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)

  // Ranking de vendedores (por facturación, últimos 6 meses)
  const sellerAgg: Record<string, { total: number; count: number }> = {}
  sales.forEach((s) => {
    const name = (((s as any).seller_name ?? '') as string).trim() || 'Sin vendedor'
    if (!sellerAgg[name]) sellerAgg[name] = { total: 0, count: 0 }
    sellerAgg[name].total += s.total ?? 0
    sellerAgg[name].count += 1
  })
  const sellerRanking = Object.entries(sellerAgg)
    .map(([name, v]) => ({ name, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  // Distribucion por categoria
  const categoryTotals: Record<string, number> = {}
  products.forEach((p) => {
    categoryTotals[p.category] = (categoryTotals[p.category] ?? 0) + 1
  })
  const colors = ['#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#a855f7']
  const productDistribution = Object.entries(categoryTotals)
    .map(([cat, count], i) => ({
      name: cat,
      value: Math.round((count / products.length) * 100),
      color: colors[i % colors.length],
    }))
    .sort((a, b) => b.value - a.value)

  // Bajo stock
  const lowStockProducts = products
    .filter((p) => !p.disabled && p.stock < 10)
    .sort((a, b) => a.stock - b.stock)

  return {
    stats: { ...stats, salesThisMonth, salesPrevMonth, monthDeltaPct },
    charts: {
      salesLastDays: salesLastDays.map((b) => ({ day: formatter7.format(b.date), total: b.total })),
      salesByHourToday: hourBuckets.filter((b) => b.total > 0),
      salesLastMonths: salesLastMonths.map((b) => {
        const incidencias = b.perdida + b.faltante + b.rechazo
        return {
          month: formatterM.format(b.date),
          total: b.total,
          neto: b.total - incidencias - b.nc,
          count: b.count,
          perdida: b.perdida,
          faltante: b.faltante,
          rechazo: b.rechazo,
          incidencias,
          incidenciasCount: b.incidenciasCount,
          nc: b.nc,
        }
      }),
      productDistribution,
    },
    lists: {
      topProducts,
      lowStockProducts,
      debtors,
      categoryRanking,
      sellerRanking,
    },
  }
}

export const getDashboardData = async (_forceRefresh = false) => {
  return fetchDashboardData()
}

export interface ClienteActividad {
  id: string
  name: string
  sellerName?: string
  lastPurchase: string
  daysSince: number
  phone?: string
  city?: string
}

// Clasifica los clientes que alguna vez compraron en "activos" (compraron dentro de `dias`)
// e "inactivos" (su última compra fue hace más de `dias`). Sirve para detectar clientes que
// dejaron de comprar (posible fuga a otro vendedor/distribuidora). El vendedor mostrado es el
// de la última venta del cliente.
export const getClientesActividad = async (dias = 30): Promise<{ activos: ClienteActividad[]; inactivos: ClienteActividad[]; dias: number }> => {
  const limite = new Date()
  limite.setDate(limite.getDate() - dias)
  limite.setHours(0, 0, 0, 0)

  const [clientesRes, ventasRes] = await Promise.all([
    supabase.from('clientes').select('id, name, phone, address'),
    supabase
      .from('ventas')
      .select('client_id, seller_name, created_at')
      .not('client_id', 'is', null)
      .order('created_at', { ascending: false }),
  ])

  // Como las ventas vienen ordenadas desc, la primera de cada cliente es su última compra.
  const ultima = new Map<string, { date: Date; sellerName?: string }>()
  for (const v of ventasRes.data ?? []) {
    const cid = (v as any).client_id as string
    if (!cid || ultima.has(cid)) continue
    ultima.set(cid, { date: new Date((v as any).created_at), sellerName: (v as any).seller_name ?? undefined })
  }

  const activos: ClienteActividad[] = []
  const inactivos: ClienteActividad[] = []
  const ahora = Date.now()

  for (const c of clientesRes.data ?? []) {
    const u = ultima.get((c as any).id)
    if (!u) continue // nunca compró: no es fuga, lo dejamos fuera
    const daysSince = Math.floor((ahora - u.date.getTime()) / 86400000)
    const item: ClienteActividad = {
      id: (c as any).id,
      name: (c as any).name,
      sellerName: u.sellerName,
      lastPurchase: u.date.toISOString(),
      daysSince,
      phone: (c as any).phone ?? undefined,
      city: (c as any).address ?? undefined,
    }
    if (u.date >= limite) activos.push(item)
    else inactivos.push(item)
  }

  inactivos.sort((a, b) => b.daysSince - a.daysSince)
  activos.sort((a, b) => a.daysSince - b.daysSince)
  return { activos, inactivos, dias }
}

export interface DeudorAntiguedad {
  id: string
  name: string
  phone?: string
  balance: number
  classification: 'normal' | 'atrasado' | 'moroso' | 'incobrable'
  debtSince?: string
  daysSince?: number
}

// Deudores ordenados por monto, con la antigüedad de la deuda más vieja (tabla transacciones,
// type='debt', primera con saldo > 0). Sirve para priorizar cobranza: cuánto y desde cuándo.
export const getDeudoresAntiguedad = async (): Promise<DeudorAntiguedad[]> => {
  const { data: cli } = await supabase
    .from('clientes')
    .select('id, name, phone, current_balance, debt_classification')
    .gt('current_balance', 0)

  const clientes = cli ?? []
  const ids = clientes.map((c: any) => c.id)
  const debtSinceMap: Record<string, Date> = {}

  if (ids.length > 0) {
    const { data: debts } = await supabase
      .from('transacciones')
      .select('client_id, date, saldo, amount')
      .in('client_id', ids)
      .eq('type', 'debt')
      .order('date', { ascending: true })
      .limit(20000)
    for (const t of debts ?? []) {
      const saldo = (t as any).saldo != null ? Number((t as any).saldo) : Number((t as any).amount)
      if (saldo <= 0) continue
      const cid = (t as any).client_id as string
      if (!debtSinceMap[cid]) debtSinceMap[cid] = new Date((t as any).date)
    }
  }

  const ahora = Date.now()
  return clientes
    .map((c: any) => {
      const ds = debtSinceMap[c.id]
      return {
        id: c.id,
        name: c.name,
        phone: c.phone ?? undefined,
        balance: Number(c.current_balance) || 0,
        classification: (c.debt_classification ?? 'normal') as DeudorAntiguedad['classification'],
        debtSince: ds ? ds.toISOString() : undefined,
        daysSince: ds ? Math.floor((ahora - ds.getTime()) / 86400000) : undefined,
      }
    })
    .sort((a, b) => b.balance - a.balance)
}

export const getDashboardStats = async () => (await getDashboardData()).stats
export const getSalesLastDays = async () => (await getDashboardData()).charts.salesLastDays
export const getSalesByHourToday = async () => (await getDashboardData()).charts.salesByHourToday
export const getSalesLastMonths = async () => (await getDashboardData()).charts.salesLastMonths
export const getTopProducts = async () => (await getDashboardData()).lists.topProducts
export const getProductDistribution = async () => (await getDashboardData()).charts.productDistribution
export const getLowStockProducts = async () => (await getDashboardData()).lists.lowStockProducts
export const getDebtors = async () => (await getDashboardData()).lists.debtors
