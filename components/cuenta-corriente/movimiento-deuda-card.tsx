'use client'

import { useState, useEffect, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowDownCircle, ArrowUpCircle, ChevronDown, Download, Receipt, Truck,
  AlertTriangle, RotateCcw, Tag, RefreshCw, Loader2,
} from 'lucide-react'
import { formatCurrencyDecimals, formatDate } from '@/lib/utils/format'
import { descargarDocumento } from '@/lib/utils/doc-actions'
import { diaDePagoInfo, type EstadoDiaPago } from '@/lib/utils/deuda'
import { parseDescuentoDescripcion } from '@/lib/utils/ajuste-venta'
import type { Sale, Transaction } from '@/lib/types'
import type { Devolucion } from '@/services/devoluciones-service'
import { supabase } from '@/lib/supabase'

interface MovimientoDeudaCardProps {
  tx: Transaction
  sale?: Sale
  devoluciones?: Devolucion[]
  onRegenerarRemito?: (sale: Sale) => Promise<void>
  onRegenerarRecibo?: (tx: Transaction) => Promise<void>
}

// Columnas compartidas entre el encabezado (en la page) y cada fila
export const MOVIMIENTO_GRID =
  'grid grid-cols-[minmax(8rem,1fr)_4.5rem_2.75rem_7rem_7rem_0.75rem] items-center gap-x-2'

const COLOR_DIA: Record<EstadoDiaPago, string> = {
  falta: 'text-green-600',
  hoy: 'text-foreground',
  atrasado: 'text-yellow-600',
  moroso: 'text-orange-600',
  incobrable: 'text-red-600',
}

function DiasCell({ date }: { date: Date }) {
  const { numero, estado } = diaDePagoInfo(date)
  return <span className={`text-[11px] font-bold tabular-nums ${COLOR_DIA[estado]}`}>{numero}</span>
}

function descargarRemito(sale: Sale) {
  if (sale.remitoPdfBase64) {
    descargarDocumento(sale.remitoPdfBase64, 'remito', sale.remitoNumber, sale.clientName)
    return
  }
  const url = sale.remitoPdfUrl || sale.remitoDriveUrl
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

const MOTIVO_LABELS: Record<string, string> = {
  rotura: 'ROTURA',
  faltante: 'FALTÓ',
  no_quiso: 'NO QUISO',
  devolucion: 'DEVOL.',
}
const MOTIVO_COLORS: Record<string, string> = {
  rotura: 'text-red-600 border-red-300',
  faltante: 'text-amber-600 border-amber-300',
  no_quiso: 'text-orange-600 border-orange-300',
  devolucion: 'text-purple-600 border-purple-300',
}

type TableRow = {
  name: string
  quantity: number
  price: number        // precio base (o precio neto si priceIsNet)
  itemDiscount?: number
  esRegalo?: boolean
  motivo?: string
  destino?: 'stock' | 'perdida'
  priceIsNet?: boolean // precio ya descontado (devoluciones: no mostrar Dto% ni c/Dto)
}

function ItemsTable({ items, showTotal = false }: { items: TableRow[]; showTotal?: boolean }) {
  const grandTotal = items.reduce((acc, it) => {
    const dto = it.itemDiscount ?? 0
    const unit = it.priceIsNet ? it.price : it.price * (1 - dto / 100)
    return acc + (it.esRegalo ? 0 : unit * it.quantity)
  }, 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-right py-0.5 px-1 w-8">Cant.</th>
            <th className="text-left py-0.5 px-1">Descripción</th>
            <th className="text-right py-0.5 px-1 w-16">P. Unit.</th>
            <th className="text-right py-0.5 px-1 w-8">Dto%</th>
            <th className="text-right py-0.5 px-1 w-16">c/Dto</th>
            <th className="text-right py-0.5 pl-1 w-18">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const dto = it.itemDiscount ?? 0
            const unitConDto = it.priceIsNet ? it.price : it.price * (1 - dto / 100)
            const lineTotal = unitConDto * it.quantity
            const color = it.motivo ? (MOTIVO_COLORS[it.motivo] ?? '') : ''
            return (
              <tr key={i} className="border-b border-muted/30 last:border-0">
                <td className="py-0.5 px-1 text-right tabular-nums">{it.quantity}</td>
                <td className="py-0.5 px-1 max-w-0">
                  <div className="flex items-center gap-1 min-w-0 flex-wrap">
                    {it.motivo && (
                      <Badge variant="outline" className={`text-[8px] px-0.5 py-0 h-3 shrink-0 ${color}`}>
                        {MOTIVO_LABELS[it.motivo] ?? it.motivo}
                      </Badge>
                    )}
                    {it.destino && (
                      <Badge variant="outline" className={`text-[8px] px-0.5 py-0 h-3 shrink-0 ${it.destino === 'stock' ? 'text-green-600 border-green-300' : 'text-red-500 border-red-300'}`}>
                        {it.destino === 'stock' ? 'stock' : 'pérdida'}
                      </Badge>
                    )}
                    {it.esRegalo && (
                      <Badge className="text-[8px] px-0.5 py-0 h-3 bg-green-100 text-green-700 border-0 shrink-0">REGALO</Badge>
                    )}
                    <span className="truncate">{it.name}</span>
                  </div>
                </td>
                {/* P. Unit.: siempre muestra el precio base (o neto para devol) */}
                <td className="py-0.5 px-1 text-right tabular-nums">
                  {formatCurrencyDecimals(it.price)}
                </td>
                <td className="py-0.5 px-1 text-right tabular-nums text-muted-foreground">
                  {!it.priceIsNet && dto > 0 ? `${dto}%` : '—'}
                </td>
                <td className="py-0.5 px-1 text-right tabular-nums">
                  {!it.priceIsNet && dto > 0 ? formatCurrencyDecimals(unitConDto) : '—'}
                </td>
                <td className={`py-0.5 pl-1 text-right tabular-nums font-medium ${it.esRegalo ? 'text-green-600' : ''}`}>
                  {it.esRegalo ? 'GRATIS' : formatCurrencyDecimals(lineTotal)}
                </td>
              </tr>
            )
          })}
        </tbody>
        {showTotal && items.length > 0 && (
          <tfoot>
            <tr className="border-t border-muted/60 bg-muted/30">
              <td colSpan={5} className="py-0.5 px-1 text-right text-[10px] font-semibold text-muted-foreground">Total no entregado</td>
              <td className="py-0.5 pl-1 text-right tabular-nums font-bold text-[10px] text-amber-700">
                {formatCurrencyDecimals(grandTotal)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

export function MovimientoDeudaCard({
  tx, sale, devoluciones = [], onRegenerarRemito, onRegenerarRecibo,
}: MovimientoDeudaCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [regenerando, setRegenerando] = useState(false)
  const [regenerandoRecibo, setRegenerandoRecibo] = useState(false)
  const [legacyItems, setLegacyItems] = useState<TableRow[] | null>(null)
  const [linkedRemitos, setLinkedRemitos] = useState<{ id: string; remitoNumber: string; remitoPdfBase64?: string }[] | null>(null)

  // Carga todos los remitos de pedidos vinculados a esta venta (cubre pedidos fusionados)
  useEffect(() => {
    if (!expanded || !sale?.id) return
    if (linkedRemitos !== null) return
    supabase
      .from('pedidos')
      .select('id, remito_number, remito_pdf_base64')
      .eq('sale_id', sale.id)
      .not('remito_number', 'is', null)
      .then(({ data }) => {
        const remitos = (data ?? [])
          .filter(p => p.remito_number)
          .map(p => ({ id: p.id, remitoNumber: p.remito_number, remitoPdfBase64: p.remito_pdf_base64 ?? undefined }))
        setLinkedRemitos(remitos)
      })
  }, [expanded, sale?.id])

  useEffect(() => {
    if (!expanded || !sale?.id) return
    if ((sale.itemsNoEntregados?.length ?? 0) > 0) return
    if (legacyItems !== null) return

    const loadLegacy = async () => {
      const { data: txData } = await supabase
        .from('transacciones')
        .select('description')
        .eq('sale_id', sale.id)
        .or('description.like.[ROTURA]%,description.like.[FALTANTE]%,description.like.[NO_QUIERE]%')

      type Parsed = { name: string; qty: number; motivo: string }
      const parsed: Parsed[] = []

      for (const row of txData ?? []) {
        const desc = row.description || ''
        let motivo: string
        let stripped: string
        if (desc.startsWith('[ROTURA]')) {
          motivo = 'rotura'
          stripped = desc.replace(/^\[ROTURA\]\s*#[\w-]+\s*—\s*/, '').replace(/^\[ROTURA\]\s*/, '')
        } else if (desc.startsWith('[FALTANTE]')) {
          motivo = 'faltante'
          stripped = desc.replace(/^\[FALTANTE\]\s*#[\w-]+\s*—\s*/, '').replace(/^\[FALTANTE\]\s*/, '')
        } else if (desc.startsWith('[NO_QUIERE]')) {
          motivo = 'no_quiso'
          stripped = desc.replace(/^\[NO_QUIERE\]\s*#[\w-]+\s*—\s*/, '').replace(/^\[NO_QUIERE\]\s*/, '')
        } else continue
        for (const part of stripped.split(', ')) {
          const match = part.match(/^(.*)\s+x(\d+)$/)
          if (!match) continue
          parsed.push({ name: match[1].trim(), qty: parseInt(match[2], 10), motivo })
        }
      }

      if (parsed.length === 0) { setLegacyItems([]); return }

      // Lookup de precio: primero sale.items (entregas parciales), luego el pedido original (todo no entregado)
      const priceByName = new Map<string, { price: number; itemDiscount?: number }>()
      for (const item of sale.items ?? []) {
        priceByName.set(item.name, { price: item.price, itemDiscount: item.itemDiscount })
      }

      // 2. Pedidos vinculados a esta venta (sale_id) — cubre pedidos fusionados y el pedido original
      let missingNames = parsed.filter(p => !priceByName.has(p.name)).map(p => p.name)
      if (missingNames.length > 0) {
        const { data: ordersData } = await supabase
          .from('pedidos')
          .select('items')
          .eq('sale_id', sale.id)
        for (const order of ordersData ?? []) {
          for (const item of (order.items as any[] | null) ?? []) {
            const itemName = item.name ?? item.product?.name
            const itemPrice = item.price ?? item.product?.price
            if (itemName && missingNames.includes(itemName)) {
              priceByName.set(itemName, { price: itemPrice, itemDiscount: item.itemDiscount })
            }
          }
        }
        missingNames = parsed.filter(p => !priceByName.has(p.name)).map(p => p.name)
      }

      // 3. Precio actual de productos como último recurso
      if (missingNames.length > 0) {
        const { data: prodData } = await supabase
          .from('productos')
          .select('name, price')
          .in('name', missingNames)
        for (const prod of prodData ?? []) {
          if (!priceByName.has(prod.name)) {
            priceByName.set(prod.name, { price: prod.price, itemDiscount: undefined })
          }
        }
      }

      setLegacyItems(parsed.map(p => {
        const pi = priceByName.get(p.name)
        return { name: p.name, quantity: p.qty, price: pi?.price ?? 0, itemDiscount: pi?.itemDiscount, motivo: p.motivo }
      }))
    }

    loadLegacy()
  }, [expanded, sale?.id])

  const isPayment = tx.type === 'payment'
  const isDescuento = isPayment && (tx.description ?? '').startsWith('[DESCUENTO]')

  // Parseo del detalle de un descuento desde la descripción:
  // "[DESCUENTO] #venta — Nombre -3%, Nombre -4% (motivo)" o "[DESCUENTO] #venta — Final -10% (motivo)"
  const descuento = useMemo(() => {
    if (!isDescuento) return { rows: [] as TableRow[], motivo: undefined as string | undefined, final: undefined as string | undefined }
    const parsed = parseDescuentoDescripcion(tx.description ?? '')
    const priceByName = new Map((sale?.items ?? []).map((it) => [it.name, it]))
    const rows: TableRow[] = parsed.items.map((d) => {
      const it = priceByName.get(d.name)
      return {
        name: d.name,
        quantity: it?.quantity ?? 0,
        price: it?.price ?? 0,
        itemDiscount: d.pct,
      }
    })
    return { rows, motivo: parsed.motivo, final: parsed.final }
  }, [isDescuento, tx.description, sale])

  const descuentoExpandable = isDescuento && !!sale && (descuento.rows.length > 0 || !!descuento.final)
  const expandable = (!isPayment && !!sale) || descuentoExpandable
  const tieneRemito = !!sale?.remitoNumber
  const saldo = !isPayment && tx.saldo != null ? tx.saldo : null
  const pagada = saldo != null && saldo <= 0
  const parcial = saldo != null && saldo > 0 && saldo < tx.amount

  // Construir lista unificada de no entregados
  // 1. items_no_entregados de la venta (path nuevo, precio completo)
  const noEntregadosVenta: TableRow[] = (sale?.itemsNoEntregados ?? []).map((it) => ({
    name: it.name,
    quantity: it.quantity,
    price: it.price,
    itemDiscount: it.itemDiscount,
    motivo: it.motivo,
  }))

  // 2. Devoluciones (items devueltos de esta venta)
  const devolucionRows: TableRow[] = devoluciones.flatMap((dev) =>
    dev.items.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      price: it.price,
      priceIsNet: true,
      motivo: 'devolucion' as const,
      destino: it.destino,
    }))
  )

  // Fallback para ventas históricas: usa datos de transacciones si itemsNoEntregados está vacío
  const noEntregadosSource = noEntregadosVenta.length > 0 ? noEntregadosVenta : (legacyItems ?? [])
  const noEntregadosUnified: TableRow[] = [...noEntregadosSource, ...devolucionRows]
  const tieneNoEntregados = noEntregadosUnified.length > 0

  // Cálculos de totales
  const entregados: TableRow[] = (sale?.items ?? []).map((it) => ({
    name: it.name,
    quantity: it.quantity,
    price: it.price,
    itemDiscount: it.itemDiscount,
    esRegalo: it.esRegalo,
  }))

  const totalDescuento = entregados.reduce((acc, it) => {
    const dto = it.itemDiscount ?? 0
    return acc + it.price * (dto / 100) * it.quantity
  }, 0)
  const totalEntregadoConDto = entregados.reduce((acc, it) => {
    const dto = it.itemDiscount ?? 0
    return acc + it.price * (1 - dto / 100) * it.quantity
  }, 0)
  const totalNoEntregado = noEntregadosUnified
    .filter((it) => it.motivo !== 'devolucion')
    .reduce((acc, it) => {
      const dto = it.itemDiscount ?? 0
      return acc + it.price * (1 - dto / 100) * it.quantity
    }, 0)

  const handleRegenerar = async () => {
    if (!sale || !onRegenerarRemito) return
    setRegenerando(true)
    try {
      await onRegenerarRemito(sale)
    } finally {
      setRegenerando(false)
    }
  }

  const handleRegenerarRecibo = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onRegenerarRecibo) return
    setRegenerandoRecibo(true)
    try {
      await onRegenerarRecibo(tx)
    } finally {
      setRegenerandoRecibo(false)
    }
  }

  return (
    <div>
      {/* Fila principal (tabla) */}
      <div
        className={`${MOVIMIENTO_GRID} px-3 py-1.5 ${expandable ? 'cursor-pointer hover:bg-muted/30' : ''}`}
        onClick={expandable ? () => setExpanded((v) => !v) : undefined}
      >
        {/* Concepto */}
        <div className="flex items-center gap-1.5 min-w-0">
          {isPayment
            ? <ArrowDownCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
            : <ArrowUpCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
          }
          <span className="text-xs font-medium truncate">
            {isDescuento
              ? `Descuento${sale?.saleNumber ? ` · Venta ${sale.saleNumber}` : ''}${descuento.motivo ? ` · ${descuento.motivo}` : ''}`
              : tx.description}
          </span>
          {tieneRemito && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-blue-600 shrink-0">
              <Truck className="h-3 w-3" />{sale!.remitoNumber}
            </span>
          )}
          {isPayment && (
            tx.reciboPdfBase64 ? (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 text-[11px] text-teal-600 hover:underline shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    descargarDocumento(tx.reciboPdfBase64!, 'recibo', tx.reciboNumero)
                  }}
                  title="Descargar recibo"
                >
                  <Receipt className="h-3 w-3" />{tx.reciboNumero || 'Recibo'}
                </button>
                {onRegenerarRecibo && (
                  <button
                    type="button"
                    className="inline-flex items-center text-[11px] text-muted-foreground hover:text-teal-600 shrink-0 disabled:opacity-50"
                    onClick={handleRegenerarRecibo}
                    disabled={regenerandoRecibo}
                    title="Generar de nuevo el recibo"
                  >
                    {regenerandoRecibo ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  </button>
                )}
              </>
            ) : onRegenerarRecibo ? (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[11px] text-teal-600 hover:underline shrink-0 disabled:opacity-50"
                onClick={handleRegenerarRecibo}
                disabled={regenerandoRecibo}
                title="Generar y descargar el recibo de este pago"
              >
                {regenerandoRecibo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Receipt className="h-3 w-3" />}
                Generar recibo
              </button>
            ) : tx.reciboNumero ? (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-teal-600 shrink-0">
                <Receipt className="h-3 w-3" />{tx.reciboNumero}
              </span>
            ) : null
          )}
          {tieneNoEntregados && !expanded && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300 shrink-0">
              {noEntregadosUnified.length} no entregado{noEntregadosUnified.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        {/* Fecha */}
        <span className="text-[11px] text-muted-foreground text-right tabular-nums">{formatDate(tx.date)}</span>
        {/* Días en cuenta corriente (solo deudas pendientes) */}
        <div className="text-center">
          {!isPayment && !pagada ? <DiasCell date={tx.date} /> : null}
        </div>
        {/* Monto */}
        <span className={`text-xs font-bold tabular-nums text-right ${isPayment ? 'text-green-600' : 'text-red-600'}`}>
          {isPayment ? '-' : '+'}{formatCurrencyDecimals(tx.amount)}
        </span>
        {/* Saldo */}
        <span className={`text-[11px] font-medium tabular-nums text-right ${saldo == null ? 'text-muted-foreground' : pagada ? 'text-green-600' : parcial ? 'text-amber-600' : 'text-red-500'}`}>
          {saldo == null ? '—' : pagada ? '✓' : formatCurrencyDecimals(saldo)}
        </span>
        {/* Expandir */}
        <div className="flex justify-center">
          {expandable && (
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
          )}
        </div>
      </div>

      {/* Panel expandido — descuento */}
      {descuentoExpandable && expanded && sale && (
        <div className="border-t bg-muted/20 px-3 pb-3 pt-2 space-y-2">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 mb-1">
            <Tag className="h-3 w-3" />
            Productos con descuento
          </div>
          {descuento.rows.length > 0 ? (
            <ItemsTable items={descuento.rows} />
          ) : (
            <p className="text-[11px] text-muted-foreground">Descuento final sobre el total de la venta.</p>
          )}
          {descuento.motivo && (
            <p className="text-[11px] text-muted-foreground">Motivo: {descuento.motivo}</p>
          )}
          <div className="border-t pt-1 flex justify-between text-[11px] font-semibold">
            <span>Descuento total</span>
            <span className="tabular-nums text-emerald-600">-{formatCurrencyDecimals(tx.amount)}</span>
          </div>
        </div>
      )}

      {/* Panel expandido */}
      {expandable && expanded && sale && !isDescuento && (
        <div className="border-t bg-muted/20 px-3 pb-3 pt-2 space-y-3">

          {/* Tabla de productos entregados */}
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground mb-1">Productos entregados</div>
            <ItemsTable items={entregados} />
          </div>

          {/* Tabla unificada: no entregados + devoluciones */}
          {tieneNoEntregados && (
            <div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 mb-1">
                <AlertTriangle className="h-3 w-3" />
                No entregados / Devueltos
              </div>
              <ItemsTable items={noEntregadosUnified} showTotal />
            </div>
          )}

          {/* Totales */}
          <div className="border-t pt-2 space-y-0.5 text-[11px]">
            {totalDescuento > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span className="flex items-center gap-1"><Tag className="h-3 w-3" />Descuento ítem</span>
                <span className="tabular-nums text-amber-600">-{formatCurrencyDecimals(totalDescuento)}</span>
              </div>
            )}
            {sale.discount && sale.discount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span className="flex items-center gap-1"><Tag className="h-3 w-3" />
                  Dto. general {sale.discountType === 'percent' ? `(${sale.discount}%)` : ''}
                </span>
                <span className="tabular-nums text-amber-600">
                  -{formatCurrencyDecimals(
                    sale.discountType === 'percent'
                      ? totalEntregadoConDto * sale.discount / 100
                      : sale.discount
                  )}
                </span>
              </div>
            )}
            {totalNoEntregado > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>No entregado (sin cobrar)</span>
                <span className="tabular-nums text-amber-600">{formatCurrencyDecimals(totalNoEntregado)}</span>
              </div>
            )}
            {devoluciones.length > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span className="flex items-center gap-1"><RotateCcw className="h-3 w-3" />
                  Devoluciones ({devoluciones.map((d) => d.reciboNumero).join(', ')})
                </span>
                <span className="tabular-nums text-purple-600">
                  -{formatCurrencyDecimals(devoluciones.reduce((a, d) => a + d.total, 0))}
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t pt-1 mt-1">
              <span>TOTAL</span>
              <span className="tabular-nums">{formatCurrencyDecimals(sale.total)}</span>
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            {tieneRemito && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 text-xs h-7"
                onClick={() => descargarRemito(sale)}
              >
                <Download className="h-3 w-3" />
                Remito {sale.remitoNumber}
              </Button>
            )}
            {onRegenerarRemito && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-7 text-blue-600 border-blue-300 hover:bg-blue-50"
                onClick={handleRegenerar}
                disabled={regenerando}
                title="Regenera el PDF del remito con los ítems y total actuales (sin modificar stock)"
              >
                {regenerando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Regenerar remito
              </Button>
            )}
          </div>
          {!tieneRemito && (
            <p className="text-[11px] text-muted-foreground text-center">Sin remito</p>
          )}

          {/* Remitos de pedidos fusionados */}
          {linkedRemitos && linkedRemitos.length > 1 && (
            <div className="border-t pt-2">
              <p className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1">
                <Truck className="h-3 w-3" />
                Remitos de pedidos fusionados
              </p>
              <div className="flex flex-wrap gap-1.5">
                {linkedRemitos.map(r => (
                  <Button
                    key={r.id}
                    variant="outline"
                    size="sm"
                    className="gap-1 text-xs h-7"
                    onClick={() => {
                      if (r.remitoPdfBase64) {
                        descargarDocumento(r.remitoPdfBase64, 'remito', r.remitoNumber, sale?.clientName)
                      }
                    }}
                    disabled={!r.remitoPdfBase64}
                    title={r.remitoPdfBase64 ? 'Descargar remito' : 'PDF no disponible'}
                  >
                    <Download className="h-3 w-3" />
                    {r.remitoNumber}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
