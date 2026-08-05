'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PackageX, Users, Loader2, ArrowLeft, ChevronRight, Search, Printer } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils/format'
import { faltantesApi, type FaltantesResumen, type FaltanteDetalle } from '@/lib/api'

interface FaltantesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ClienteGrupo {
  clienteId: string
  clienteNombre: string
  items: FaltanteDetalle[]
  totalConGanancia: number
  totalSinGanancia: number
}

const MES_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function mesKey(fecha: string): string {
  return (fecha ?? '').slice(0, 7) // YYYY-MM
}

function mesLabel(key: string): string {
  const [y, m] = key.split('-')
  const idx = Number(m) - 1
  return `${MES_LABELS[idx] ?? m} ${y}`
}

function escHtml(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Paged.js corre DENTRO de un iframe aislado (su propio documento), nunca en
// el documento de la app — así su CSS/DOM global no afecta la página en pantalla.
// El handler de subtotal se registra con JS plano dentro de ese iframe.
const PAGEDJS_HANDLER_SCRIPT = `
(function() {
  function fmtMoney(n) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n);
  }
  class SubtotalHandler extends Paged.Handler {
    afterPageLayout(pageElement) {
      var table = pageElement.querySelector('table[data-faltantes-print]');
      if (!table) return;
      var rows = Array.prototype.slice.call(table.querySelectorAll('tbody > tr[data-cant]'));
      if (rows.length === 0) return;
      var cant = 0, con = 0, sin = 0;
      rows.forEach(function (r) {
        cant += Number(r.getAttribute('data-cant')) || 0;
        con += Number(r.getAttribute('data-con')) || 0;
        sin += Number(r.getAttribute('data-sin')) || 0;
      });
      var labelColspan = Number(table.getAttribute('data-label-colspan')) || 1;
      var priceCols = Number(table.getAttribute('data-price-cols')) || 2;
      var hasFecha = table.getAttribute('data-has-fecha') === '1';

      var tr = document.createElement('tr');
      tr.className = 'subtotal-hoja';
      var html = '<td colspan="' + labelColspan + '">Subtotal de esta hoja</td><td class="num">' + cant + '</td>';
      html += priceCols === 4
        ? '<td class="num">—</td><td class="num">—</td><td class="num">' + fmtMoney(con) + '</td><td class="num">' + fmtMoney(sin) + '</td>'
        : '<td class="num">—</td><td class="num">' + fmtMoney(sin) + '</td>';
      if (hasFecha) html += '<td></td>';
      tr.innerHTML = html;

      rows[rows.length - 1].insertAdjacentElement('afterend', tr);
    }
  }
  Paged.registerHandlers(SubtotalHandler);

  var source = document.getElementById('pagedjs-source');
  var content = source.innerHTML;
  source.remove();

  var previewer = new Paged.Previewer();
  previewer.preview(content, [window.__faltantesPrintCss], document.body).then(function () {
    window.print();
  });
})();
`

// Genera e imprime el listado en un iframe aislado con Paged.js: subtotal real
// por hoja, total final único y numeración de página propia.
function imprimirPaginado(bodyHtml: string, css: string) {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:0;opacity:0;'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) { document.body.removeChild(iframe); return }

  const win = iframe.contentWindow as Window & { __faltantesPrintCss?: Record<string, string> }
  win.__faltantesPrintCss = { 'faltantes-print.css': css }

  const html = `<!DOCTYPE html><html><head><title>Productos faltantes</title></head><body>
<div id="pagedjs-source" style="display:none">${bodyHtml}</div>
<script src="/vendor/pagedjs/paged.umd.js"><\/script>
<script>${PAGEDJS_HANDLER_SCRIPT}<\/script>
</body></html>`

  doc.open(); doc.write(html); doc.close()

  const cleanup = () => {
    if (iframe.parentNode) document.body.removeChild(iframe)
    win.removeEventListener('afterprint', cleanup)
  }
  win.addEventListener('afterprint', cleanup)
  setTimeout(cleanup, 60000)
}

export function FaltantesModal({ open, onOpenChange }: FaltantesModalProps) {
  const [loading, setLoading] = useState(false)
  const [resumen, setResumen] = useState<FaltantesResumen | null>(null)
  const [vista, setVista] = useState<'detalle' | 'clientes'>('detalle')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [mesFiltro, setMesFiltro] = useState('todos')
  const [showPrintDialog, setShowPrintDialog] = useState(false)
  const [printMostrarGanancia, setPrintMostrarGanancia] = useState(true)
  const [printAlcance, setPrintAlcance] = useState<'todos' | 'mes'>('todos')
  const [printMes, setPrintMes] = useState('todos')
  const [printFormato, setPrintFormato] = useState<'detallado' | 'simple'>('detallado')

  useEffect(() => {
    if (!open) return
    let cancelado = false
    setLoading(true)
    faltantesApi
      .getResumen()
      .then((r) => { if (!cancelado) setResumen(r) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [open])

  useEffect(() => {
    if (!open) {
      setVista('detalle')
      setClienteSeleccionado(null)
      setBusqueda('')
      setMesFiltro('todos')
      setShowPrintDialog(false)
    }
  }, [open])

  const mesesDisponibles = useMemo(() => {
    if (!resumen) return []
    const set = new Set(resumen.items.map((it) => mesKey(it.fecha)).filter(Boolean))
    return [...set].sort().reverse()
  }, [resumen])

  // Ítems filtrados por búsqueda (producto o cliente) y por mes — afectan lista y totales en pantalla.
  const itemsFiltrados = useMemo<FaltanteDetalle[]>(() => {
    if (!resumen) return []
    const q = busqueda.trim().toLowerCase()
    return resumen.items.filter((it) => {
      if (mesFiltro !== 'todos' && mesKey(it.fecha) !== mesFiltro) return false
      if (q && !it.productoNombre.toLowerCase().includes(q) && !it.clienteNombre.toLowerCase().includes(q)) return false
      return true
    })
  }, [resumen, busqueda, mesFiltro])

  const totalesFiltrados = useMemo(() => {
    return itemsFiltrados.reduce(
      (acc, it) => {
        acc.unidades += it.cantidad
        acc.con += it.totalConGanancia
        acc.sin += it.totalSinGanancia
        acc.clientes.add(it.clienteId)
        return acc
      },
      { unidades: 0, con: 0, sin: 0, clientes: new Set<string>() },
    )
  }, [itemsFiltrados])

  const clientesAgrupados = useMemo<ClienteGrupo[]>(() => {
    const mapa = new Map<string, ClienteGrupo>()
    for (const it of itemsFiltrados) {
      const grupo = mapa.get(it.clienteId) ?? {
        clienteId: it.clienteId,
        clienteNombre: it.clienteNombre,
        items: [],
        totalConGanancia: 0,
        totalSinGanancia: 0,
      }
      grupo.items.push(it)
      grupo.totalConGanancia += it.totalConGanancia
      grupo.totalSinGanancia += it.totalSinGanancia
      mapa.set(it.clienteId, grupo)
    }
    return [...mapa.values()].sort((a, b) => b.totalConGanancia - a.totalConGanancia)
  }, [itemsFiltrados])

  const clienteActivo = clientesAgrupados.find((c) => c.clienteId === clienteSeleccionado) ?? null

  const handleAbrirImprimir = () => {
    setPrintAlcance(mesFiltro !== 'todos' ? 'mes' : 'todos')
    setPrintMes(mesFiltro !== 'todos' ? mesFiltro : (mesesDisponibles[0] ?? 'todos'))
    setShowPrintDialog(true)
  }

  const handleImprimir = () => {
    const base = busqueda.trim() ? itemsFiltrados : (resumen?.items ?? [])
    const items = printAlcance === 'mes'
      ? base.filter((it) => mesKey(it.fecha) === printMes)
      : base

    const ordenados = [...items].sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre, 'es') || a.productoNombre.localeCompare(b.productoNombre, 'es'))

    const totalUnidades = ordenados.reduce((s, it) => s + it.cantidad, 0)
    const totalCon = ordenados.reduce((s, it) => s + it.totalConGanancia, 0)
    const totalSin = ordenados.reduce((s, it) => s + it.totalSinGanancia, 0)
    const clientesCount = new Set(ordenados.map((it) => it.clienteId)).size

    const fechaStr = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())
    const esSimple = printFormato === 'simple'
    const alcanceLabel = esSimple
      ? (printAlcance === 'mes' ? `Productos de ${mesLabel(printMes)} sin especificar fecha` : 'Productos sin especificar fecha')
      : (printAlcance === 'mes' ? mesLabel(printMes) : 'Todo el historial')

    let filasPrint: { producto: string; cantidad: number; con: number; sin: number; conUnit: number; sinUnit: number; cliente?: string; fecha?: string; rechazo?: boolean }[]

    if (esSimple) {
      const mapa = new Map<string, { producto: string; cantidad: number; con: number; sin: number; conUnit: number; sinUnit: number }>()
      for (const it of ordenados) {
        const key = it.productoId || it.productoNombre
        const g = mapa.get(key) ?? { producto: it.productoNombre, cantidad: 0, con: 0, sin: 0, conUnit: it.precioUnitarioConGanancia, sinUnit: it.precioUnitarioSinGanancia }
        g.cantidad += it.cantidad
        g.con += it.totalConGanancia
        g.sin += it.totalSinGanancia
        mapa.set(key, g)
      }
      filasPrint = [...mapa.values()].sort((a, b) => b.cantidad - a.cantidad)
    } else {
      filasPrint = ordenados.map((it) => ({
        producto: it.productoNombre, cantidad: it.cantidad, con: it.totalConGanancia, sin: it.totalSinGanancia,
        conUnit: it.precioUnitarioConGanancia, sinUnit: it.precioUnitarioSinGanancia,
        cliente: it.clienteNombre, fecha: it.fecha, rechazo: it.motivo === 'no_quiso',
      }))
    }

    const cabezaExtra = esSimple ? '' : '<th>Cliente</th>'
    const colaExtra = esSimple ? '' : '<th class="num">Fecha</th>'
    const cols = printMostrarGanancia
      ? '<th class="num">Precio c/gan.</th><th class="num">Precio s/gan.</th><th class="num">Total c/gan.</th><th class="num">Total s/gan.</th>'
      : '<th class="num">Precio</th><th class="num">Total</th>'

    // data-cant/con/sin: valores crudos que usa el handler de Paged.js para
    // calcular el subtotal real de cada hoja impresa (no el total general).
    const rows = filasPrint.map((f) => {
      const precios = printMostrarGanancia
        ? `<td class="num">${formatCurrency(f.conUnit)}</td><td class="num">${formatCurrency(f.sinUnit)}</td><td class="num">${formatCurrency(f.con)}</td><td class="num">${formatCurrency(f.sin)}</td>`
        : `<td class="num">${formatCurrency(f.sinUnit)}</td><td class="num">${formatCurrency(f.sin)}</td>`
      const clienteCol = esSimple ? '' : `<td>${escHtml(f.cliente ?? '')}</td>`
      const fechaCol = esSimple ? '' : `<td class="num">${formatDateShort(f.fecha ?? '')}</td>`
      return `<tr data-cant="${f.cantidad}" data-con="${f.con}" data-sin="${f.sin}">${clienteCol}<td>${escHtml(f.producto)}${f.rechazo ? ' (rechazo)' : ''}</td><td class="num">${f.cantidad}</td>${precios}${fechaCol}</tr>`
    }).join('')

    // Total final: fila normal (sin data-cant) para que aparezca una única vez,
    // donde caiga naturalmente al paginar — no se repite en cada hoja.
    const totalFinalCols = printMostrarGanancia
      ? `<td class="num">—</td><td class="num">—</td><td class="num">${formatCurrency(totalCon)}</td><td class="num">${formatCurrency(totalSin)}</td>`
      : `<td class="num">—</td><td class="num">${formatCurrency(totalSin)}</td>`
    const totalFinalColspan = esSimple ? 1 : 2
    const totalFinalRow = `<tr class="total-final"><td colspan="${totalFinalColspan}">TOTAL FINAL</td><td class="num">${totalUnidades}</td>${totalFinalCols}${esSimple ? '' : '<td></td>'}</tr>`

    const labelColspan = esSimple ? 1 : 2
    const priceCols = printMostrarGanancia ? 4 : 2

    const bodyHtml = `
<div class="header"><div><h2>Productos faltantes — Historial en Cuenta Corriente</h2><div style="font-size:11px;color:#6b7280">${escHtml(alcanceLabel)}</div></div><div class="meta"><div style="font-weight:600;color:#1f2937;font-size:13px">${fechaStr}</div><div>${filasPrint.length} ítems · ${totalUnidades} u.${esSimple ? '' : ` · ${clientesCount} cliente(s)`}</div></div></div>
<table data-faltantes-print="1" data-label-colspan="${labelColspan}" data-price-cols="${priceCols}" data-has-fecha="${esSimple ? '0' : '1'}">
<thead><tr>${cabezaExtra}<th>Producto</th><th class="num">Cant.</th>${cols}${colaExtra}</tr></thead>
<tbody>${rows}${totalFinalRow}</tbody>
</table>`

    const css = `
@page { size: A4 landscape; margin: 10mm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 9px; color: #6b7280; } }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, Arial, sans-serif; color: #1f2937; font-size: 11px; }
.header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1f2937; padding-bottom: 8px; margin-bottom: 12px; }
.header h2 { font-size: 18px; }
.header .meta { text-align: right; font-size: 11px; color: #6b7280; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #d1d5db; padding: 4px 6px; font-size: 10px; }
thead th { background: #1f4e78; color: #fff; font-weight: 700; text-align: center; }
th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
th.num, td.num { text-align: right; }
tbody tr:nth-child(even) { background: #f9fafb; }
tr.subtotal-hoja td { border-top: 2px solid #1f4e78; background: #eef2f7; font-weight: 700; font-style: italic; }
tr.total-final td { border-top: 3px double #1f4e78; background: #f2f2f2; font-weight: 700; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`

    imprimirPaginado(bodyHtml, css)
    setShowPrintDialog(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl lg:max-w-5xl xl:max-w-6xl max-h-[85vh] flex flex-col rounded-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-8">
            <DialogTitle className="flex items-center gap-2">
              <PackageX className="h-5 w-5 text-destructive" />
              Productos faltantes — Historial en Cuenta Corriente
            </DialogTitle>
            {resumen && resumen.items.length > 0 && (
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 flex-shrink-0" onClick={handleAbrirImprimir}>
                <Printer className="h-3.5 w-3.5" /> Imprimir
              </Button>
            )}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !resumen || resumen.items.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No hay productos faltantes registrados.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <div className="rounded-xl bg-muted/50 p-3 min-w-0">
                <p className="text-[11px] text-muted-foreground">Ítems pendientes</p>
                <p className="text-base sm:text-lg font-bold truncate">{itemsFiltrados.length}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 min-w-0 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" /> Clientes afectados
                  </p>
                  <p className="text-base sm:text-lg font-bold truncate">{totalesFiltrados.clientes.size}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] flex-shrink-0"
                  onClick={() => { setVista('clientes'); setClienteSeleccionado(null); }}
                >
                  Ver
                </Button>
              </div>
              <div className="rounded-xl bg-success/10 p-3 min-w-0">
                <p className="text-[11px] text-muted-foreground">Total con % ganancia</p>
                <p className="text-sm sm:text-base font-bold text-success truncate">{formatCurrency(totalesFiltrados.con)}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 min-w-0">
                <p className="text-[11px] text-muted-foreground">Total sin % ganancia</p>
                <p className="text-sm sm:text-base font-bold truncate">{formatCurrency(totalesFiltrados.sin)}</p>
              </div>
            </div>

            {/* Buscador + filtro por mes */}
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar producto o cliente..."
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <Select value={mesFiltro} onValueChange={setMesFiltro}>
                <SelectTrigger className="h-8 w-full sm:w-44 text-sm">
                  <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los meses</SelectItem>
                  {mesesDisponibles.map((m) => (
                    <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {itemsFiltrados.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No hay resultados para los filtros aplicados.
              </div>
            ) : (
              <>
                {vista === 'detalle' && (
                  <div className="flex-1 overflow-y-auto mt-2 -mx-1 px-1">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background">
                        <tr className="text-left text-xs text-muted-foreground border-b border-border">
                          <th className="py-2 pr-2 font-medium">Cliente</th>
                          <th className="py-2 pr-2 font-medium">Producto</th>
                          <th className="py-2 pr-2 font-medium text-right">Cant.</th>
                          <th className="py-2 pr-2 font-medium text-right">Con gan.</th>
                          <th className="py-2 pr-2 font-medium text-right">Sin gan.</th>
                          <th className="py-2 pr-2 font-medium text-right">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsFiltrados.map((it) => (
                          <tr key={it.id} className="border-b border-border/50 last:border-0">
                            <td className="py-1.5 pr-2 truncate max-w-[140px]">{it.clienteNombre}</td>
                            <td className="py-1.5 pr-2 truncate max-w-[180px]">
                              {it.productoNombre}
                              {it.motivo === 'no_quiso' && (
                                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">Rechazo</Badge>
                              )}
                            </td>
                            <td className="py-1.5 pr-2 text-right">{it.cantidad}</td>
                            <td className="py-1.5 pr-2 text-right whitespace-nowrap">{formatCurrency(it.totalConGanancia)}</td>
                            <td className="py-1.5 pr-2 text-right whitespace-nowrap text-muted-foreground">{formatCurrency(it.totalSinGanancia)}</td>
                            <td className="py-1.5 pr-2 text-right whitespace-nowrap text-muted-foreground">{formatDateShort(it.fecha)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {vista === 'clientes' && !clienteActivo && (
                  <div className="flex-1 overflow-y-auto mt-2 -mx-1 px-1">
                    <div className="flex items-center justify-between mb-2">
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setVista('detalle')}>
                        <ArrowLeft className="h-3.5 w-3.5" /> Volver al detalle
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      {clientesAgrupados.map((c) => (
                        <button
                          key={c.clienteId}
                          type="button"
                          onClick={() => setClienteSeleccionado(c.clienteId)}
                          className="w-full flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 transition-colors p-3 text-left"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{c.clienteNombre}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {c.items.length} producto(s) · {c.items.reduce((s, it) => s + it.cantidad, 0)} unidad(es)
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-sm font-bold text-success whitespace-nowrap">{formatCurrency(c.totalConGanancia)}</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {vista === 'clientes' && clienteActivo && (
                  <div className="flex-1 overflow-y-auto mt-2 -mx-1 px-1">
                    <div className="flex items-center justify-between mb-2">
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1" onClick={() => setClienteSeleccionado(null)}>
                        <ArrowLeft className="h-3.5 w-3.5" /> {clienteActivo.clienteNombre}
                      </Button>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background">
                        <tr className="text-left text-xs text-muted-foreground border-b border-border">
                          <th className="py-2 pr-2 font-medium">Producto</th>
                          <th className="py-2 pr-2 font-medium text-right">Cant.</th>
                          <th className="py-2 pr-2 font-medium text-right">Con gan.</th>
                          <th className="py-2 pr-2 font-medium text-right">Sin gan.</th>
                          <th className="py-2 pr-2 font-medium text-right">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clienteActivo.items.map((it) => (
                          <tr key={it.id} className="border-b border-border/50 last:border-0">
                            <td className="py-1.5 pr-2 truncate max-w-[220px]">
                              {it.productoNombre}
                              {it.motivo === 'no_quiso' && (
                                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">Rechazo</Badge>
                              )}
                            </td>
                            <td className="py-1.5 pr-2 text-right">{it.cantidad}</td>
                            <td className="py-1.5 pr-2 text-right whitespace-nowrap">{formatCurrency(it.totalConGanancia)}</td>
                            <td className="py-1.5 pr-2 text-right whitespace-nowrap text-muted-foreground">{formatCurrency(it.totalSinGanancia)}</td>
                            <td className="py-1.5 pr-2 text-right whitespace-nowrap text-muted-foreground">{formatDateShort(it.fecha)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border font-semibold">
                          <td className="py-1.5 pr-2">Total</td>
                          <td className="py-1.5 pr-2 text-right">{clienteActivo.items.reduce((s, it) => s + it.cantidad, 0)}</td>
                          <td className="py-1.5 pr-2 text-right whitespace-nowrap text-success">{formatCurrency(clienteActivo.totalConGanancia)}</td>
                          <td className="py-1.5 pr-2 text-right whitespace-nowrap text-muted-foreground">{formatCurrency(clienteActivo.totalSinGanancia)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </DialogContent>

      {/* Diálogo de opciones de impresión */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Printer className="h-4 w-4" /> Opciones de impresión
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <Checkbox
                checked={printMostrarGanancia}
                onCheckedChange={(v) => setPrintMostrarGanancia(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm">
                Mostrar el % de ganancia
                <span className="block text-xs text-muted-foreground">Si es para mostrar al mayorista, no es necesario.</span>
              </span>
            </label>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Formato</p>
              <Select value={printFormato} onValueChange={(v) => setPrintFormato(v as 'detallado' | 'simple')}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="detallado">Detallado (cliente, producto y fecha)</SelectItem>
                  <SelectItem value="simple">Solo producto y cantidad</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Alcance</p>
              <Select value={printAlcance} onValueChange={(v) => setPrintAlcance(v as 'todos' | 'mes')}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="mes">Por mes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {printAlcance === 'mes' && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Mes</p>
                <Select value={printMes} onValueChange={setPrintMes}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mesesDisponibles.map((m) => (
                      <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {busqueda.trim() && (
              <p className="text-[11px] text-muted-foreground">
                Se imprimirán los resultados de la búsqueda "{busqueda.trim()}".
              </p>
            )}

            <Button type="button" className="w-full" onClick={handleImprimir}>
              <Printer className="h-4 w-4 mr-1.5" /> Imprimir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
