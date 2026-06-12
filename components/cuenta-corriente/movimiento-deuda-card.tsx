'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  ArrowDownCircle, ArrowUpCircle, ChevronDown, Download, Package, Receipt, Truck,
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
  const saldo = !isPayment && tx.saldo != null ? tx.saldo : null
  const pagada = saldo != null && saldo <= 0
  const parcial = saldo != null && saldo > 0 && saldo < tx.amount

  return (
    <div className="border rounded-lg">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 ${expandable ? 'cursor-pointer' : ''}`}
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
        <div className="text-right shrink-0">
          <span className={`text-xs font-bold tabular-nums ${isPayment ? 'text-green-600' : 'text-red-600'}`}>
            {isPayment ? '-' : '+'}{formatCurrency(tx.amount)}
          </span>
          {saldo != null && (
            <span className={`ml-1 text-[11px] font-medium ${pagada ? 'text-green-600' : parcial ? 'text-amber-600' : 'text-red-500'}`}>
              {pagada ? '✓' : `Saldo: ${formatCurrency(saldo)}`}
            </span>
          )}
        </div>
        {expandable && (
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        )}
      </div>

      {expandable && expanded && sale && (
        <div className="px-3 pb-2 pt-1 border-t space-y-1.5">
          <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Package className="h-3 w-3" />
            Productos
          </div>
          <div className="flex flex-col gap-0.5">
            {sale.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate">
                  {it.quantity}× {it.name}{it.esRegalo ? ' (regalo)' : ''}
                </span>
                <span className="tabular-nums shrink-0">{formatCurrency(it.price * it.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[11px] font-semibold pt-1 border-t">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(sale.total)}</span>
          </div>
          {tieneRemito ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 text-xs mt-1 h-7"
              onClick={() => descargarRemito(sale)}
            >
              <Download className="h-3 w-3" />
              Remito {sale.remitoNumber}
            </Button>
          ) : (
            <p className="text-[11px] text-muted-foreground text-center">Sin remito</p>
          )}
        </div>
      )}
    </div>
  )
}
