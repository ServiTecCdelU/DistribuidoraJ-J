'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ArrowDownCircle, ArrowUpCircle, ChevronDown, Download, Package, Truck, Receipt,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { descargarDocumento } from '@/lib/utils/doc-actions'
import type { Sale, Transaction } from '@/lib/types'

interface MovimientoDeudaCardProps {
  tx: Transaction
  sale?: Sale
}

function descargarRemito(sale: Sale) {
  if (sale.remitoPdfBase64) {
    descargarDocumento(sale.remitoPdfBase64, 'remito', sale.remitoNumber, sale.clientName)
    return
  }
  const url = sale.remitoPdfUrl || sale.remitoDriveUrl
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function MovimientoDeudaCard({ tx, sale }: MovimientoDeudaCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isPayment = tx.type === 'payment'
  const expandable = !isPayment && !!sale
  const tieneRemito = !!sale?.remitoNumber
  const tieneRecibo = isPayment && !!tx.reciboNumero

  return (
    <Card>
      <CardContent className="p-3">
        <div
          className={`flex items-center gap-3 ${expandable ? 'cursor-pointer' : ''}`}
          onClick={expandable ? () => setExpanded((v) => !v) : undefined}
        >
          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
            isPayment ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
          }`}>
            {isPayment
              ? <ArrowDownCircle className="h-4 w-4 text-green-600" />
              : <ArrowUpCircle className="h-4 w-4 text-red-600" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{tx.description}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              {formatDate(tx.date)}
              {tieneRemito && (
                <span className="inline-flex items-center gap-1 text-blue-600">
                  <Truck className="h-3 w-3" />{sale!.remitoNumber}
                </span>
              )}
              {tieneRecibo && (
                <span className="inline-flex items-center gap-1 text-green-600">
                  <Receipt className="h-3 w-3" />{tx.reciboNumero}
                </span>
              )}
            </p>
          </div>
          <p className={`font-bold tabular-nums ${isPayment ? 'text-green-600' : 'text-red-600'}`}>
            {isPayment ? '-' : '+'}{formatCurrency(tx.amount)}
          </p>
          {expandable && (
            <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          )}
        </div>

        {tieneRecibo && tx.reciboPdfBase64 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs mt-2"
            onClick={() => descargarDocumento(tx.reciboPdfBase64, 'recibo', tx.reciboNumero, undefined)}
          >
            <Download className="h-3.5 w-3.5" />
            Descargar recibo {tx.reciboNumero}
          </Button>
        )}

        {expandable && expanded && sale && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              Productos de la venta
            </div>
            <div className="flex flex-col gap-1">
              {sale.items.map((it, i) => (
                <div key={i} className="flex justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">
                    {it.quantity}× {it.name}{it.esRegalo ? ' (regalo)' : ''}
                  </span>
                  <span className="tabular-nums shrink-0">{formatCurrency(it.price * it.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs font-semibold pt-1 border-t">
              <span>Total venta</span>
              <span className="tabular-nums">{formatCurrency(sale.total)}</span>
            </div>
            {tieneRemito ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs mt-1"
                onClick={() => descargarRemito(sale)}
              >
                <Download className="h-3.5 w-3.5" />
                Descargar remito {sale.remitoNumber}
              </Button>
            ) : (
              <p className="text-[11px] text-muted-foreground text-center pt-1">Esta venta no tiene remito</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
