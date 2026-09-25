'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ArrowUpCircle, DollarSign, Loader2, Package, Percent, RotateCcw, Search, Trash2, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils/format'
import { clientsApi, devolucionesApi, paymentsApi, productsApi, type DevolucionItem } from '@/lib/api'
import { montoDescuento, totalItemsNotaCredito } from '@/lib/utils/nota-credito'
import type { Client, Product } from '@/lib/types'

export type TipoNotaCC = 'credito' | 'debito'
type ModoCredito = 'productos' | 'descuento' | 'monto'

interface FilaProducto {
  productId: string
  name: string
  codigo?: string
  price: number
  quantity: number
  destino: 'stock' | 'perdida'
}

interface ModalNotaCCProps {
  abierto: boolean
  tipoInicial: TipoNotaCC
  cliente: Client | null
  onCerrar: () => void
  onRegistrada: () => void
}

const SEARCH_DEBOUNCE_MS = 300
const SEARCH_RESULTS = 8

const TAB_BASE = 'flex-1 flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg transition-colors'
const TAB_ON = 'bg-background shadow-sm text-foreground'
const TAB_OFF = 'text-muted-foreground'

export function ModalNotaCC({ abierto, tipoInicial, cliente, onCerrar, onRegistrada }: ModalNotaCCProps) {
  const [tipo, setTipo] = useState<TipoNotaCC>(tipoInicial)
  const [modo, setModo] = useState<ModoCredito>('productos')
  const [filas, setFilas] = useState<FilaProducto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<Product[]>([])
  const [buscando, setBuscando] = useState(false)
  const [baseDescuento, setBaseDescuento] = useState(0)
  const [porcentaje, setPorcentaje] = useState(0)
  const [monto, setMonto] = useState(0)
  const [nota, setNota] = useState('')
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    if (abierto) setTipo(tipoInicial)
  }, [abierto, tipoInicial])

  useEffect(() => {
    const texto = busqueda.trim()
    if (tipo !== 'credito' || modo !== 'productos' || texto.length < 2) {
      setResultados([])
      return
    }
    setBuscando(true)
    const handler = setTimeout(async () => {
      try {
        const res = await productsApi.search({ search: texto, page: 1, pageSize: SEARCH_RESULTS })
        setResultados(res.data.filter((p) => !(p as any).disabled))
      } catch {
        setResultados([])
      } finally {
        setBuscando(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handler)
  }, [busqueda, tipo, modo])

  const totalCredito = useMemo(() => {
    if (modo === 'productos') return totalItemsNotaCredito(filas)
    if (modo === 'descuento') return montoDescuento(baseDescuento, porcentaje)
    return monto
  }, [modo, filas, baseDescuento, porcentaje, monto])

  const total = totalCredito
  const hayAlgo = total > 0

  const agregarProducto = (p: Product) => {
    setFilas((prev) => {
      const existente = prev.findIndex((f) => f.productId === p.id)
      if (existente >= 0) {
        return prev.map((f, i) => (i === existente ? { ...f, quantity: f.quantity + 1 } : f))
      }
      return [
        ...prev,
        { productId: p.id, name: p.name, codigo: p.codigo, price: p.price, quantity: 1, destino: 'stock' },
      ]
    })
    setBusqueda('')
    setResultados([])
  }

  const actualizarFila = (idx: number, cambios: Partial<FilaProducto>) =>
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, ...cambios } : f)))

  const quitarFila = (idx: number) => setFilas((prev) => prev.filter((_, i) => i !== idx))

  const reset = () => {
    setModo('productos')
    setFilas([])
    setBusqueda('')
    setResultados([])
    setBaseDescuento(0)
    setPorcentaje(0)
    setMonto(0)
    setNota('')
  }

  const cerrar = () => {
    if (procesando) return
    reset()
    onCerrar()
  }

  const descripcionCredito = (): string | undefined => {
    const base = nota.trim()
    if (modo !== 'descuento') return base || undefined
    const detalle = `Descuento ${porcentaje}% sobre ${formatCurrency(baseDescuento)}`
    return base ? `${detalle} — ${base}` : detalle
  }

  const descripcionDebito = (): string => {
    const base = nota.trim()
    let detalle = ''
    if (modo === 'productos') detalle = filas.filter((f) => f.quantity > 0).map((f) => `${f.quantity}x ${f.name}`).join(', ')
    if (modo === 'descuento') detalle = `Descuento ${porcentaje}% sobre ${formatCurrency(baseDescuento)}`
    return [detalle, base].filter(Boolean).join(' — ')
  }

  const registrarDebito = async () => {
    if (!cliente) return
    await paymentsApi.registerNotaDebito({ clientId: cliente.id, amount: totalCredito, motivo: descripcionDebito() })
    toast.success(`Nota de débito de ${formatCurrency(totalCredito)} registrada`)
  }

  const registrarCredito = async () => {
    if (!cliente) return
    const items: DevolucionItem[] =
      modo === 'productos'
        ? filas
            .filter((f) => f.quantity > 0)
            .map((f) => ({
              productId: f.productId,
              name: f.name,
              codigo: f.codigo,
              quantity: f.quantity,
              price: f.price,
              destino: f.destino,
            }))
        : []
    const fresco = await clientsApi.getById(cliente.id)
    const saldoAnterior = Number(fresco?.currentBalance) || 0

    const dev = await devolucionesApi.registrar({
      clientId: cliente.id,
      clientName: cliente.name,
      sellerId: cliente.sellerId,
      sellerName: (cliente as Client & { sellerName?: string }).sellerName,
      items,
      monto: modo === 'productos' ? undefined : totalCredito,
      note: descripcionCredito(),
      affectsBalance: true,
    })

    try {
      const { generarReciboDevolucion } = await import('@/hooks/useGenerarPdf')
      const base64 = await generarReciboDevolucion({
        reciboNumero: dev.reciboNumero,
        fecha: dev.createdAt,
        clientName: cliente.name,
        clientPhone: cliente.phone,
        items: items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, destino: i.destino })),
        total: dev.total,
        saldoAnterior,
        saldoNuevo: dev.affectsBalance ? saldoAnterior - dev.total : saldoAnterior,
      })
      await devolucionesApi.saveRecibo(dev.id, base64)
      const link = document.createElement('a')
      link.href = `data:application/pdf;base64,${base64}`
      link.download = `recibo-devolucion-${dev.reciboNumero}.pdf`
      link.click()
    } catch {
      toast.warning('Nota de crédito registrada, pero falló la generación del recibo')
    }
    toast.success(`Nota de crédito registrada: ${formatCurrency(dev.total)}`)
  }

  const confirmar = async () => {
    if (!cliente || !hayAlgo) return
    setProcesando(true)
    try {
      if (tipo === 'debito') await registrarDebito()
      else await registrarCredito()
      reset()
      onCerrar()
      onRegistrada()
    } catch (e: any) {
      toast.error(e?.message || 'Error al registrar la nota')
    } finally {
      setProcesando(false)
    }
  }

  if (!cliente) return null

  const esCredito = tipo === 'credito'

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className={`p-6 border-b border-border/50 bg-gradient-to-br ${esCredito ? 'from-amber-500/5 to-amber-500/10' : 'from-red-500/5 to-red-500/10'}`}>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white dark:bg-background shadow-sm flex items-center justify-center">
              {esCredito ? <RotateCcw className="h-6 w-6 text-amber-600" /> : <ArrowUpCircle className="h-6 w-6 text-red-600" />}
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-foreground">
                {esCredito ? 'Nota de crédito' : 'Nota de débito'}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {cliente.name} · sin venta asociada
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2 p-1 rounded-xl bg-muted/50">
            <button type="button" onClick={() => setTipo('credito')} className={`${TAB_BASE} ${esCredito ? TAB_ON : TAB_OFF}`}>
              <RotateCcw className="h-4 w-4" />
              Crédito
            </button>
            <button type="button" onClick={() => setTipo('debito')} className={`${TAB_BASE} ${!esCredito ? TAB_ON : TAB_OFF}`}>
              <ArrowUpCircle className="h-4 w-4" />
              Débito
            </button>
          </div>

          <div className="flex items-center gap-2 p-1 rounded-xl bg-muted/50">
              <button type="button" onClick={() => setModo('productos')} className={`${TAB_BASE} ${modo === 'productos' ? TAB_ON : TAB_OFF}`}>
                <Package className="h-4 w-4" />
                Productos
              </button>
              <button type="button" onClick={() => setModo('descuento')} className={`${TAB_BASE} ${modo === 'descuento' ? TAB_ON : TAB_OFF}`}>
                <Percent className="h-4 w-4" />
                Descuento
              </button>
              <button type="button" onClick={() => setModo('monto')} className={`${TAB_BASE} ${modo === 'monto' ? TAB_ON : TAB_OFF}`}>
                <DollarSign className="h-4 w-4" />
                Monto $
              </button>
          </div>

          {modo === 'productos' && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar producto por nombre o código..."
                  className="pl-9 h-10 rounded-xl"
                />
                {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
              </div>

              {resultados.length > 0 && (
                <div className="rounded-2xl border border-border/60 divide-y max-h-52 overflow-y-auto">
                  {resultados.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => agregarProducto(p)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate">{p.name}</span>
                        {p.codigo && <span className="block text-xs text-muted-foreground">{p.codigo}</span>}
                      </span>
                      <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(p.price)}</span>
                    </button>
                  ))}
                </div>
              )}

              {filas.map((f, idx) => (
                <div key={f.productId} className="rounded-2xl border border-border/60 p-3 bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-sm text-foreground min-w-0 truncate">{f.name}</p>
                    <button type="button" onClick={() => quitarFila(idx)} className="text-muted-foreground hover:text-red-600 shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      type="number"
                      min={1}
                      value={f.quantity || ''}
                      onChange={(e) => actualizarFila(idx, { quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                      className="w-16 h-9 text-center rounded-xl"
                      aria-label="Cantidad"
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input
                      type="number"
                      min={0}
                      value={f.price || ''}
                      onChange={(e) => actualizarFila(idx, { price: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-28 h-9 rounded-xl"
                      aria-label="Precio unitario"
                    />
                    <span className="ml-auto text-sm font-semibold tabular-nums">{formatCurrency(f.price * f.quantity)}</span>
                  </div>
                  {esCredito && (
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => actualizarFila(idx, { destino: 'stock' })}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-xl border transition-colors ${
                        f.destino === 'stock' ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Vuelve a stock
                    </button>
                    <button
                      type="button"
                      onClick={() => actualizarFila(idx, { destino: 'perdida' })}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-xl border transition-colors ${
                        f.destino === 'perdida' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      No vuelve a stock
                    </button>
                  </div>
                  )}
                </div>
              ))}
              {filas.length === 0 && (
                <p className="text-sm text-muted-foreground py-3 text-center">Buscá y agregá los productos.</p>
              )}
            </div>
          )}

          {modo === 'descuento' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Importe base</p>
                <Input
                  type="number"
                  min={0}
                  value={baseDescuento || ''}
                  placeholder="0"
                  onChange={(e) => setBaseDescuento(Math.max(0, Number(e.target.value) || 0))}
                  className="h-11 rounded-xl"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Descuento %</p>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={porcentaje || ''}
                  placeholder="0"
                  onChange={(e) => setPorcentaje(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
          )}

          {modo === 'monto' && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                {esCredito ? 'Monto a devolver' : 'Monto a cargar'}
              </p>
              <Input
                type="number"
                min={0}
                value={monto || ''}
                placeholder="0"
                onChange={(e) => setMonto(Math.max(0, Number(e.target.value) || 0))}
                className="h-11 rounded-xl text-lg"
              />
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              {esCredito ? 'Nota (opcional)' : 'Motivo (opcional)'}
            </p>
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={esCredito ? 'Motivo de la devolución...' : 'Motivo del cargo...'}
              className="rounded-xl resize-none"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-2xl bg-foreground text-background mt-2">
            <span className="font-medium">{esCredito ? 'Total a favor del cliente' : 'Total a cargar'}</span>
            <span className="text-2xl font-bold">{formatCurrency(total)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground px-1">
            {esCredito
              ? 'Baja el saldo de la cuenta corriente y la comisión del vendedor asignado. Los productos "vuelve a stock" se reponen al depósito.'
              : 'Sube el saldo de la cuenta corriente como una deuda pendiente de pago.'}
          </p>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={cerrar} disabled={procesando}>
              Cancelar
            </Button>
            <Button
              className={`flex-1 rounded-xl text-white ${esCredito ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'}`}
              onClick={confirmar}
              disabled={!hayAlgo || procesando}
            >
              {procesando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Procesando...
                </>
              ) : esCredito ? (
                'Confirmar nota de crédito'
              ) : (
                'Confirmar nota de débito'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
