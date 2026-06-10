'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Receipt, Download, Send, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { descargarDocumento, enviarWhatsapp } from '@/lib/utils/doc-actions'

interface ModalReciboPagoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reciboNumero: string
  base64: string | null
  monto: number
  clientName?: string
  clientPhone?: string
}

export function ModalReciboPago({
  open,
  onOpenChange,
  reciboNumero,
  base64,
  monto,
  clientName,
  clientPhone,
}: ModalReciboPagoProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Recibo {reciboNumero}
          </DialogTitle>
          <DialogDescription>Recibo de pago generado y guardado</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <span className="font-medium">{clientName || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monto</span>
              <span className="font-bold">{formatCurrency(monto)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2 flex-1"
              onClick={() => descargarDocumento(base64 ?? undefined, 'recibo', reciboNumero, clientName)}
            >
              <Download className="h-4 w-4" /> Descargar
            </Button>
            <Button
              className="gap-2 flex-1 bg-green-500 hover:bg-green-600 text-white"
              onClick={() =>
                enviarWhatsapp(base64 ?? undefined, 'recibo', reciboNumero, clientName, clientPhone)
              }
            >
              <Send className="h-4 w-4" /> WhatsApp
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full gap-2">
              <X className="h-4 w-4" /> Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
