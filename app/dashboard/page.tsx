'use client'

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Award,
  CreditCard,
  DollarSign,
  Layers,
  Medal,
  Package,
  Search,
  ShoppingCart,
  Trophy,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  ChevronRight,
  Loader2,
  ArrowLeftRight,
  MessageCircle,
  Coins,
  Landmark,
  Clock,
} from 'lucide-react'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { dashboardApi, ordersApi, transferApi } from '@/lib/api'
import type { TransferConfig } from '@/lib/api'
import type { MontoDisponible } from '@/services/rentabilidad-service'
import { Wallet } from 'lucide-react'
import type { Product, Order } from '@/lib/types'
import { formatCurrency } from '@/lib/utils/format'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface MonthData {
  month: string
  total: number
  neto: number
  count: number
  perdida: number
  faltante: number
  rechazo: number
  incidencias: number
  incidenciasCount: number
  nc: number
}
interface SellerRank { name: string; total: number; count: number }
interface CategoryRank { name: string; units: number; revenue: number }
interface DeudorAntiguedad {
  id: string
  name: string
  phone?: string
  balance: number
  classification: 'normal' | 'atrasado' | 'moroso' | 'incobrable'
  debtSince?: string
  daysSince?: number
}
interface ClienteActividad {
  id: string
  name: string
  sellerName?: string
  lastPurchase: string
  daysSince: number
  phone?: string
}

const classMeta: Record<DeudorAntiguedad['classification'], { label: string; cls: string }> = {
  normal: { label: 'Al día', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  atrasado: { label: 'Atrasado', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  moroso: { label: 'Moroso', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  incobrable: { label: 'Incobrable', cls: 'bg-rose-100 text-rose-900 border-rose-300' },
}

function MonthTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as MonthData
  return (
    <div className="rounded-xl border border-border/50 bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-semibold capitalize mb-1">{d.month}</p>
      <p className="text-muted-foreground">Bruto: <span className="font-medium text-foreground">{formatCurrency(d.total)}</span></p>
      {d.incidencias > 0 && (
        <p className="text-rose-600">Incidencias: −{formatCurrency(d.incidencias)}</p>
      )}
      {d.nc > 0 && (
        <p className="text-rose-600">Notas de crédito: −{formatCurrency(d.nc)}</p>
      )}
      <p className="text-teal-700 font-semibold mt-0.5">Neto: {formatCurrency(d.neto)}</p>
    </div>
  )
}

const podiumStyle = [
  { ring: 'ring-amber-300', bg: 'bg-amber-50', text: 'text-amber-600', icon: Trophy },
  { ring: 'ring-slate-300', bg: 'bg-slate-50', text: 'text-slate-500', icon: Medal },
  { ring: 'ring-orange-300', bg: 'bg-orange-50', text: 'text-orange-600', icon: Award },
]

const RUBRO_COLORS = ['#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#22c55e', '#84cc16', '#06b6d4', '#0ea5e9']

function waLink(phone: string | undefined, msg: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)

  const [stats, setStats] = useState({
    todaySales: 0,
    todayOrders: 0,
    lowStockProducts: 0,
    totalDebt: 0,
    pendingOrders: 0,
    salesThisMonth: 0,
    salesPrevMonth: 0,
    monthDeltaPct: 0,
  })
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([])
  const [pendingOrders, setPendingOrders] = useState<Order[]>([])
  const [salesLastDays, setSalesLastDays] = useState<{ day: string; total: number }[]>([])
  const [monthlyComparison, setMonthlyComparison] = useState<MonthData[]>([])
  const [mesDetalle, setMesDetalle] = useState<MonthData | null>(null)
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [productDistribution, setProductDistribution] = useState<{ name: string; value: number; color: string }[]>([])
  const [sellerRanking, setSellerRanking] = useState<SellerRank[]>([])
  const [categoryRanking, setCategoryRanking] = useState<CategoryRank[]>([])
  const [deudores, setDeudores] = useState<DeudorAntiguedad[]>([])
  const [inactivos, setInactivos] = useState<ClienteActividad[]>([])
  const [montoDisponible, setMontoDisponible] = useState<MontoDisponible | null>(null)

  const [deudorQuery, setDeudorQuery] = useState('')
  const [inactivoQuery, setInactivoQuery] = useState('')

  const [aliasModalOpen, setAliasModalOpen] = useState(false)
  const [aliasConfig, setAliasConfig] = useState<TransferConfig>({ alias: '', titular: '', banco: '' })
  const [aliasSaving, setAliasSaving] = useState(false)

  const loadDashboardData = useCallback(async (isMounted?: () => boolean) => {
    setLoading(true)
    try {
      const now = new Date()
      const [data, orders, transferCfg, actividad, deudoresData, monto] = await Promise.all([
        dashboardApi.getDashboardData(),
        ordersApi.getActive(),
        transferApi.getConfig(),
        dashboardApi.getClientesActividad(30),
        dashboardApi.getDeudoresAntiguedad(),
        dashboardApi.getMontoDisponibleMes(now.getFullYear(), now.getMonth() + 1),
      ])
      if (isMounted && !isMounted()) return
      setStats(data.stats as typeof stats)
      setLowStockProducts(data.lists.lowStockProducts)
      setPendingOrders(orders.filter(o => o.status && o.status !== 'completed' && Array.isArray(o.items)))
      setSalesLastDays(data.charts.salesLastDays)
      setMonthlyComparison(data.charts.salesLastMonths)
      setTopProducts(data.lists.topProducts || [])
      setProductDistribution(data.charts.productDistribution || [])
      setSellerRanking((data.lists as any).sellerRanking || [])
      setCategoryRanking((data.lists as any).categoryRanking || [])
      setAliasConfig(transferCfg)
      setInactivos(actividad.inactivos as ClienteActividad[])
      setDeudores(deudoresData as DeudorAntiguedad[])
      setMontoDisponible(monto)
    } catch (error) {
      if (isMounted && !isMounted()) return
      toast.error('Error al cargar el dashboard')
    } finally {
      if (isMounted && !isMounted()) return
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    loadDashboardData(() => mounted)
    return () => { mounted = false }
  }, [loadDashboardData])

  const handleSaveAlias = async () => {
    setAliasSaving(true)
    try {
      await transferApi.saveConfig(aliasConfig)
      setAliasModalOpen(false)
    } catch {
      toast.error('Error al guardar datos de transferencia')
    } finally {
      setAliasSaving(false)
    }
  }

  const maxSeller = useMemo(() => Math.max(1, ...sellerRanking.map(s => s.total)), [sellerRanking])
  const filteredDeudores = useMemo(
    () => deudores.filter(d => d.name?.toLowerCase().includes(deudorQuery.toLowerCase())),
    [deudores, deudorQuery],
  )
  const filteredInactivos = useMemo(
    () => inactivos.filter(c => c.name?.toLowerCase().includes(inactivoQuery.toLowerCase())),
    [inactivos, inactivoQuery],
  )

  const kpis = useMemo(() => {
    const isUp = stats.monthDeltaPct >= 0
    return [
      {
        id: 'hoy', title: 'Ventas hoy', value: formatCurrency(stats.todaySales),
        detail: `${stats.todayOrders} ventas`, icon: DollarSign, color: 'teal',
      },
      {
        id: 'mes', title: 'Ventas del mes', value: formatCurrency(stats.salesThisMonth),
        detail: `${isUp ? '+' : ''}${stats.monthDeltaPct.toFixed(1)}% vs mes anterior`,
        delta: stats.monthDeltaPct, icon: TrendingUp, color: 'cyan',
      },
      {
        id: 'deuda', title: 'Deuda total', value: formatCurrency(stats.totalDebt),
        detail: `${deudores.length} clientes deben`, icon: CreditCard, color: 'orange',
      },
      {
        id: 'pendientes', title: 'Pedidos pendientes', value: `${stats.pendingOrders}`,
        detail: `${pendingOrders.filter(o => o.status === 'delivery').length} en camino`, icon: Truck, color: 'sky',
      },
      {
        id: 'stock', title: 'Stock bajo', value: `${stats.lowStockProducts}`,
        detail: `${lowStockProducts.filter(p => p.stock < 5).length} críticos`, icon: AlertTriangle, color: 'rose',
      },
    ]
  }, [stats, deudores, pendingOrders, lowStockProducts])

  if (loading) {
    return (
      <MainLayout allowedRoles={['admin']} title="Dashboard" description="Resumen ejecutivo y operación diaria">
        <div className="min-h-screen bg-slate-50/50">
          <div className="max-w-[1600px] mx-auto p-3 sm:p-4 lg:p-6 space-y-4">
            <Skeleton className="h-24 rounded-2xl" />
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
            </div>
          </div>
        </div>
      </MainLayout>
    )
  }

  const colorMap: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
    cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    sky: 'bg-sky-50 text-sky-600 border-sky-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
  }

  return (
    <MainLayout allowedRoles={['admin']} title="Dashboard" description="Resumen ejecutivo y operación diaria">
      <div className="min-h-screen bg-slate-50/50">
        <div className="max-w-[1600px] mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-5">

          {/* Hero */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-500 shadow-sm">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.25),transparent_60%)]" />
            <div className="relative p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <nav className="flex items-center gap-1.5 text-xs text-white/70 mb-1">
                  <span>Inicio</span><ChevronRight className="h-3 w-3" /><span className="text-white font-medium">Dashboard</span>
                </nav>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Distribuidora Patricia</h2>
                <p className="text-xs sm:text-sm text-white/80 mt-0.5">Rendimiento, cobranza y oportunidades de venta de un vistazo.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="rounded-xl bg-white text-teal-700 hover:bg-white/90 gap-1.5 shadow-sm" onClick={() => window.location.href = '/ventas/nueva'}>
                  <ShoppingCart className="h-4 w-4" /> Nueva venta
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl bg-white/10 text-white border-white/30 hover:bg-white/20 gap-1.5" onClick={() => setAliasModalOpen(true)}>
                  <ArrowLeftRight className="h-4 w-4" /> {aliasConfig.alias || 'Alias transferencia'}
                </Button>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {kpis.map((kpi) => {
              const Icon = kpi.icon
              const hasDelta = typeof kpi.delta === 'number'
              const up = (kpi.delta ?? 0) >= 0
              return (
                <Card key={kpi.id} className="border-border/40 bg-white shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 rounded-2xl">
                  <CardContent className="p-3 sm:p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground truncate pr-1">{kpi.title}</span>
                      <div className={`h-8 w-8 rounded-xl flex items-center justify-center border shrink-0 ${colorMap[kpi.color]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground tracking-tight truncate">{kpi.value}</div>
                    <div className="flex items-center gap-1 text-xs">
                      {hasDelta && (
                        <span className={`inline-flex items-center gap-0.5 font-medium px-1.5 py-0.5 rounded-full border ${up ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                          {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        </span>
                      )}
                      <span className="text-muted-foreground truncate">{kpi.detail}</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </section>

          {/* Monto disponible (rentabilidad del mes) */}
          {montoDisponible && (
            <Card className="border-border/40 bg-white shadow-sm rounded-2xl overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,300px)_1fr]">
                {/* Resultado */}
                <div className={`p-4 sm:p-6 flex flex-col justify-center ${montoDisponible.total >= 0 ? 'bg-gradient-to-br from-teal-600 to-cyan-500' : 'bg-gradient-to-br from-rose-600 to-orange-500'}`}>
                  <div className="flex items-center gap-2 text-white/80 text-xs font-medium">
                    <Wallet className="h-4 w-4" /> Monto aproximado que me queda
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
                    {formatCurrency(montoDisponible.total)}
                  </div>
                  <p className="text-[11px] text-white/70 mt-1">Mes en curso · estimado</p>
                </div>
                {/* Desglose */}
                <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                  {[
                    { label: 'Efectivo (mes)', value: montoDisponible.efectivoMes, sign: 1 },
                    { label: 'Transferencia (mes)', value: montoDisponible.transferenciaMes, sign: 1 },
                    { label: 'Cta cte clientes', value: montoDisponible.ctaCteClientes, sign: 1 },
                    { label: 'Cta cte mayorista', value: montoDisponible.ctaCteMayorista, sign: -1 },
                    { label: 'Comisiones (mes)', value: montoDisponible.comisionesMes, sign: -1 },
                    { label: 'Gastos (mes)', value: montoDisponible.gastosMes, sign: -1 },
                  ].map((it) => (
                    <div key={it.label} className="min-w-0">
                      <p className="text-[11px] text-muted-foreground truncate">{it.label}</p>
                      <p className={`text-sm font-bold tracking-tight ${it.sign > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {it.sign > 0 ? '+' : '−'}{formatCurrency(it.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Plata líquida — lo que realmente tengo en el bolsillo */}
          {montoDisponible && (
            <Card className="border-border/40 bg-white shadow-sm rounded-2xl overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,300px)_1fr]">
                {/* Resultado */}
                <div className="p-4 sm:p-6 flex flex-col justify-center bg-gradient-to-br from-emerald-600 to-teal-500">
                  <div className="flex items-center gap-2 text-white/80 text-xs font-medium">
                    <Wallet className="h-4 w-4" /> Plata líquida (en el bolsillo)
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
                    {formatCurrency(montoDisponible.efectivoMes + montoDisponible.transferenciaMes)}
                  </div>
                  <p className="text-[11px] text-white/70 mt-1">Cobrado este mes · efectivo + banco</p>
                </div>
                {/* Desglose */}
                <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3 items-center">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center border bg-emerald-50 text-emerald-600 border-emerald-100 shrink-0">
                      <Coins className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground truncate">Efectivo en caja</p>
                      <p className="text-sm font-bold text-foreground tracking-tight">{formatCurrency(montoDisponible.efectivoMes)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center border bg-teal-50 text-teal-600 border-teal-100 shrink-0">
                      <Landmark className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground truncate">En el banco (transfer.)</p>
                      <p className="text-sm font-bold text-foreground tracking-tight">{formatCurrency(montoDisponible.transferenciaMes)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center border bg-amber-50 text-amber-600 border-amber-100 shrink-0">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground truncate">Por cobrar (cta cte)</p>
                      <p className="text-sm font-bold text-amber-600 tracking-tight">{formatCurrency(montoDisponible.ctaCteClientes)}</p>
                      <p className="text-[10px] text-muted-foreground">no lo tenés todavía</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Ventas: mensual + diario */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            <Card className="lg:col-span-2 border-border/40 bg-white shadow-sm rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-4 pb-1">
                <div>
                  <CardTitle className="text-sm sm:text-base font-semibold">Ventas últimos 6 meses</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Facturación mensual · clic en un mes para el detalle</p>
                </div>
                <Badge variant="secondary" className={`rounded-lg font-medium text-xs ${stats.monthDeltaPct >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                  {stats.monthDeltaPct >= 0 ? '+' : ''}{stats.monthDeltaPct.toFixed(1)}% mensual
                </Badge>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0">
                <ChartContainer config={{ total: { label: 'Ventas', color: '#0d9488' } }} className="h-48 sm:h-60 w-full">
                  <BarChart data={monthlyComparison} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="barTeal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#14b8a6" />
                        <stop offset="100%" stopColor="#0d9488" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} dy={8} />
                    <ChartTooltip cursor={{ fill: 'rgba(13,148,136,0.06)' }} content={<MonthTooltip />} />
                    <Bar dataKey="total" fill="url(#barTeal)" radius={[6, 6, 0, 0]} className="cursor-pointer" onClick={(d: any) => setMesDetalle(d?.payload ?? null)} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-white shadow-sm rounded-2xl">
              <CardHeader className="p-3 sm:p-4 pb-1">
                <CardTitle className="text-sm sm:text-base font-semibold">Ventas últimos 7 días</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Tendencia diaria</p>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0">
                <ChartContainer config={{ total: { label: 'Ventas', color: '#06b6d4' } }} className="h-48 sm:h-60 w-full">
                  <BarChart data={salesLastDays} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="barCyan" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#0891b2" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} dy={8} />
                    <ChartTooltip content={<ChartTooltipContent />} formatter={(value) => formatCurrency(Number(value))} />
                    <Bar dataKey="total" fill="url(#barCyan)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* Detalle del mes (clic en la barra) */}
          <Dialog open={!!mesDetalle} onOpenChange={(o) => { if (!o) setMesDetalle(null) }}>
            <DialogContent className="sm:max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle className="capitalize">Detalle de {mesDetalle?.month}</DialogTitle>
              </DialogHeader>
              {mesDetalle && (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cantidad de ventas</span>
                    <span className="font-semibold">{mesDetalle.count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Facturación bruta</span>
                    <span className="font-semibold">{formatCurrency(mesDetalle.total)}</span>
                  </div>
                  <div className="h-px bg-border/60" />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Ventas con incidencias</span>
                    <span className="font-semibold">{mesDetalle.incidenciasCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pérdida (roturas)</span>
                    <span className="text-rose-600">−{formatCurrency(mesDetalle.perdida)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Faltantes</span>
                    <span className="text-rose-600">−{formatCurrency(mesDetalle.faltante)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Rechazos (devoluciones)</span>
                    <span className="text-rose-600">−{formatCurrency(mesDetalle.rechazo)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total incidencias</span>
                    <span className="font-semibold text-rose-600">−{formatCurrency(mesDetalle.incidencias)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Notas de crédito</span>
                    <span className="font-semibold text-rose-600">−{formatCurrency(mesDetalle.nc)}</span>
                  </div>
                  <div className="h-px bg-border/60" />
                  <div className="flex items-center justify-between text-base">
                    <span className="font-semibold">Monto final (neto)</span>
                    <span className="font-bold text-teal-700">{formatCurrency(mesDetalle.neto)}</span>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" className="rounded-xl" onClick={() => setMesDetalle(null)}>Cerrar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Vendedores + Rubros */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {/* Ranking vendedores */}
            <Card className="border-border/40 bg-white shadow-sm rounded-2xl">
              <CardHeader className="p-3 sm:p-4 pb-2">
                <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
                  <Trophy className="h-4 w-4 text-amber-500" /> Vendedores que más venden
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Por facturación · últimos 6 meses</p>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0 space-y-2">
                {sellerRanking.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">Sin datos de ventas.</p>
                ) : sellerRanking.map((s, i) => {
                  const pct = Math.round((s.total / maxSeller) * 100)
                  const style = podiumStyle[i]
                  const Icon = style?.icon
                  return (
                    <div key={s.name} className="flex items-center gap-2.5">
                      <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 border ${style ? `${style.bg} ${style.text} ring-2 ${style.ring}` : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                        {Icon ? <Icon className="h-4 w-4" /> : i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-foreground truncate">{s.name}</span>
                          <span className="text-xs font-bold text-foreground shrink-0">{formatCurrency(s.total)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{s.count} ventas</p>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Rubros más vendidos */}
            <Card className="border-border/40 bg-white shadow-sm rounded-2xl">
              <CardHeader className="p-3 sm:p-4 pb-1">
                <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-teal-500" /> Rubros más vendidos
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Por facturación · últimos 6 meses</p>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0">
                {categoryRanking.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">Sin datos de rubros.</p>
                ) : (
                  <ChartContainer config={{ revenue: { label: 'Facturación', color: '#0d9488' } }} className="h-56 sm:h-64 w-full">
                    <BarChart data={categoryRanking} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 11 }} />
                      <ChartTooltip content={<ChartTooltipContent />} formatter={(value) => formatCurrency(Number(value))} />
                      <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                        {categoryRanking.map((_, i) => <Cell key={i} fill={RUBRO_COLORS[i % RUBRO_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Productos: top + distribución */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            <Card className="lg:col-span-2 border-border/40 bg-white shadow-sm rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-4 pb-2">
                <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-cyan-500" /> Productos más vendidos
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-teal-600 hover:text-teal-700 hover:bg-teal-50" onClick={() => window.location.href = '/productos?sort=ventas'}>
                  Ver todos <ArrowRight className="h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0 space-y-1.5">
                {topProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">Sin ventas registradas.</p>
                ) : topProducts.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => window.location.href = `/productos?id=${p.id}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-xs font-bold text-teal-600 shrink-0">{i + 1}</div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{p.category || 'Sin rubro'}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-foreground">{p.units} uds</p>
                      <p className="text-[11px] text-muted-foreground">{formatCurrency(p.revenue || 0)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-white shadow-sm rounded-2xl">
              <CardHeader className="p-3 sm:p-4 pb-1">
                <CardTitle className="text-sm sm:text-base font-semibold">Catálogo por rubro</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">% de productos</p>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0">
                <div className="h-32 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={productDistribution} dataKey="value" nameKey="name" innerRadius={36} outerRadius={56} paddingAngle={3}>
                        {productDistribution.map((entry) => <Cell key={entry.name} fill={entry.color} strokeWidth={0} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <div className="text-lg font-bold text-slate-700">{productDistribution.length > 0 ? `${productDistribution[0].value}%` : '0%'}</div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-[80px]">{productDistribution.length > 0 ? productDistribution[0].name : 'Sin datos'}</div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {productDistribution.slice(0, 5).map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-muted-foreground truncate">{item.name}</span>
                      </div>
                      <span className="font-medium text-foreground shrink-0">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cobranza + Oportunidades de venta */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {/* Deudores por antigüedad */}
            <Card className="border-border/40 bg-white shadow-sm rounded-2xl">
              <CardHeader className="p-3 sm:p-4 pb-2 space-y-2">
                <div>
                  <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-orange-500" /> Deudores por monto y antigüedad
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Priorizar cobranza: cuánto y desde cuándo deben</p>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Buscar cliente..." value={deudorQuery} onChange={(e) => setDeudorQuery(e.target.value)} className="pl-8 h-8 text-xs rounded-xl" />
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0">
                {filteredDeudores.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">Sin deudores.</p>
                ) : (
                  <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                    {filteredDeudores.slice(0, 50).map((d) => {
                      const meta = classMeta[d.classification] ?? classMeta.normal
                      return (
                        <div key={d.id} className="flex items-center justify-between gap-2 py-2 cursor-pointer hover:bg-slate-50 rounded-lg px-1" onClick={() => window.location.href = '/cuenta-corriente'}>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{d.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge variant="outline" className={`text-[10px] py-0 ${meta.cls}`}>{meta.label}</Badge>
                              {typeof d.daysSince === 'number' && (
                                <span className="text-[10px] text-muted-foreground">hace {d.daysSince} días</span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs font-bold text-orange-600 shrink-0">{formatCurrency(d.balance)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Clientes que dejaron de comprar — para ofertar */}
            <Card className="border-border/40 bg-white shadow-sm rounded-2xl">
              <CardHeader className="p-3 sm:p-4 pb-2 space-y-2">
                <div>
                  <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-rose-500" /> Dejaron de comprar — ofertar
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Sin compras en +30 días. Recuperalos con una oferta.</p>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Buscar cliente..." value={inactivoQuery} onChange={(e) => setInactivoQuery(e.target.value)} className="pl-8 h-8 text-xs rounded-xl" />
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0">
                {filteredInactivos.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">No hay clientes inactivos.</p>
                ) : (
                  <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                    {filteredInactivos.slice(0, 50).map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {c.sellerName ? `Vend: ${c.sellerName}` : 'Sin vendedor'} · últ. {new Date(c.lastPurchase).toLocaleDateString('es-AR')}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">hace {c.daysSince}d</Badge>
                          {c.phone && (
                            <a href={waLink(c.phone, `Hola ${c.name}! Tenemos una oferta especial para vos en Distribuidora Patricia.`)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-lg text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                                <MessageCircle className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stock bajo + Pedidos pendientes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <Card className="border-border/40 bg-white shadow-sm rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-4 pb-2">
                <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-rose-500" /> Stock bajo
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => window.location.href = '/productos?filter=low-stock'}>
                  Ver todos <ArrowRight className="h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0 space-y-2">
                {lowStockProducts.slice(0, 5).map((product) => {
                  const isCritical = product.stock < 5
                  return (
                    <div key={product.id} className="flex items-center justify-between gap-2 p-2 rounded-xl border border-slate-100 hover:border-rose-200 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img src={product.imageUrl || '/placeholder.svg'} alt={product.name} className="h-9 w-9 rounded-lg object-cover border border-slate-100 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{product.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{product.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge className={`${isCritical ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'} border text-xs`}>{product.stock} uds</Badge>
                        <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => window.location.href = `/productos?id=${product.id}&action=edit`}>Reponer</Button>
                      </div>
                    </div>
                  )
                })}
                {lowStockProducts.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Stock en orden.</p>}
              </CardContent>
            </Card>

            <Card className="border-border/40 bg-white shadow-sm rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-4 pb-2">
                <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-1.5">
                  <Truck className="h-4 w-4 text-sky-500" /> Pedidos pendientes
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => window.location.href = '/pedidos'}>
                  Gestionar <ArrowRight className="h-3 w-3" />
                </Button>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 pt-0 space-y-2">
                {pendingOrders.slice(0, 5).map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-2 p-2 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => window.location.href = '/pedidos'}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{o.clientName || 'Cliente'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{o.items.reduce((a, it) => a + it.quantity, 0)} uds · {o.address || 'Sin dirección'}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${o.status === 'delivery' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {o.status === 'delivery' ? 'En camino' : o.status === 'preparation' ? 'Preparando' : 'Pendiente'}
                    </Badge>
                  </div>
                ))}
                {pendingOrders.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Sin pedidos pendientes.</p>}
              </CardContent>
            </Card>
          </div>

        </div>
      </div>

      {/* Alias Transfer Config Modal */}
      <Dialog open={aliasModalOpen} onOpenChange={setAliasModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-teal-600" /> Datos de Transferencia
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="alias">Alias</Label>
              <Input id="alias" placeholder="ej: distribuidora.patricia.mp" value={aliasConfig.alias} onChange={(e) => setAliasConfig(prev => ({ ...prev, alias: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="titular">Titular</Label>
              <Input id="titular" placeholder="ej: Juan Pérez" value={aliasConfig.titular} onChange={(e) => setAliasConfig(prev => ({ ...prev, titular: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="banco">Banco</Label>
              <Input id="banco" placeholder="ej: Mercado Pago" value={aliasConfig.banco} onChange={(e) => setAliasConfig(prev => ({ ...prev, banco: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAliasModalOpen(false)}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleSaveAlias} disabled={aliasSaving}>
              {aliasSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Guardando...</> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  )
}
