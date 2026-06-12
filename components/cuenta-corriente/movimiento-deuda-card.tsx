'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowDownCircle, ArrowUpCircle, ChevronDown, Download, Receipt, Truck,
  AlertTriangle, RotateCcw, Tag, RefreshCw, Loader2,
} from 'lucide-react'
import { formatCurrencyDecimals, formatDate } from '@/lib/utils/format'
import { descargarDocumento } from '@/lib/utils/doc-actions'
import type { Sale, Transaction } from '@/lib/types'
import type { Devolucion } from '@/services/devoluciones-service'

interface MovimientoDeudaCardProps {
  tx: Transaction
  sale?: Sale
  devoluciones?: Devolucion[]
  onRegenerarRemito?: (sale: Sale) => Promise<void>
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
}
const MOTIVO_COLORS: Record<string, string> = {
  rotura: 'text-red-600 border-red-300',
  faltante: 'text-amber-600 border-amber-300',
  no_quiso: 'text-orange-600 border-orange-300',
}

function ItemsTable({
  items,
}: {
  items: Array<{ name: string; price: number; quantity: number; itemDiscount?: number; codigo?: string; esRegalo?: boolean; motivo?: string }>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-0.5 pr-1 w-10">Cod.</th>
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
            const unitConDto = it.price * (1 - dto / 100)
            const lineTotal = unitConDto * it.quantity
            const color = it.motivo ? MOTIVO_COLORS[it.motivo] ?? '' : ''
            return (
              <tr key={i} className="border-b border-muted/30 last:border-0">
                <td className="py-0.5 pr-1 text-muted-foreground">{it.codigo || '—'}</td>
                <td className="py-0.5 px-1 text-right tabular-nums">{it.quantity}</td>
                <td className="py-0.5 px-1 max-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    {it.motivo && (
                      <Badge variant="outline" className={`text-[8px] px-0.5 py-0 h-3 shrink-0 ${color}`}>
                        {MOTIVO_LABELS[it.motivo] ?? it.motivo}
                      </Badge>
                    )}
                    {it.esRegalo && (
                      <Badge className="text-[8px] px-0.5 py-0 h-3 bg-green-100 text-green-700 border-0 shrink-0">REGALO</Badge>
                    )}
                    <span className="truncate">{it.name}</span>
                  </div>
                </td>
                <td className="py-0.5 px-1 text-right tabular-nums">{formatCurrencyDecimals(it.price)}</td>
                <td className="py-0.5 px-1 text-right tabular-nums text-muted-foreground">
                  {dto > 0 ? `${dto}%` : '—'}
                </td>
                <td className="py-0.5 px-1 text-right tabular-nums">
                  {dto > 0 ? formatCurrencyDecimals(unitConDto) : '—'}
                </td>
                <td className={`py-0.5 pl-1 text-right tabular-nums font-medium ${it.esRegalo ? 'text-green-600' : ''}`}>
                  {it.esRegalo ? 'GRATIS' : formatCurrencyDecimals(lineTotal)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function MovimientoDeudaCard({ tx, sale, devoluciones = [], onRegenerarRemito }: MovimientoDeudaCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [regenerando, setRegenerando] = useState(false)

  const isPayment = tx.type === 'payment'
  const expandable = !isPayment && !!sale
  const tieneRemito = !!sale?.remitoNumber
  const saldo = !isPayment && tx.saldo != null ? tx.saldo : null
  const pagada = saldo != null && saldo <= 0
  const parcial = saldo != null && saldo > 0 && saldo < tx.amount

  const tieneDevols = devoluciones.length > 0
  const noEntregados = sale?.itemsNoEntregados ?? []
  const tieneNoEntregados = noEntregados.length > 0

  // Cálculos de totales
  const entregados = sale?.items ?? []
  const totalEntregado = entregados.reduce((acc, it) => {
    const dto = it.itemDiscount ?? 0
    return acc + it.price * (1 - dto / 100) * it.quantity
  }, 0)
  const totalDescuento = entregados.reduce((acc, it) => {
    const dto = it.itemDiscount ?? 0
    return acc + it.price * (dto / 100) * it.quantity
  }, 0)
  const totalNoEntregado = noEntregados.reduce((acc, it) => {
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

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Fila principal */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 ${expandable ? 'cursor-pointer hover:bg-muted/30' : ''}`}
        onClick={expandable ? () => setExpanded((v) => !v) : undefined}
      >
        {isPayment
          ? <ArrowDownCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
          : <ArrowUpCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
        }
        <span className="text-xs font-medium truncate flex-1 min-w-0">{tx.description}</span>
        <span className="text-[11px] text-muted-foreground shrink-0">{formatDate(tx.date)}</span>
        {tieneRemito && (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-blue-600 shrink-0">
            <Truck className="h-3 w-3" />{sale!.remitoNumber}
          </span>
        )}
        {isPayment && tx.reciboNumero && (
          tx.reciboPdfBase64 ? (
            <button
              type="button"
              className="inline-flex items-center gap-0.5 text-[11px] text-teal-600 hover:underline shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                descargarDocumento(tx.reciboPdfBase64!, 'recibo', tx.reciboNumero)
              }}
              title="Descargar recibo"
            >
              <Receipt className="h-3 w-3" />{tx.reciboNumero}
            </button>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-teal-600 shrink-0">
              <Receipt className="h-3 w-3" />{tx.reciboNumero}
            </span>
          )
        )}
        {tieneNoEntregados && !expanded && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300 shrink-0">
            {noEntregados.length} no entregado{noEntregados.length > 1 ? 's' : ''}
          </Badge>
        )}
        <div className="text-right shrink-0">
          <span className={`text-xs font-bold tabular-nums ${isPayment ? 'text-green-600' : 'text-red-600'}`}>
            {isPayment ? '-' : '+'}{formatCurrencyDecimals(tx.amount)}
          </span>
          {saldo != null && (
            <span className={`ml-1 text-[11px] font-medium ${pagada ? 'text-green-600' : parcial ? 'text-amber-600' : 'text-red-500'}`}>
              {pagada ? '✓' : `Saldo: ${formatCurrencyDecimals(saldo)}`}
            </span>
          )}
        </div>
        {expandable && (
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        )}
      </div>

      {/* Panel expandido */}
      {expandable && expanded && sale && (
        <div className="border-t bg-muted/20 px-3 pb-3 pt-2 space-y-3">

          {/* Tabla de productos entregados */}
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground mb-1">Productos entregados</div>
            <ItemsTable items={entregados} />
          </div>

          {/* Tabla de no entregados */}
          {tieneNoEntregados && (
            <div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 mb-1">
                <AlertTriangle className="h-3 w-3" />
                No entregados
              </div>
              <ItemsTable items={noEntregados} />
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
                      ? totalEntregado * sale.discount / 100
                      : sale.discount
                  )}
                </span>
              </div>
            )}
            {tieneNoEntregados && (
              <div className="flex justify-between text-muted-foreground">
                <span>Total no entregados</span>
                <span className="tabular-nums text-amber-600">{formatCurrencyDecimals(totalNoEntregado)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t pt-1 mt-1">
              <span>TOTAL</span>
              <span className="tabular-nums">{formatCurrencyDecimals(sale.total)}</span>
            </div>
          </div>

          {/* Devoluciones */}
          {tieneDevols && (
            <div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 mb-1">
                <RotateCcw className="h-3 w-3" />
                Devoluciones
              </div>
              <div className="flex flex-col gap-0.5">
                {devoluciones.map((dev) => (
                  <div key={dev.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{dev.reciboNumero} · {formatDate(dev.createdAt)}</span>
                      <span className="text-purple-600 font-semibold tabular-nums">-{formatCurrencyDecimals(dev.total)}</span>
                    </div>
                    {dev.items.map((it, i) => (
                      <div key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground pl-2">
                        <span className="flex-1 truncate">{it.quantity}× {it.name}</span>
                        <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3 ${it.destino === 'stock' ? 'text-green-600 border-green-300' : 'text-red-500 border-red-300'}`}>
                          {it.destino === 'stock' ? 'a stock' : 'pérdida'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

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
        </div>
      )}
    </div>
  )
}
