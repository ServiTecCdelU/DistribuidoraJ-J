// services/dashboard-service.ts
// Reads optimizados: una sola lectura de ventas (últimos 6 meses),
// una de productos, y caché en localStorage de 5 minutos.
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import type { Client, Product, Sale } from '@/lib/types'
import { toDate } from '@/services/firestore-helpers'

const PRODUCTS_COLLECTION = 'productos'
const CLIENTS_COLLECTION = 'clientes'
const SALES_COLLECTION = 'ventas'
const ORDERS_COLLECTION = 'pedidos'

// ─── Caché en localStorage ────────────────────────────────────────────────────
const CACHE_KEY = 'dashboard_cache_v1'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

interface DashboardCache {
  ts: number
  data: Awaited<ReturnType<typeof fetchDashboardData>>
}

function readDashboardCache(): DashboardCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DashboardCache
    if (!parsed?.ts) return null
    return parsed
  } catch {
    return null
  }
}

function writeDashboardCache(data: DashboardCache['data']): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch { /* noop */ }
}

export function invalidateDashboardCache(): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(CACHE_KEY) } catch { /* noop */ }
}

// ─── Fetch interno (sin caché) ────────────────────────────────────────────────
async function fetchDashboardData() {
  const now = new Date()

  // Límite: últimos 6 meses para ventas (cubre todos los gráficos)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  sixMonthsAgo.setHours(0, 0, 0, 0)

  // Hoy para ventas del día
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  // Leer todo en paralelo, pero SOLO lo necesario
  const [recentSalesSnap, productsSnap, ordersSnap, debtorsSnap] = await Promise.all([
    // Una sola lectura de ventas de los últimos 6 meses
    getDocs(query(
      collection(firestore, SALES_COLLECTION),
      where('createdAt', '>=', sixMonthsAgo),
      orderBy('createdAt', 'desc'),
    )),
    getDocs(collection(firestore, PRODUCTS_COLLECTION)),
    getDocs(query(collection(firestore, ORDERS_COLLECTION), where('status', '!=', 'completed'))),
    getDocs(query(collection(firestore, CLIENTS_COLLECTION), where('currentBalance', '>', 0))),
  ])

  const sales = recentSalesSnap.docs.map(d => {
    const data = d.data()
    return { id: d.id, ...data, createdAt: toDate(data.createdAt) } as Sale
  })

  const products = productsSnap.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name,
      description: data.description,
      price: data.price,
      stock: data.stock,
      imageUrl: data.imageUrl,
      category: data.category,
      disabled: data.disabled ?? false,
      createdAt: toDate(data.createdAt),
    } as Product
  })

  const debtors = debtorsSnap.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name,
      cuit: data.cuit,
      email: data.email,
      phone: data.phone,
      address: data.address,
      taxCategory: data.taxCategory,
      creditLimit: data.creditLimit,
      currentBalance: data.currentBalance ?? 0,
      notes: data.notes ?? '',
      createdAt: toDate(data.createdAt),
    } as Client
  }).sort((a, b) => b.currentBalance - a.currentBalance)

  // ── Stats ──────────────────────────────────────────────────────────────────
  const todaySales = sales.filter(s => {
    const d = toDate(s.createdAt)
    return d >= todayStart && d <= todayEnd
  })

  const stats = {
    todaySales: todaySales.reduce((acc, s) => acc + (s.total ?? 0), 0),
    todayOrders: todaySales.length,
    lowStockProducts: products.filter(p => !p.disabled && p.stock < 10).length,
    totalDebt: debtors.reduce((acc, c) => acc + (c.currentBalance ?? 0), 0),
    pendingOrders: ordersSnap.size,
  }

  // ── Ventas últimos 7 días ──────────────────────────────────────────────────
  const formatter7 = new Intl.DateTimeFormat('es-AR', { weekday: 'short' })
  const salesLastDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayStart)
    d.setDate(todayStart.getDate() - (6 - i))
    return { date: d, total: 0 }
  })
  sales.forEach(s => {
    const sd = new Date(toDate(s.createdAt))
    sd.setHours(0, 0, 0, 0)
    const bucket = salesLastDays.find(b => b.date.getTime() === sd.getTime())
    if (bucket) bucket.total += s.total ?? 0
  })

  // ── Ventas por hora hoy ────────────────────────────────────────────────────
  const hourBuckets: { hour: string; total: number }[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h.toString().padStart(2, '0'),
    total: 0,
  }))
  todaySales.forEach(s => {
    const h = toDate(s.createdAt).getHours()
    if (h >= 0 && h < 24) hourBuckets[h].total += s.total ?? 0
  })

  // ── Ventas últimos 6 meses ─────────────────────────────────────────────────
  const formatterM = new Intl.DateTimeFormat('es-AR', { month: 'short' })
  const salesLastMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { date: d, total: 0 }
  })
  sales.forEach(s => {
    const sd = toDate(s.createdAt)
    const sm = new Date(sd.getFullYear(), sd.getMonth(), 1)
    const bucket = salesLastMonths.find(b => b.date.getTime() === sm.getTime())
    if (bucket) bucket.total += s.total ?? 0
  })

  // ── Top productos ──────────────────────────────────────────────────────────
  const productSales: Record<string, { units: number; revenue: number }> = {}
  sales.forEach(s => {
    s.items?.forEach(item => {
      if (!productSales[item.productId]) productSales[item.productId] = { units: 0, revenue: 0 }
      productSales[item.productId].units += item.quantity
      productSales[item.productId].revenue += item.price * item.quantity
    })
  })
  const topProducts = Object.entries(productSales)
    .map(([productId, st]) => {
      const p = products.find(x => x.id === productId)
      return p ? { id: p.id, name: p.name, category: p.category, units: st.units, revenue: st.revenue, imageUrl: p.imageUrl } : null
    })
    .filter(Boolean)
    .sort((a, b) => b!.units - a!.units)
    .slice(0, 5)

  // ── Distribución por categoría ─────────────────────────────────────────────
  const categoryTotals: Record<string, number> = {}
  products.forEach(p => {
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

  // ── Bajo stock ─────────────────────────────────────────────────────────────
  const lowStockProducts = products
    .filter(p => !p.disabled && p.stock < 10)
    .sort((a, b) => a.stock - b.stock)

  return {
    stats,
    charts: {
      salesLastDays: salesLastDays.map(b => ({ day: formatter7.format(b.date), total: b.total })),
      salesByHourToday: hourBuckets.filter(b => b.total > 0),
      salesLastMonths: salesLastMonths.map(b => ({ month: formatterM.format(b.date), total: b.total })),
      productDistribution,
    },
    lists: {
      topProducts,
      lowStockProducts,
      debtors,
    },
  }
}

// ─── API pública (con caché) ──────────────────────────────────────────────────
export const getDashboardData = async (forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = readDashboardCache()
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data
  }
  const data = await fetchDashboardData()
  writeDashboardCache(data)
  return data
}

// Mantener compatibilidad con código que llama a las funciones individuales
export const getDashboardStats = async () => (await getDashboardData()).stats
export const getSalesLastDays = async () => (await getDashboardData()).charts.salesLastDays
export const getSalesByHourToday = async () => (await getDashboardData()).charts.salesByHourToday
export const getSalesLastMonths = async () => (await getDashboardData()).charts.salesLastMonths
export const getTopProducts = async () => (await getDashboardData()).lists.topProducts
export const getProductDistribution = async () => (await getDashboardData()).charts.productDistribution
export const getLowStockProducts = async () => (await getDashboardData()).lists.lowStockProducts
export const getDebtors = async () => (await getDashboardData()).lists.debtors
