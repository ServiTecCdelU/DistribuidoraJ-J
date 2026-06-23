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
import { badgeDeMovimiento } from '@/lib/utils/stock-movimiento-label'

type TipoFilter = 'all' | 'venta' | 'regalo' | 'apertura_bulto' | 'ajuste' | 'rotura'

interface Movimiento {
  id: string
  tipo: 'venta' | 'regalo' | 'apertura_bulto' | 'ajuste' | 'rotura'
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
    unitsGifted: number
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
  regalo:         { label: 'Regalo',   className: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' },
  apertura_bulto: { label: 'Ingreso',  className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  ajuste:         { label: 'Ajuste',   className: 'bg-amber-100 text-amber-700 border-amber-200' },
  rotura:         { label: 'Rotura',   className: 'bg-rose-100 text-rose-700 border-rose-200' },
}

const FILTER_OPTIONS: { id: TipoFilter; label: string }[] = [
  { id: 'all',           label: 'Todos' },
  { id: 'venta',         label: 'Ventas' },
  { id: 'regalo',        label: 'Regalos' },
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
      <DialogContent className="w-[98vw] max-w-[98vw] sm:max-w-4xl max-h-[90vh] sm:max-h-[95vh] p-0 gap-0 flex flex-col overflow-hidden rounded-xl sm:rounded-2xl">

        {/* Header */}
        <DialogHeader className="px-3 sm:px-6 pt-3 sm:pt-4 pb-2 sm:pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Archive className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">
                Historial de Movimientos
              </p>
              <p className="text-[11px] text-muted-foreground truncate">{product?.name}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-1.5 p-2.5 sm:p-4 bg-muted/30 border-b shrink-0">
          <StatCard
            value={stats?.unitsSold}
            label="Unid. Vendidas"
            colorClass="bg-blue-50 text-blue-600"
          />
          <StatCard
            value={stats?.unitsGifted}
            label="Regaladas"
            colorClass="bg-fuchsia-50 text-fuchsia-600"
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
          />
        </div>

        {/* Filtros */}
        <div className="flex gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 border-b overflow-x-auto shrink-0">
          <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0 mt-0.5" />
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.id}
              variant={tipoFilter === opt.id ? 'default' : 'outline'}
              size="sm"
              className="text-[10px] sm:text-xs h-6 sm:h-7 px-2 sm:px-2.5 whitespace-nowrap"
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
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className="bg-muted/60 sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-xs border-b">Fecha</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-xs border-b">Tipo</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground text-xs border-b">Detalle</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground text-xs border-b w-20">Cant.</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground text-xs border-b w-28">Stock</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground text-xs border-b w-28">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
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
          <div className="flex items-center justify-between px-2.5 sm:px-4 py-2 sm:py-3 border-t shrink-0 bg-background">
            <span className="text-[10px] sm:text-xs text-muted-foreground">
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
    <div className={cn('text-center p-1.5 sm:p-2 rounded-lg', colorClass.split(' ')[0], span && 'col-span-3 sm:col-span-1')}>
      <p className={cn('font-bold truncate', colorClass.split(' ')[1], small ? 'text-xs sm:text-base' : 'text-sm sm:text-xl')}>
        {value ?? '—'}
      </p>
      <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">{label}</p>
    </div>
  )
}

function TipoBadge({ tipo, motivo }: { tipo: string; motivo?: string | null }) {
  const cfg = badgeDeMovimiento(tipo, motivo ?? null)
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
    <tr className="hover:bg-muted/20 transition-colors align-middle">
      <td className="px-3 py-2.5 text-xs text-muted-foreground border-b whitespace-nowrap">
        <div className="leading-tight font-medium text-foreground/80">{fecha}</div>
        <div className="leading-tight text-[10px]">{hora}</div>
      </td>
      <td className="px-3 py-2.5 border-b">
        <TipoBadge tipo={m.tipo} motivo={m.motivo} />
      </td>
      <td className="px-3 py-2.5 text-xs border-b">
        {m.tipo === 'venta' || m.tipo === 'regalo' ? (
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {m.sellerName && (
                <span className="inline-flex items-center gap-1 text-foreground/80">
                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate max-w-[140px]">{m.sellerName}</span>
                </span>
              )}
              {m.clientName && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Store className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[140px]">{m.clientName}</span>
                </span>
              )}
              {!m.sellerName && !m.clientName && (
                <span className="text-[11px] italic text-muted-foreground line-clamp-2">{m.motivo || "—"}</span>
              )}
            </div>
            {m.saleNumber && <div className="text-[10px] text-muted-foreground/70 mt-0.5">Venta #{m.saleNumber}</div>}
          </div>
        ) : m.motivo ? (
          <span className="text-[11px] italic text-muted-foreground line-clamp-2">{m.motivo}</span>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-2.5 text-center border-b">
        <CantidadBadge cantidad={m.cantidad} />
      </td>
      <td className="px-3 py-2.5 text-center border-b">
        <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
          <span>{m.stockAnterior}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
          <span className="font-semibold text-foreground">{m.stockPosterior}</span>
        </span>
      </td>
      <td className="px-3 py-2.5 text-right text-xs font-semibold text-foreground whitespace-nowrap border-b">
        {m.ventaTotal != null ? formatCurrency(m.ventaTotal) : <span className="text-muted-foreground font-normal">—</span>}
      </td>
    </tr>
  )
}

function MovimientoCard({ m }: { m: Movimiento }) {
  const d = new Date(m.fecha)
  const fecha = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="px-3 py-2.5 space-y-1.5">
      {/* Fila 1: badge + fecha/hora | cant + monto */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <TipoBadge tipo={m.tipo} motivo={m.motivo} />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{fecha} · {hora}</span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <CantidadBadge cantidad={m.cantidad} />
          {m.ventaTotal != null && (
            <span className="text-xs font-semibold text-foreground tabular-nums">
              {formatCurrency(m.ventaTotal)}
            </span>
          )}
        </div>
      </div>

      {/* Fila 2: vendedor · cliente · #venta */}
      {(m.sellerName || m.clientName || m.saleNumber) && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-0.5">
          {m.sellerName && (
            <span className="flex items-center gap-0.5 shrink-0">
              <User className="h-3 w-3 shrink-0" />
              <span className="max-w-[90px] truncate">{m.sellerName}</span>
            </span>
          )}
          {m.sellerName && m.clientName && <span className="text-muted-foreground/40">·</span>}
          {m.clientName && (
            <span className="flex items-center gap-0.5 min-w-0">
              <Store className="h-3 w-3 shrink-0" />
              <span className="truncate">{m.clientName}</span>
            </span>
          )}
          {m.saleNumber && (
            <span className="text-muted-foreground/60 shrink-0 ml-auto">#{m.saleNumber}</span>
          )}
        </div>
      )}

      {/* Motivo libre (ajustes/roturas/ingresos, o ventas/regalos sin datos de venta) */}
      {!m.sellerName && !m.clientName && m.motivo && (
        <p className="text-[11px] text-muted-foreground italic pl-0.5">{m.motivo}</p>
      )}

      {/* Fila 3: stock anterior → posterior */}
      <div className="flex items-center gap-1.5 pl-0.5">
        <span className="text-[10px] text-muted-foreground/70">Stock:</span>
        <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
          <span>{m.stockAnterior}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
          <span className="font-semibold text-foreground">{m.stockPosterior}</span>
        </span>
      </div>
    </div>
  )
}
