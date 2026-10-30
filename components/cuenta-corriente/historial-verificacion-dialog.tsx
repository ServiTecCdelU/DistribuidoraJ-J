'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, History, Loader2, Printer, RotateCcw, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { downloadBase64Pdf } from '@/services/pdf-service'
import { normalizarBusqueda, tokenizarBusqueda } from '@/lib/utils/ventas-search'
import type { ComprobantePago } from '@/lib/types'

type Periodo = 'todo' | 'dia' | 'rango'
type Estado = 'todos' | 'confirmados' | 'anulados'

const TODOS = '__todos__'

// Fecha local YYYY-MM-DD (la de los inputs type=date), sin corrimiento por zona horaria.
const ymd = (d: Date) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const hoy = () => ymd(new Date())
const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] as string))
const cobradoPor = (c: ComprobantePago) => c.sellerName || c.reviewedBy || '—'
const revisadoPor = (c: ComprobantePago) => (c.autorizado ? c.autorizadoBy : c.reviewedBy) || '—'

// Remitos que paga un cobro, uno por fila (también lo usa el panel "Verificar pago")
export function RemitosImputados({ remitos }: { remitos?: string[] }) {
  if (!remitos || remitos.length === 0) return null
  return (
    <div className="mt-0.5 text-xs font-normal text-teal-700 dark:text-teal-400">
      {remitos.some((r) => r.startsWith('N° ')) && <p className="text-muted-foreground">Remito</p>}
      {remitos.map((r) => (
        <p key={r}>{r}</p>
      ))}
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Cobros de cobrador ya revisados (confirmados o anulados), más recientes primero */
  items: ComprobantePago[]
  /** Devuelve un cobro confirmado por error a "Verificar pago" */
  onVolverAVerificar: (comp: ComprobantePago) => Promise<void>
}

export function HistorialVerificacionDialog({ open, onOpenChange, items, onVolverAVerificar }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('todo')
  const [dia, setDia] = useState(hoy)
  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(hoy)
  const [vendedor, setVendedor] = useState(TODOS)
  const [cliente, setCliente] = useState('')
  const [estado, setEstado] = useState<Estado>('todos')
  const [printing, setPrinting] = useState(false)
  const [volviendoId, setVolviendoId] = useState<string | null>(null)

  const vendedores = useMemo(
    () => [...new Set(items.map(cobradoPor).filter((n) => n !== '—'))].sort((a, b) => a.localeCompare(b)),
    [items]
  )
  // Cliente o N° de recibo: todas las palabras, en cualquier orden, sin mayúsculas ni tildes.
  const palabrasCliente = useMemo(() => tokenizarBusqueda(normalizarBusqueda(cliente)), [cliente])

  const filtrados = useMemo(() => {
    return items.filter((c) => {
      const f = ymd(c.createdAt)
      if (periodo === 'dia' && f !== dia) return false
      if (periodo === 'rango' && ((desde && f < desde) || (hasta && f > hasta))) return false
      if (vendedor !== TODOS && cobradoPor(c) !== vendedor) return false
      if (palabrasCliente.length > 0) {
        const texto = normalizarBusqueda(`${c.clientName || ''} ${c.reciboNumero || ''}`)
        if (!palabrasCliente.every((p) => texto.includes(p))) return false
      }
      if (estado === 'confirmados' && !c.autorizado) return false
      if (estado === 'anulados' && c.status !== 'rejected') return false
      return true
    })
  }, [items, periodo, dia, desde, hasta, vendedor, palabrasCliente, estado])

  const confirmados = filtrados.filter((c) => c.autorizado)
  const anulados = filtrados.filter((c) => c.status === 'rejected')
  const hayFiltros = periodo !== 'todo' || vendedor !== TODOS || palabrasCliente.length > 0 || estado !== 'todos'

  const limpiarFiltros = () => {
    setPeriodo('todo')
    setVendedor(TODOS)
    setCliente('')
    setEstado('todos')
  }

  const descripcionFiltros = () => {
    const partes: string[] = []
    if (periodo === 'dia') partes.push(`Día ${formatDate(new Date(`${dia}T12:00:00`))}`)
    if (periodo === 'rango') partes.push(`Del ${desde ? formatDate(new Date(`${desde}T12:00:00`)) : '…'} al ${hasta ? formatDate(new Date(`${hasta}T12:00:00`)) : '…'}`)
    if (vendedor !== TODOS) partes.push(`Cobrado por ${vendedor}`)
    if (palabrasCliente.length > 0) partes.push(`Búsqueda: ${cliente.trim()}`)
    if (estado !== 'todos') partes.push(estado === 'confirmados' ? 'Solo confirmados' : 'Solo anulados')
    return partes.length > 0 ? partes.join(' · ') : 'Todos los cobros'
  }

  const imprimir = async (lista: ComprobantePago[], titulo: string) => {
    if (printing) return
    if (lista.length === 0) { toast.error('No hay cobros para imprimir'); return }
    const totalConfirmado = lista.filter((c) => c.autorizado).reduce((a, c) => a + c.amount, 0)
    const totalAnulado = lista.filter((c) => c.status === 'rejected').reduce((a, c) => a + c.amount, 0)
    const filas = lista.map((c) => `<tr>
      <td>${esc(c.clientName || 'Cliente')}${c.imputadoA?.length ? `<br><small>${c.imputadoA.some((r) => r.startsWith('N° ')) ? 'Remito<br>' : ''}${c.imputadoA.map(esc).join('<br>')}</small>` : ''}</td>
      <td class="center">${esc(formatDate(c.createdAt))}</td>
      <td>${esc(cobradoPor(c))}</td>
      <td>${esc(c.reciboNumero || '—')}</td>
      <td class="right">${esc(formatCurrency(c.amount))}</td>
      <td class="center ${c.autorizado ? 'ok' : 'anulado'}">${c.autorizado ? 'Confirmado' : 'Anulado'}</td>
      <td>${esc(revisadoPor(c))}</td>
    </tr>`).join('')
    const fecha = formatDate(new Date())
    const html = `<!doctype html><html><head><meta charset="utf-8">
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 14mm; }
        h1 { font-size: 15px; margin: 0 0 4px; font-weight: 700; }
        .sub { font-size: 11px; color: #555; margin: 0 0 14px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #0d9488; color: #fff; padding: 6px 8px; text-align: left; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) td { background: #f8fafc; }
        .right { text-align: right; } .center { text-align: center; }
        .ok { color: #15803d; font-weight: 700; } .anulado { color: #dc2626; font-weight: 700; }
        .tot { font-size: 12px; margin-top: 12px; }
        .tot b { font-size: 13px; }
      </style></head><body>
      <h1>Historial de verificación de cobros · ${esc(fecha)}</h1>
      <p class="sub">${esc(titulo)}</p>
      <table><thead><tr><th>Cliente</th><th class="center">Fecha</th><th>Cobrado por</th><th>Recibo</th><th class="right">Monto</th><th class="center">Estado</th><th>Revisado por</th></tr></thead>
      <tbody>${filas}</tbody></table>
      <div class="tot">${lista.length} cobro(s) · Confirmados: <b>${esc(formatCurrency(totalConfirmado))}</b> · Anulados: <b>${esc(formatCurrency(totalAnulado))}</b></div>
      </body></html>`

    setPrinting(true)
    const toastId = toast.loading('Generando PDF...')
    try {
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, filename: 'verificacion-cobros.pdf', pageNumbers: true }),
      })
      const data = await res.json()
      if (!res.ok || !data?.pdf) throw new Error(data?.error || 'Error generando PDF')
      downloadBase64Pdf(data.pdf, `verificacion_cobros_${hoy()}.pdf`)
      toast.success(`${lista.length} cobros impresos`, { id: toastId })
    } catch {
      toast.error('Error al generar el PDF', { id: toastId })
    } finally {
      setPrinting(false)
    }
  }

  const volverAVerificar = async (comp: ComprobantePago) => {
    setVolviendoId(comp.id)
    try {
      await onVolverAVerificar(comp)
    } finally {
      setVolviendoId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4.5 w-4.5 text-muted-foreground" />
            Historial de verificación
          </DialogTitle>
          <DialogDescription>
            Cobros de cobrador ya revisados por un admin: confirmados o anulados.
          </DialogDescription>
        </DialogHeader>

        {/* Filtros */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-2xl border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label className="text-xs">Fecha</Label>
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">Todas las fechas</SelectItem>
                <SelectItem value="dia">Un solo día</SelectItem>
                <SelectItem value="rango">Desde / hasta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodo === 'dia' && (
            <div className="space-y-1">
              <Label className="text-xs">Día</Label>
              <Input type="date" className="h-8 text-xs" value={dia} onChange={(e) => setDia(e.target.value)} />
            </div>
          )}
          {periodo === 'rango' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Desde</Label>
                <Input type="date" className="h-8 text-xs" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <Input type="date" className="h-8 text-xs" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Cobrado por</Label>
            <Select value={vendedor} onValueChange={setVendedor}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {vendedores.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cliente o recibo</Label>
            <Input
              className="h-8 text-xs"
              placeholder="Cliente o N° de recibo..."
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estado</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as Estado)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="confirmados">Confirmados</SelectItem>
                <SelectItem value="anulados">Anulados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 dark:bg-green-950/30 px-2.5 py-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              <span className="font-semibold text-green-700 dark:text-green-500">{confirmados.length}</span>
              <span className="text-muted-foreground">confirmados</span>
              <span className="font-semibold text-green-700 dark:text-green-500">{formatCurrency(confirmados.reduce((a, c) => a + c.amount, 0))}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 px-2.5 py-1.5">
              <XCircle className="h-3.5 w-3.5 text-red-600" />
              <span className="font-semibold text-red-700 dark:text-red-500">{anulados.length}</span>
              <span className="text-muted-foreground">anulados</span>
            </span>
            {hayFiltros && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {hayFiltros && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={printing} onClick={() => imprimir(filtrados, descripcionFiltros())}>
                <Printer className="h-3.5 w-3.5" />
                Imprimir lo filtrado
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={printing} onClick={() => imprimir(items, 'Todos los cobros')}>
              {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              Imprimir todo
            </Button>
          </div>
        </div>

        {filtrados.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {items.length === 0 ? 'Todavía no hay cobros revisados.' : 'No hay cobros con estos filtros.'}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cobrado por</TableHead>
                  <TableHead>Recibo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Revisado por</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((comp) => (
                  <TableRow key={comp.id}>
                    <TableCell className="font-medium min-w-[9rem] whitespace-normal break-words" title={comp.clientName}>
                      {comp.clientName || 'Cliente'}
                      <RemitosImputados remitos={comp.imputadoA} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(comp.createdAt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{cobradoPor(comp)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{comp.reciboNumero || '—'}</TableCell>
                    <TableCell className="text-right font-semibold whitespace-nowrap">{formatCurrency(comp.amount)}</TableCell>
                    <TableCell>
                      {comp.autorizado ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Confirmado</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100" title={comp.rejectionReason}>Anulado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{revisadoPor(comp)}</TableCell>
                    <TableCell className="text-right">
                      {comp.autorizado && comp.status === 'approved' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                          onClick={() => volverAVerificar(comp)}
                          disabled={volviendoId === comp.id}
                          title="Lo confirmaste por error: vuelve a Verificar pago"
                        >
                          {volviendoId === comp.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          Volver a verificar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
