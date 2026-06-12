'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ArrowDownCircle, ArrowUpCircle, ChevronDown, Download, Package, Receipt, Truck,
  AlertTriangle, RotateCcw, Tag, PackageX,
} from 'lucide-react'
import { formatCurrencyDecimalsDecimals, formatDate } from '@/lib/utils/format'
import { descargarDocumento } from '@/lib/utils/doc-actions'
import type { Sale, Transaction } from '@/lib/types'
import type { Faltante } from '@/services/faltantes-service'
import type { Devolucion } from '@/services/devoluciones-service'

interface MovimientoDeudaCardProps {
  tx: Transaction
  sale?: Sale
  faltantes?: Faltante[]
  devoluciones?: Devolucion[]
  roturas?: Transaction[]
}

function descargarRemito(sale: Sale) {
  if (sale.remitoPdfBase64) {
    descargarDocumento(sale.remitoPdfBase64, 'remito', sale.remitoNumber, sale.clientName)
    return
  }
  const url = sale.remitoPdfUrl || sale.remitoDriveUrl
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

export function MovimientoDeudaCard({ tx, sale, faltantes = [], devoluciones = [], roturas = [] }: MovimientoDeudaCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isPayment = tx.type === 'payment'
  const expandable = !isPayment && !!sale
  const tieneRemito = !!sale?.remitoNumber
  const saldo = !isPayment && tx.saldo != null ? tx.saldo : null
  const pagada = saldo != null && saldo <= 0
  const parcial = saldo != null && saldo > 0 && saldo < tx.amount

  const tieneFaltantes = faltantes.length > 0
  const tieneDevols = devoluciones.length > 0
  const tieneRoturas = roturas.length > 0
  const tieneExtra = tieneFaltantes || tieneDevols || tieneRoturas

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
        {tieneExtra && !expanded && (
          <span className="flex gap-1 shrink-0">
            {tieneFaltantes && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300">{faltantes.length} faltante{faltantes.length > 1 ? 's' : ''}</Badge>}
            {tieneDevols && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-purple-600 border-purple-300">{devoluciones.length} devol.</Badge>}
            {tieneRoturas && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-red-600 border-red-300">rotura</Badge>}
          </span>
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

          {/* Productos entregados */}
          <div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground mb-1">
              <Package className="h-3 w-3" />
              Productos entregados
            </div>
            <div className="flex flex-col gap-0.5">
              {sale.items.map((it, i) => {
                const subtotal = it.price * it.quantity
                return (
                  <div key={i} className="flex items-center gap-1.5 text-[11px]">
                    {it.esRegalo && (
                      <Badge className="text-[9px] px-1 py-0 h-3.5 bg-green-100 text-green-700 border-0 shrink-0">REGALO</Badge>
                    )}
                    <span className="flex-1 min-w-0 truncate">
                      {it.quantity}× {it.name}
                    </span>
                    {it.itemDiscount && it.itemDiscount > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-amber-600 shrink-0">
                        <Tag className="h-2.5 w-2.5" />-{it.itemDiscount}%
                      </span>
                    )}
                    <span className={`tabular-nums shrink-0 ${it.esRegalo ? 'text-green-600' : ''}`}>
                      {it.esRegalo ? 'GRATIS' : formatCurrencyDecimals(subtotal)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-[11px] font-semibold pt-1 border-t mt-1">
              <span>Total venta</span>
              <span className="tabular-nums">{formatCurrencyDecimals(sale.total)}</span>
            </div>
            {sale.discount && sale.discount > 0 && (
              <div className="flex items-center gap-1 text-[11px] text-amber-600 pt-0.5">
                <Tag className="h-3 w-3" />
                Descuento general: {sale.discountType === 'percent' ? `${sale.discount}%` : formatCurrencyDecimals(sale.discount)}
              </div>
            )}
            {tieneRemito ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs mt-2 h-7"
                onClick={() => descargarRemito(sale)}
              >
                <Download className="h-3 w-3" />
                Remito {sale.remitoNumber}
              </Button>
            ) : (
              <p className="text-[11px] text-muted-foreground text-center mt-1">Sin remito</p>
            )}
          </div>

          {/* Faltantes de esta entrega */}
          {tieneFaltantes && (
            <div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 mb-1">
                <AlertTriangle className="h-3 w-3" />
                No entregados en esta entrega
              </div>
              <div className="flex flex-col gap-0.5">
                {faltantes.map((f) => (
                  <div key={f.id} className="flex items-center gap-1.5 text-[11px]">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 h-3.5 shrink-0 ${
                        f.motivo === 'no_quiso'
                          ? 'text-orange-600 border-orange-300'
                          : 'text-amber-600 border-amber-300'
                      }`}
                    >
                      {f.motivo === 'no_quiso' ? 'NO QUISO' : 'FALTÓ'}
                    </Badge>
                    <span className="flex-1 min-w-0 truncate">{f.productoNombre}</span>
                    <span className="tabular-nums shrink-0 text-muted-foreground">{f.cantidad} u.</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Devoluciones de esta venta */}
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

          {/* Roturas acreditadas al momento de entrega */}
          {tieneRoturas && (
            <div>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-red-700 mb-1">
                <PackageX className="h-3 w-3" />
                Rotura al entregar
              </div>
              <div className="flex flex-col gap-0.5">
                {roturas.map((r) => {
                  const detalle = r.description.replace(/^\[ROTURA\]\s*#\S+\s*—?\s*/, '')
                  return (
                    <div key={r.id} className="flex items-start justify-between gap-2 text-[11px]">
                      <span className="text-muted-foreground flex-1 min-w-0">{detalle || r.description}</span>
                      <span className="text-red-600 font-semibold tabular-nums shrink-0">-{formatCurrencyDecimals(Math.abs(r.amount))}</span>
                    </div>
                  )
                })}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                El remito muestra el total original antes de descontar la rotura.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
