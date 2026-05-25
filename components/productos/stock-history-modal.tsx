'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Filter,
  Package,
  User,
  Store,
  Archive,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatCurrency,
  formatDateTime,
  formatDateShort,
} from '@/lib/utils/format'

type TipoFilter = 'all' | 'venta' | 'apertura_bulto' | 'ajuste' | 'rotura'

interface Movimiento {
  id: string
  tipo: 'venta' | 'apertura_bulto' | 'ajuste' | 'rotura'
  cantidad: number
  stockAnterior: number
  stockPosterior: number
  motivo: string | null
  fecha: string
  saleNumber: string | null
  sellerName: string | null
  clientName: string | null
  ventaTotal: number | null
}

interface HistorialResponse {
  data: Movimiento[]
  total: number
  page: number
  totalPages: number
  stats: {
    unitsSold: number
    totalRevenue: number
    adjustments: number
    currentStock: number | null
    stockHistorico: number
    stockEnPedidos: number
  }
}

export interface StockHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: { id: string; name: string; price: number; stock: number } | null
  /** @deprecated — ya no se usa, el modal carga desde la API */
  history?: unknown[]
}

const PAGE_SIZE = 20

const TIPO_CONFIG: Record<string, { label: string; className: string }> = {
  venta:          { label: 'Venta',    className: 'bg-blue-100 text-blue-700 border-blue-200' },
  apertura_bulto: { label: 'Ingreso',  className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  ajuste:         { label: 'Ajuste',   className: 'bg-amber-100 text-amber-700 border-amber-200' },
  rotura:         { label: 'Rotura',   className: 'bg-rose-100 text-rose-700 border-rose-200' },
}

const FILTER_OPTIONS: { id: TipoFilter; label: string }[] = [
  { id: 'all',           label: 'Todos' },
  { id: 'venta',         label: 'Ventas' },
  { id: 'apertura_bulto',label: 'Ingresos' },
  { id: 'ajuste',        label: 'Ajustes' },
  { id: 'rotura',        label: 'Roturas' },
]

export function StockHistoryModal({
  open,
  onOpenChange,
  product,
}: StockHistoryModalProps) {
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('all')
  const [page, setPage] = useState(1)
  const [response, setResponse] = useState<HistorialResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(
    async (productId: string, tipo: TipoFilter, pageNum: number) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_SIZE) })
        if (tipo !== 'all') params.set('tipo', tipo)
        const res = await fetch(`/api/productos/${productId}/stock-history?${params}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? 'Error al cargar el historial')
        }
        setResponse(await res.json())
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // Cargar cuando el modal se abre o cambian los filtros
  useEffect(() => {
    if (open && product?.id) {
      fetchHistory(product.id, tipoFilter, page)
    }
  }, [open, product?.id, tipoFilter, page, fetchHistory])

  // Reset al cambiar de producto
  useEffect(() => {
    if (open) {
      setPage(1)
      setTipoFilter('all')
      setResponse(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id])

  const handleFilterChange = (f: TipoFilter) => {
    setTipoFilter(f)
    setPage(1)
  }

  const stats = response?.stats
  const movimientos = response?.data ?? []
  const totalMovs = response?.total ?? 0
  const totalPages = response?.totalPages ?? 1

  const from = totalMovs === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, totalMovs)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] sm:max-w-4xl max-h-[95vh] p-0 gap-0 flex flex-col overflow-hidden">

        {/* Header */}
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Archive className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm sm:text-base truncate">
                Historial de Movimientos
              </p>
              <p className="text-xs text-muted-foreground truncate">{product?.name}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-3 sm:p-4 bg-muted/30 border-b shrink-0">
          <StatCard
            value={stats?.unitsSold}
            label="Unid. Vendidas"
            colorClass="bg-blue-50 text-blue-600"
          />
          <StatCard
            value={stats != null ? formatCurrency(stats.totalRevenue) : undefined}
            label="Ingresos"
            colorClass="bg-emerald-50 text-emerald-600"
            small
          />
          <StatCard
            value={stats?.adjustments}
            label="Ajustes/Roturas"
            colorClass="bg-amber-50 text-amber-600"
          />
          <StatCard
            value={product?.stock}
            label="Stock Actual"
            colorClass="bg-purple-50 text-purple-600"
          />
          <StatCard
            value={stats?.stockEnPedidos}
            label="En Pedidos"
            colorClass="bg-orange-50 text-orange-500"
          />
          <StatCard
            value={stats?.stockHistorico}
            label="Stock Histórico"
            colorClass="bg-gray-50 text-gray-600"
            span
          />
        </div>

        {/* Filtros */}
        <div className="flex gap-1.5 p-3 border-b overflow-x-auto shrink-0">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.id}
              variant={tipoFilter === opt.id ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7 px-2.5 whitespace-nowrap"
              onClick={() => handleFilterChange(opt.id)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-14">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="text-sm">{error}</p>
            </div>
          ) : movimientos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
              <Package className="h-10 w-10 opacity-40" />
              <p className="text-sm">Sin movimientos registrados</p>
              <p className="text-xs">Los movimientos aparecen cuando se registran ventas, ingresos o ajustes de stock.</p>
            </div>
          ) : (
            <>
              {/* Vista tabla — desktop */}
              <div className="hidden sm:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-2 py-2.5 font-semibold text-muted-foreground text-xs">Fecha</th>
                      <th className="text-left px-2 py-2.5 font-semibold text-muted-foreground text-xs">Tipo</th>
                      <th className="text-left px-2 py-2.5 font-semibold text-muted-foreground text-xs">Venta</th>
                      <th className="text-right px-2 py-2.5 font-semibold text-muted-foreground text-xs">Cant.</th>
                      <th className="text-left px-2 py-2.5 font-semibold text-muted-foreground text-xs">Cliente</th>
                      <th className="text-right px-2 py-2.5 font-semibold text-muted-foreground text-xs">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {movimientos.map((m) => (
                      <MovimientoRow key={m.id} m={m} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Vista compacta — mobile */}
              <div className="sm:hidden divide-y">
                {movimientos.map((m) => (
                  <MovimientoCard key={m.id} m={m} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Paginación */}
        {totalMovs > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t shrink-0 bg-background">
            <span className="text-xs text-muted-foreground">
              {from}–{to} de {totalMovs}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium min-w-[3rem] text-center tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatCard({
  value,
  label,
  colorClass,
  small,
  span,
}: {
  value: number | string | undefined | null
  label: string
  colorClass: string
  small?: boolean
  span?: boolean
}) {
  return (
    <div className={cn('text-center p-2 rounded-lg', colorClass.split(' ')[0], span && 'col-span-3 sm:col-span-1')}>
      <p className={cn('font-bold truncate', colorClass.split(' ')[1], small ? 'text-sm sm:text-base' : 'text-lg sm:text-xl')}>
        {value ?? '—'}
      </p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
    </div>
  )
}

function TipoBadge({ tipo }: { tipo: string }) {
  const cfg = TIPO_CONFIG[tipo] ?? { label: tipo, className: 'bg-gray-100 text-gray-700 border-gray-200' }
  return (
    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 whitespace-nowrap', cfg.className)}>
      {cfg.label}
    </Badge>
  )
}

function CantidadBadge({ cantidad }: { cantidad: number }) {
  return (
    <span className={cn('font-semibold tabular-nums', cantidad > 0 ? 'text-emerald-600' : 'text-rose-600')}>
      {cantidad > 0 ? '+' : ''}{cantidad}
    </span>
  )
}

function MovimientoRow({ m }: { m: Movimiento }) {
  const d = new Date(m.fecha)
  const fecha = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-2 py-2 text-xs text-muted-foreground">
        <div className="leading-tight">{fecha}</div>
        <div className="leading-tight text-[10px]">{hora}</div>
      </td>
      <td className="px-2 py-2">
        <TipoBadge tipo={m.tipo} />
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground">
        {m.tipo === 'venta' ? (
          <div>
            <div className="truncate max-w-[140px]">{m.sellerName ?? '—'}</div>
            {m.saleNumber && <div className="text-[10px] text-muted-foreground/70">#{m.saleNumber}</div>}
          </div>
        ) : m.motivo ? (
          <span className="text-[10px] italic truncate max-w-[140px] block">{m.motivo}</span>
        ) : ''}
      </td>
      <td className="px-2 py-2 text-right">
        <CantidadBadge cantidad={m.cantidad} />
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground max-w-[130px] truncate">
        {m.clientName ?? (m.tipo === 'venta' ? '—' : '')}
      </td>
      <td className="px-2 py-2 text-right text-xs font-medium text-foreground whitespace-nowrap">
        {m.ventaTotal != null ? formatCurrency(m.ventaTotal) : (m.tipo === 'venta' ? '—' : '')}
      </td>
    </tr>
  )
}

function MovimientoCard({ m }: { m: Movimiento }) {
  return (
    <div className="px-3 py-2.5 space-y-1">
      {/* Fila 1: tipo + fecha + cantidad */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TipoBadge tipo={m.tipo} />
          <span className="text-[10px] text-muted-foreground">
            {formatDateShort(new Date(m.fecha))}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CantidadBadge cantidad={m.cantidad} />
          {m.ventaTotal != null && (
            <span className="text-xs font-semibold text-foreground">
              {formatCurrency(m.ventaTotal)}
            </span>
          )}
        </div>
      </div>

      {/* Fila 2: info de venta */}
      {(m.saleNumber || m.sellerName || m.clientName) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {m.sellerName && (
            <span className="flex items-center gap-0.5">
              <User className="h-2.5 w-2.5" />
              {m.sellerName}
            </span>
          )}
          {m.clientName && (
            <span className="flex items-center gap-0.5">
              <Store className="h-2.5 w-2.5" />
              {m.clientName}
            </span>
          )}
          {m.saleNumber && <span className="text-muted-foreground/70">#{m.saleNumber}</span>}
        </div>
      )}

      {/* Motivo libre (ajustes/roturas/ingresos) */}
      {!m.sellerName && !m.clientName && m.motivo && m.tipo !== 'venta' && (
        <p className="text-[10px] text-muted-foreground italic">{m.motivo}</p>
      )}
    </div>
  )
}
