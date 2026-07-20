'use client'

import { useState, useEffect, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowDownCircle, ArrowUpCircle, ChevronDown, Download, Receipt, Truck,
  AlertTriangle, RotateCcw, Tag, RefreshCw, Loader2, Ban, CheckCircle2,
  Image as ImageIcon,
} from 'lucide-react'
import { formatCurrencyDecimals, formatDate } from '@/lib/utils/format'
import { descargarDocumento } from '@/lib/utils/doc-actions'
import { diaDePagoInfo, type EstadoDiaPago } from '@/lib/utils/deuda'
import { parseDescuentoDescripcion } from '@/lib/utils/ajuste-venta'
import type { ComprobantePago, Sale, Transaction } from '@/lib/types'
import type { Devolucion } from '@/services/devoluciones-service'
import { supabase } from '@/lib/supabase'

interface MovimientoDeudaCardProps {
  tx: Transaction
  sale?: Sale
  devoluciones?: Devolucion[]
  saldoAcumulado?: number
  onRegenerarRemito?: (sale: Sale) => Promise<void>
  onRegenerarRecibo?: (tx: Transaction) => Promise<void>
  onAnularPago?: (tx: Transaction) => void
  /** Comprobante vinculado a este movimiento (cobrador o vendedor aprobado), si corresponde */
  comprobante?: ComprobantePago
  onVerComprobante?: (fileUrl: string) => void
}

// Columnas compartidas entre el encabezado (en la page) y cada fila:
// Fecha · Concepto · Descripción (con flecha de detalle) · Incidencias · Cobrador · Estado · Debe · Haber · Saldo
export const MOVIMIENTO_GRID =
  'grid grid-cols-[5rem_5.5rem_minmax(10rem,1fr)_5.5rem_6.5rem_5.5rem_6.5rem_6.5rem_6.5rem] items-center gap-x-3'

const COLOR_DIA: Record<EstadoDiaPago, string> = {
  falta: 'text-green-600',
  hoy: 'text-foreground',
  atrasado: 'text-yellow-600',
  moroso: 'text-orange-600',
  incobrable: 'text-red-600',
}

function DiasCell({ date }: { date: Date }) {
  const { numero, estado } = diaDePagoInfo(date)
  return <span className={`text-xs font-bold tabular-nums ${COLOR_DIA[estado]}`}>{numero}</span>
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
  tx, sale, devoluciones = [], saldoAcumulado, onRegenerarRemito, onRegenerarRecibo, onAnularPago, comprobante, onVerComprobante,
}: MovimientoDeudaCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [regenerando, setRegenerando] = useState(false)
  const [regenerandoRecibo, setRegenerandoRecibo] = useState(false)
  const [descargandoDevol, setDescargandoDevol] = useState(false)
  const [descargandoRechazo, setDescargandoRechazo] = useState(false)
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
  const isDevolucion = isPayment && (tx.description ?? '').startsWith('[DEVOLUCION]')
  const isRechazo = isPayment && (tx.description ?? '').startsWith('[RECHAZO]')
  // Devolución vinculada a este movimiento (match por monto dentro de la venta)
  const devMatch = isDevolucion
    ? (devoluciones.find((d) => Math.abs(d.total - tx.amount) < 0.01) ?? devoluciones[0])
    : undefined

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
  const devolucionExpandable = isDevolucion && !!devMatch && devMatch.items.length > 0
  // Los pagos también son expandibles: ahí viven el recibo, el comprobante y anular.
  const expandable = isPayment || (!!sale) || descuentoExpandable
  const tieneRemito = !!sale?.remitoNumber
  const saldo = !isPayment && tx.saldo != null ? tx.saldo : null
  const pagada = saldo != null && saldo <= 0

  // Nombre de quien cobró, parseado de la descripción del pago (" — Cobrado por X" o "(Cobrado por X...)").
  // Sin match = lo cobró un admin desde el sistema → "Patricia".
  const cobradorNombre = (() => {
    if (!isPayment) return ''
    const m = (tx.description ?? '').match(/Cobrado por\s+([^()—]+)/i)
    if (m) return m[1].replace(/\bDESHABILITADO\b/i, '').trim()
    return comprobante?.sellerName || 'Patricia'
  })()

  // Concepto y Descripción separados (igual que el PDF)
  const concepto = isRechazo ? 'Rechazo' : isDevolucion ? 'Devolución' : isPayment ? 'Pago' : 'Venta'
  const rechazoRecibo = isRechazo ? ((tx.description ?? '').match(/\[RECHAZO\]\s*(\S+)/)?.[1] ?? '') : ''
  // Pago "simple" (efectivo/transferencia/otro registrado a mano) — a diferencia de
  // descuento/devolución/rechazo que tienen su propio formato de descripción.
  const isPagoSimple = isPayment && !isDescuento && !isDevolucion && !isRechazo

  // Método y nota se parsean para separarlos: el método va en el desplegable,
  // la nota (texto libre cargado al registrar el pago) también, nunca en la columna Descripción.
  const { metodoPago, notaPago } = useMemo(() => {
    if (!isPagoSimple) return { metodoPago: '', notaPago: '' }
    let d = tx.description || ''
    d = d.replace(/\(Cobrado por[^)]*\)/gi, '').replace(/—\s*Cobrado por.*$/i, '')
    d = d.replace(/\([^)]*\)/g, '') // referencias entre paréntesis (remito imputado, etc.)
    const segmentos = d.split('—').map((s) => s.trim()).filter(Boolean)
    const primero = segmentos[0] || ''
    const metodo = /transfer/i.test(primero) ? 'Transferencia' : /efectivo/i.test(primero) ? 'Efectivo' : (primero.replace(/^Pago\s+(en\s+|por\s+|con\s+)?/i, '').trim() || 'Pago')
    const nota = segmentos.slice(1).join(' — ').trim()
    return { metodoPago: metodo, notaPago: nota }
  }, [isPagoSimple, tx.description])

  const descripcionMov = (() => {
    if (isRechazo) return `Rechazo de productos${rechazoRecibo ? ` · ${rechazoRecibo}` : ''}`
    if (isDevolucion) return devMatch?.reciboNumero || sale?.remitoNumber || ''
    if (isDescuento) return `Descuento${sale?.saleNumber ? ` · Venta ${sale.saleNumber}` : ''}${descuento.motivo ? ` · ${descuento.motivo}` : ''}`
    if (isPagoSimple) return tx.reciboNumero || metodoPago
    return sale?.remitoNumber ? sale.remitoNumber : (tx.description || 'Venta')
  })()

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

  // Ítems rechazados en el reparto ("no quiso"): permiten emitir un RECIBO DE DEVOLUCIÓN
  // (mismo documento que la devolución del admin), sin tocar saldo ni comisión.
  const rechazoItems = noEntregadosSource.filter((it) => it.motivo === 'no_quiso')
  const tieneRechazo = rechazoItems.length > 0

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

  // Descarga el recibo de DEVOLUCIÓN (el mismo que se emite en Ventas), regenerado al vuelo.
  const handleDescargarReciboDevol = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!devMatch) return
    setDescargandoDevol(true)
    try {
      const { generarReciboDevolucion } = await import('@/hooks/useGenerarPdf')
      const base64 = await generarReciboDevolucion({
        reciboNumero: devMatch.reciboNumero,
        fecha: devMatch.createdAt,
        clientName: devMatch.clientName ?? sale?.clientName,
        saleNumber: devMatch.saleNumber ?? sale?.saleNumber,
        items: devMatch.items.map((it) => ({
          name: it.name, quantity: it.quantity, price: it.price, destino: it.destino,
        })),
        total: devMatch.total,
      })
      const link = document.createElement('a')
      link.href = `data:application/pdf;base64,${base64}`
      link.download = `recibo-devolucion-${devMatch.reciboNumero}.pdf`
      link.click()
    } finally {
      setDescargandoDevol(false)
    }
  }

  // Emite el RECIBO DE DEVOLUCIÓN para los ítems rechazados en el reparto ("no quiso").
  // Solo genera el documento (mismo formato que la devolución del admin); no altera saldo ni comisión.
  const handleDescargarReciboRechazo = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!sale || !tieneRechazo) return
    setDescargandoRechazo(true)
    try {
      const items = rechazoItems.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        price: it.price * (1 - (it.itemDiscount ?? 0) / 100),
        destino: 'stock' as const,
      }))
      const total = items.reduce((acc, it) => acc + it.price * it.quantity, 0)
      const reciboNumero = `DEV-${sale.remitoNumber || sale.saleNumber || sale.id}`
      const { generarReciboDevolucion } = await import('@/hooks/useGenerarPdf')
      const base64 = await generarReciboDevolucion({
        reciboNumero,
        fecha: tx.date,
        clientName: sale.clientName,
        saleNumber: sale.saleNumber,
        items,
        total,
      })
      const link = document.createElement('a')
      link.href = `data:application/pdf;base64,${base64}`
      link.download = `recibo-devolucion-${reciboNumero}.pdf`
      link.click()
    } finally {
      setDescargandoRechazo(false)
    }
  }

  // Fila anulada: se muestra como una línea de guiones (no cuenta en los totales).
  const anuladoRow = !!tx.anulado

  return (
    <div>
      {/* Fila principal (tabla) */}
      <div
        className={`${MOVIMIENTO_GRID} px-3 py-2 ${expandable ? 'cursor-pointer hover:bg-muted/30' : ''} ${anuladoRow ? 'opacity-60' : ''}`}
        onClick={expandable ? () => setExpanded((v) => !v) : undefined}
      >
        {anuladoRow ? (
          <span className="col-span-9 text-xs text-muted-foreground text-center tracking-widest select-none" title={`ANULADO${tx.anuladoMotivo ? ` — Motivo: ${tx.anuladoMotivo}` : ''}${tx.anuladoBy ? ` · Por: ${tx.anuladoBy}` : ''}`}>
            {'— '.repeat(14)}ANULADO{' —'.repeat(14)}
          </span>
        ) : (
          <>
            {/* Fecha */}
            <span className="text-xs text-muted-foreground tabular-nums">{formatDate(tx.date)}</span>

            {/* Concepto */}
            <span className="flex items-center gap-1 text-sm font-medium">
              {isPayment
                ? <ArrowDownCircle className="h-4 w-4 text-green-600 shrink-0" />
                : <ArrowUpCircle className="h-4 w-4 text-red-600 shrink-0" />
              }
              {concepto}
            </span>

            {/* Descripción */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm truncate">{descripcionMov}</span>
              {expandable && (
                <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              )}
            </div>

            {/* Incidencias: cantidad de ítems no entregados/devueltos (solo aplica a ventas) */}
            <span className={`text-xs text-center tabular-nums font-medium ${tieneNoEntregados ? 'text-amber-600' : 'text-muted-foreground'}`}>
              {isPayment ? '' : noEntregadosUnified.length}
            </span>

            {/* Cobrador */}
            <span className="text-xs text-muted-foreground truncate">{cobradorNombre}</span>

            {/* Estado: verificación del comprobante (cobros de cobrador) */}
            <div className="flex justify-center">
              {comprobante?.viaCobrador ? (
                comprobante.autorizado ? (
                  <span title="Verificado">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </span>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1 py-0 h-4 gap-0.5 text-amber-600 border-amber-300 whitespace-nowrap"
                    title="Pago cargado por un cobrador, todavía sin confirmar ni anular"
                  >
                    <AlertTriangle className="h-3 w-3" />VERIFICAR
                  </Badge>
                )
              ) : null}
            </div>

            {/* Debe (ventas / deudas) */}
            <span className="text-sm font-bold tabular-nums text-right text-red-600">
              {!isPayment ? formatCurrencyDecimals(tx.amount) : '—'}
            </span>
            {/* Haber (pagos) */}
            <span className="text-sm font-bold tabular-nums text-right text-green-600">
              {isPayment ? formatCurrencyDecimals(tx.amount) : '—'}
            </span>
            {/* Saldo acumulado */}
            <span className={`text-sm font-semibold tabular-nums text-right ${
              saldoAcumulado == null ? 'text-muted-foreground'
                : saldoAcumulado > 0 ? 'text-red-600'
                : saldoAcumulado < 0 ? 'text-green-600' : 'text-muted-foreground'
            }`}>
              {saldoAcumulado == null
                ? '—'
                : saldoAcumulado < 0
                  ? `A favor ${formatCurrencyDecimals(-saldoAcumulado)}`
                  : formatCurrencyDecimals(saldoAcumulado)}
            </span>
          </>
        )}
      </div>

      {/* Panel expandido — comprobante / recibo / anular (todos los pagos) */}
      {isPayment && expanded && !isDescuento && (
        <div className="border-t bg-muted/20 px-3 pb-3 pt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Recibo de DEVOLUCIÓN (mismo de Ventas) — no recibo de pago */}
            {isDevolucion && devMatch && (
              <Button
                variant="outline" size="sm" className="gap-1.5 text-xs h-7 text-purple-600 border-purple-300 hover:bg-purple-50"
                onClick={handleDescargarReciboDevol}
                disabled={descargandoDevol}
              >
                {descargandoDevol ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {devMatch.reciboNumero || 'Recibo devolución'}
              </Button>
            )}
            {isRechazo && (
              <Button
                variant="outline" size="sm" className="gap-1.5 text-xs h-7 text-purple-600 border-purple-300 hover:bg-purple-50"
                onClick={handleDescargarReciboRechazo}
                disabled={descargandoRechazo || !tieneRechazo}
              >
                {descargandoRechazo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {rechazoRecibo || 'Recibo devolución'}
              </Button>
            )}
            {!isDevolucion && !isRechazo && (
              tx.reciboPdfBase64 ? (
                <>
                  <Button
                    variant="outline" size="sm" className="gap-1.5 text-xs h-7 text-teal-600 border-teal-300 hover:bg-teal-50"
                    onClick={(e) => { e.stopPropagation(); descargarDocumento(tx.reciboPdfBase64!, 'recibo', tx.reciboNumero) }}
                  >
                    <Receipt className="h-3.5 w-3.5" />{tx.reciboNumero || 'Recibo'}
                  </Button>
                  {onRegenerarRecibo && (
                    <Button
                      variant="ghost" size="sm" className="gap-1.5 text-xs h-7 text-muted-foreground hover:text-teal-600"
                      onClick={handleRegenerarRecibo}
                      disabled={regenerandoRecibo}
                      title="Generar de nuevo el recibo"
                    >
                      {regenerandoRecibo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Regenerar
                    </Button>
                  )}
                </>
              ) : onRegenerarRecibo ? (
                <Button
                  variant="outline" size="sm" className="gap-1.5 text-xs h-7 text-teal-600 border-teal-300 hover:bg-teal-50"
                  onClick={handleRegenerarRecibo}
                  disabled={regenerandoRecibo}
                >
                  {regenerandoRecibo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
                  Generar recibo
                </Button>
              ) : tx.reciboNumero ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-teal-600">
                  <Receipt className="h-3.5 w-3.5" />{tx.reciboNumero}
                </span>
              ) : null
            )}
            {comprobante?.fileUrl && (
              <Button
                variant="outline" size="sm" className="gap-1.5 text-xs h-7 text-muted-foreground"
                onClick={(e) => { e.stopPropagation(); onVerComprobante?.(comprobante.fileUrl) }}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Ver comprobante
              </Button>
            )}
            {isPagoSimple && metodoPago && (
              <span className="text-xs text-foreground font-medium whitespace-nowrap">{metodoPago}</span>
            )}
            {isPagoSimple && notaPago && (
              <span className="text-xs text-muted-foreground truncate" title={notaPago}>&ldquo;{notaPago}&rdquo;</span>
            )}
            {!isDescuento && !isRechazo && onAnularPago && !tx.anulado && (
              <Button
                variant="outline" size="sm" className="gap-1.5 text-xs h-7 text-red-500 border-red-300 hover:bg-red-50 ml-auto shrink-0"
                onClick={(e) => { e.stopPropagation(); onAnularPago(tx) }}
              >
                <Ban className="h-3.5 w-3.5" />
                Anular pago
              </Button>
            )}
          </div>
          {devolucionExpandable && devMatch && (
            <div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 mb-1">
                <RotateCcw className="h-3 w-3" />
                Ítems devueltos
              </div>
              <ItemsTable
                items={devMatch.items.map((it) => ({ name: it.name, quantity: it.quantity, price: it.price, priceIsNet: true, destino: it.destino }))}
                showTotal
              />
            </div>
          )}
        </div>
      )}

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
