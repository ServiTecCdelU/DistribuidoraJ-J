'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DataTableSkeleton } from '@/components/ui/data-table-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cobranzasApi, clientsApi, paymentsApi, sellersApi, mayoristaCuentaApi, salesApi, faltantesApi, devolucionesApi } from '@/lib/api'
import type { TransaccionMayorista } from '@/services/mayorista-cuenta-service'
import type { Faltante } from '@/services/faltantes-service'
import type { Devolucion } from '@/services/devoluciones-service'
import { useAuth } from '@/hooks/use-auth'
import type { Client, ComprobantePago, DebtClassification, Sale, Seller, Transaction } from '@/lib/types'
import { MovimientoDeudaCard } from '@/components/cuenta-corriente/movimiento-deuda-card'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import {
  Users, FileCheck, CheckCircle2, XCircle, Clock, Loader2, ExternalLink,
  ChevronLeft, DollarSign, ArrowDownCircle, ArrowUpCircle, Search, X,
  Banknote, CreditCard, Image as ImageIcon, AlertTriangle, Ban, Printer,
  History, RotateCcw, Tag,
} from 'lucide-react'
import { toast } from 'sonner'

type ClientWithSeller = Client & { sellerName?: string }

export default function CuentaCorrientePage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'clientes' | 'mayorista'>('clientes')
  const [debtClients, setDebtClients] = useState<ClientWithSeller[]>([])
  const [comprobantes, setComprobantes] = useState<ComprobantePago[]>([])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSeller, setFilterSeller] = useState<string>('all')
  // Día de visita/cobro asignado al cliente ('all' = todos)
  const [filterDiaCobro, setFilterDiaCobro] = useState<string>('all')
  const [filterClassification, setFilterClassification] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Cliente seleccionado
  const [selectedClient, setSelectedClient] = useState<ClientWithSeller | null>(null)
  const [clientTransactions, setClientTransactions] = useState<Transaction[]>([])
  const [clientSales, setClientSales] = useState<Sale[]>([])
  const [clientComprobantes, setClientComprobantes] = useState<ComprobantePago[]>([])
  const [clientFaltantes, setClientFaltantes] = useState<Faltante[]>([])
  const [clientDevoluciones, setClientDevoluciones] = useState<Devolucion[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)

  // Dialog states
  const [approveDialog, setApproveDialog] = useState<ComprobantePago | null>(null)
  const [rejectDialog, setRejectDialog] = useState<ComprobantePago | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState(false)

  // Registrar pago manual (minorista)
  const [payDialog, setPayDialog] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<string>('efectivo')
  const [payNotes, setPayNotes] = useState('')
  // Imputación: id de la transacción de deuda (remito/venta) elegida, '' = FIFO
  const [payDebtId, setPayDebtId] = useState('')

  // Registrar pago manual (mayorista)
  const [payMayoristaDialog, setPayMayoristaDialog] = useState(false)
  const [payMayoristaAmount, setPayMayoristaAmount] = useState('')
  const [payMayoristaMethod, setPayMayoristaMethod] = useState<string>('efectivo')
  const [payMayoristaNotes, setPayMayoristaNotes] = useState('')

  // Paginación lista deudores
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  // Mayorista — deuda con proveedor
  const [mayTxs, setMayTxs] = useState<TransaccionMayorista[]>([])
  const [mayBalance, setMayBalance] = useState(0)
  // Distribución activa (1 o 2): el proveedor tiene dos cuentas que se pagan por separado
  const [mayDist, setMayDist] = useState<1 | 2>(1)
  const [mayDeudaDialog, setMayDeudaDialog] = useState(false)
  const [mayPagoDialog, setMayPagoDialog] = useState(false)
  const [mayAmount, setMayAmount] = useState('')
  const [mayDesc, setMayDesc] = useState('')
  const [mayBoleta, setMayBoleta] = useState('')
  const [mayDate, setMayDate] = useState('')
  const [mayProcessing, setMayProcessing] = useState(false)

  // Movimientos y balance de la distribución activa
  const mayTxsDist = useMemo(() => mayTxs.filter((t) => t.distribucion === mayDist), [mayTxs, mayDist])
  const mayBalanceDist = useMemo(
    () => mayTxsDist.reduce((acc, tx) => (tx.type === 'debt' ? acc + tx.amount : acc - tx.amount), 0),
    [mayTxsDist]
  )

  // Preview imagen comprobante
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [clientsData, compData, sellersData] = await Promise.all([
        cobranzasApi.getDebtClients(),
        cobranzasApi.getComprobantes(),
        sellersApi.getAll(),
      ])
      setDebtClients(clientsData)
      setComprobantes(compData)
      setSellers(sellersData.filter((s) => s.isActive))
    } catch { /* silenciado */ }

    // Mayorista aparte para que no rompa la carga principal
    try {
      const mayTxsData = await mayoristaCuentaApi.getTransacciones()
      setMayTxs(mayTxsData)
      const bal = mayTxsData.reduce((acc, tx) => tx.type === 'debt' ? acc + tx.amount : acc - tx.amount, 0)
      setMayBalance(bal)
    } catch (err) {
      console.error('[cuenta-corriente] Error cargando mayorista:', err)
    }

    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const totalDeuda = debtClients.reduce((acc, c) => acc + c.currentBalance, 0)
  const pendingComprobantes = comprobantes.filter((c) => c.status === 'pending')

  const filteredClients = debtClients.filter((c) => {
    const matchesSeller = filterSeller === 'all' || c.sellerId === filterSeller
    const matchesSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesClassification = filterClassification === 'all' || (c.debtClassification ?? 'normal') === filterClassification
    const matchesDia = filterDiaCobro === 'all' || (c.diaCobro ?? '') === filterDiaCobro
    return matchesSeller && matchesSearch && matchesClassification && matchesDia
  })

  const totalPages = Math.ceil(filteredClients.length / PAGE_SIZE)
  const paginatedClients = filteredClients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Reset página al cambiar filtros
  useEffect(() => { setCurrentPage(1) }, [searchQuery, filterSeller, filterClassification, filterDiaCobro])

  // Seleccionar cliente → cargar detalle
  const handleSelectClient = async (client: ClientWithSeller) => {
    setSelectedClient(client)
    setLoadingDetail(true)
    try {
      const [txs, comps, sales, faltantes, devols] = await Promise.all([
        clientsApi.getTransactions(client.id),
        cobranzasApi.getComprobantes(),
        salesApi.getByClient(client.id),
        faltantesApi.getByCliente(client.id),
        devolucionesApi.getByClient(client.id),
      ])
      setClientTransactions(txs)
      setClientSales(sales)
      setClientComprobantes(comps.filter((c) => c.clientId === client.id))
      setClientFaltantes(faltantes)
      setClientDevoluciones(devols)
    } catch {
      toast.error('Error al cargar detalle del cliente')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleApprove = async (comp: ComprobantePago) => {
    if (!user) return
    setProcessing(true)
    try {
      const updated = await cobranzasApi.approveComprobante(comp.id, user.name || user.email)
      // Actualizar comprobantes globales y del cliente
      setComprobantes((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      setClientComprobantes((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      // Actualizar deuda
      setDebtClients((prev) =>
        prev.map((c) =>
          c.id === comp.clientId
            ? { ...c, currentBalance: Math.max(0, c.currentBalance - comp.amount) }
            : c
        )
      )
      if (selectedClient && selectedClient.id === comp.clientId) {
        setSelectedClient((prev) =>
          prev ? { ...prev, currentBalance: Math.max(0, prev.currentBalance - comp.amount) } : prev
        )
        // Refrescar transacciones
        const txs = await clientsApi.getTransactions(comp.clientId)
        setClientTransactions(txs)
      }
      setApproveDialog(null)
      toast.success('Comprobante aprobado — pago registrado')
    } catch (err: any) {
      toast.error(err.message || 'Error al aprobar')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!rejectDialog || !rejectReason || !user) return
    setProcessing(true)
    try {
      const updated = await cobranzasApi.rejectComprobante(rejectDialog.id, rejectReason, user.name || user.email)
      setComprobantes((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      setClientComprobantes((prev) => prev.map((c) => c.id === updated.id ? updated : c))
      setRejectDialog(null)
      setRejectReason('')
      toast.success('Comprobante rechazado')
    } catch (err: any) {
      toast.error(err.message || 'Error al rechazar')
    } finally {
      setProcessing(false)
    }
  }

  // Genera el PDF del recibo numerado, lo guarda en la transacción y lo descarga
  const emitirRecibo = async (tx: Transaction, saldoAnterior: number, metodo: string) => {
    try {
      const { generarReciboPago } = await import('@/hooks/useGenerarPdf')
      const base64 = await generarReciboPago({
        reciboNumero: tx.reciboNumero || tx.id,
        fecha: new Date(),
        clientName: selectedClient?.name,
        clientAddress: selectedClient?.address,
        clientPhone: selectedClient?.phone,
        monto: tx.amount,
        metodo,
        saldoAnterior,
        saldoNuevo: Math.max(0, saldoAnterior - tx.amount),
      })
      await paymentsApi.saveReciboPdf(tx.id, base64)
      const link = document.createElement('a')
      link.href = `data:application/pdf;base64,${base64}`
      link.download = `recibo-${tx.reciboNumero || tx.id}.pdf`
      link.click()
    } catch {
      toast.info('Pago registrado — el recibo no pudo generarse')
    }
  }

  // Registrar pago manual (efectivo, etc)
  const handleRegisterPayment = async () => {
    if (!selectedClient || !payAmount || !user) return
    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Ingresá un monto válido')
      return
    }
    if (amount > selectedClient.currentBalance) {
      toast.error('El monto no puede superar la deuda actual')
      return
    }
    setProcessing(true)
    try {
      const methods: Record<string, string> = {
        efectivo: 'Pago en efectivo',
        transferencia: 'Pago por transferencia bancaria',
        otro: 'Pago registrado manualmente',
      }
      // Referencia al remito imputado en la descripción del pago
      const deudaImputada = payDebtId ? clientTransactions.find((t) => t.id === payDebtId) : undefined
      const saleImputada = deudaImputada?.saleId ? clientSales.find((s) => s.id === deudaImputada.saleId) : undefined
      const refImputacion = deudaImputada
        ? ` (${saleImputada?.remitoNumber ? `Remito ${saleImputada.remitoNumber}` : deudaImputada.description})`
        : ''
      const desc = `${payNotes
        ? `${methods[payMethod] || methods.otro} — ${payNotes}`
        : methods[payMethod] || methods.otro}${refImputacion}`

      const txPago = await paymentsApi.registerCashPayment({
        clientId: selectedClient.id,
        amount,
        description: desc,
        debtTxId: payDebtId || undefined,
      })

      // Recibo numerado: generar PDF, guardarlo y descargarlo
      await emitirRecibo(txPago, selectedClient.currentBalance, methods[payMethod] || methods.otro)

      // Actualizar estado local
      const newBalance = Math.max(0, selectedClient.currentBalance - amount)
      setSelectedClient((prev) => prev ? { ...prev, currentBalance: newBalance } : prev)
      setDebtClients((prev) =>
        prev.map((c) =>
          c.id === selectedClient.id ? { ...c, currentBalance: newBalance } : c
        )
      )
      // Refrescar transacciones
      const txs = await clientsApi.getTransactions(selectedClient.id)
      setClientTransactions(txs)

      setPayDialog(false)
      setPayAmount('')
      setPayMethod('efectivo')
      setPayNotes('')
      setPayDebtId('')
      toast.success(`Pago de ${formatCurrency(amount)} registrado`)
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar pago')
    } finally {
      setProcessing(false)
    }
  }

  // Mayorista proveedor — cargar deuda
  const handleMayAddDeuda = async () => {
    const amount = parseFloat(mayAmount)
    if (isNaN(amount) || amount <= 0) { toast.error('Ingresá un monto válido'); return }
    setMayProcessing(true)
    try {
      const tx = await mayoristaCuentaApi.addDeuda({
        amount,
        distribucion: mayDist,
        description: mayDesc || undefined,
        boleta: mayBoleta || undefined,
        date: mayDate || undefined,
      })
      setMayTxs((prev) => [tx, ...prev])
      setMayBalance((prev) => prev + amount)
      setMayDeudaDialog(false)
      setMayAmount('')
      setMayDesc('')
      setMayBoleta('')
      setMayDate('')
      toast.success(`Deuda de ${formatCurrency(amount)} registrada`)
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar deuda')
    } finally { setMayProcessing(false) }
  }

  // Mayorista proveedor — registrar pago a boleta específica
  const [maySelectedDebt, setMaySelectedDebt] = useState<TransaccionMayorista | null>(null)

  const handleMayPagarBoleta = async () => {
    if (!maySelectedDebt) return
    const amount = parseFloat(mayAmount)
    if (isNaN(amount) || amount <= 0) { toast.error('Ingresá un monto válido'); return }
    const saldo = maySelectedDebt.saldo ?? 0
    if (amount > saldo) { toast.error('El monto no puede superar el saldo de la boleta'); return }
    setMayProcessing(true)
    try {
      const tx = await mayoristaCuentaApi.pagarBoleta({ debtId: maySelectedDebt.id, amount, description: mayDesc || undefined })
      // Actualizar saldo de la boleta en la lista local
      setMayTxs((prev) => {
        const updated = prev.map((t) =>
          t.id === maySelectedDebt.id ? { ...t, saldo: Math.max(0, (t.saldo ?? 0) - amount) } : t
        )
        return [tx, ...updated]
      })
      setMayBalance((prev) => prev - amount)
      setMayPagoDialog(false)
      setMaySelectedDebt(null)
      setMayAmount('')
      setMayDesc('')
      toast.success(`Pago de ${formatCurrency(amount)} registrado`)
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar pago')
    } finally { setMayProcessing(false) }
  }

  const handleRegisterMayoristaPayment = async () => {
    if (!selectedClient || !payMayoristaAmount || !user) return
    const amount = parseFloat(payMayoristaAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Ingresá un monto válido')
      return
    }
    const balanceMayorista = selectedClient.currentBalanceMayorista ?? 0
    if (amount > balanceMayorista) {
      toast.error('El monto no puede superar la deuda mayorista actual')
      return
    }
    setProcessing(true)
    try {
      const methods: Record<string, string> = {
        efectivo: 'Pago en efectivo',
        transferencia: 'Pago por transferencia bancaria',
        otro: 'Pago registrado manualmente',
      }
      const desc = payMayoristaNotes
        ? `${methods[payMayoristaMethod] || methods.otro} — ${payMayoristaNotes}`
        : methods[payMayoristaMethod] || methods.otro

      const txPagoMay = await paymentsApi.registerMayoristaPayment({
        clientId: selectedClient.id,
        amount,
        description: desc,
      })

      await emitirRecibo(txPagoMay, balanceMayorista, methods[payMayoristaMethod] || methods.otro)

      const newBalance = Math.max(0, balanceMayorista - amount)
      setSelectedClient((prev) => prev ? { ...prev, currentBalanceMayorista: newBalance } : prev)
      setDebtClients((prev) =>
        prev.map((c) =>
          c.id === selectedClient.id ? { ...c, currentBalanceMayorista: newBalance } : c
        )
      )
      const txs = await clientsApi.getTransactions(selectedClient.id)
      setClientTransactions(txs)

      setPayMayoristaDialog(false)
      setPayMayoristaAmount('')
      setPayMayoristaMethod('efectivo')
      setPayMayoristaNotes('')
      toast.success(`Pago mayorista de ${formatCurrency(amount)} registrado`)
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar pago mayorista')
    } finally {
      setProcessing(false)
    }
  }

  // Cambiar clasificación de deuda
  const handleChangeClassification = async (clientId: string, classification: DebtClassification) => {
    try {
      await clientsApi.update(clientId, { debtClassification: classification })
      setDebtClients((prev) =>
        prev.map((c) => c.id === clientId ? { ...c, debtClassification: classification } : c)
      )
      if (selectedClient?.id === clientId) {
        setSelectedClient((prev) => prev ? { ...prev, debtClassification: classification } : prev)
      }
      const labels: Record<DebtClassification, string> = { normal: 'Normal', moroso: 'Moroso', incobrable: 'Incobrable' }
      toast.success(`Clasificación cambiada a ${labels[classification]}`)
    } catch {
      toast.error('Error al cambiar clasificación')
    }
  }

  // Imprimir listado de cobranza del vendedor filtrado
  const handlePrintCobranza = () => {
    const conDeuda = filteredClients.filter((c) => c.currentBalance > 0)
    if (conDeuda.length === 0) {
      toast.error('No hay clientes con deuda para imprimir')
      return
    }
    const vendedorName = sellers.find((s) => s.id === filterSeller)?.name || conDeuda[0].sellerName || 'Vendedor'
    const total = conDeuda.reduce((acc, c) => acc + c.currentBalance, 0)
    const now = new Date()
    const dateStr = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }).format(now)

    const rows = conDeuda.map((c, i) => {
      const cod = c.codigo ? ` <span class="cod">(${c.codigo})</span>` : ''
      return `<tr>
        <td class="center">${i + 1}</td>
        <td><b>${c.name}</b>${cod}</td>
        <td class="right deuda">${formatCurrency(c.currentBalance)}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><title>Cobranza ${vendedorName}</title><style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:-apple-system,sans-serif;padding:24px;font-size:13px;color:#1f2937}
.header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #1f2937}
.header h2{font-size:18px;line-height:1.2}
.header .vend{font-size:13px;font-weight:600;color:#0d9488;margin-top:2px}
.header .meta{text-align:right;font-size:11px;color:#6b7280}
table{width:100%;border-collapse:collapse}
th,td{padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:top}
th{font-size:10px;font-weight:700;color:#6b7280;background:#f9fafb;border-bottom:1px solid #e5e7eb;text-transform:uppercase;letter-spacing:.05em}
td.right,th.right{text-align:right}
td.center,th.center{text-align:center}
.deuda{font-weight:700;color:#dc2626;white-space:nowrap}
.cod{font-size:11px;color:#6b7280;font-weight:400}
.tfoot td{border-top:2px solid #d1d5db;background:#f3f4f6;font-weight:800;font-size:14px}
.footer{margin-top:18px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px}
tr{page-break-inside:avoid}
@media print{body{padding:16px}}
</style></head><body>
<div class="header">
  <div><h2>Listado de Cobranza</h2><div class="vend">${vendedorName}</div></div>
  <div class="meta"><div style="font-weight:600;color:#1f2937;font-size:13px">${dateStr}</div><div>${conDeuda.length} clientes</div></div>
</div>
<table>
<thead><tr><th class="center">#</th><th>Cliente</th><th class="right">Deuda</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr class="tfoot"><td></td><td>TOTAL A COBRAR</td><td class="right deuda">${formatCurrency(total)}</td></tr></tfoot>
</table>
<div class="footer">Generado el ${new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(now)}</div>
</body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:0;opacity:0;'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) { document.body.removeChild(iframe); return }
    doc.open(); doc.write(html); doc.close()
    iframe.onload = () => {
      iframe.contentWindow?.print()
      setTimeout(() => document.body.removeChild(iframe), 1000)
    }
  }

  const handleRegenerarRemito = async (sale: Sale) => {
    if (!sale.remitoNumber) { toast.error('La venta no tiene número de remito'); return }
    try {
      const { generarPdfCliente } = await import('@/hooks/useGenerarPdf')
      const noEntregados = (sale.itemsNoEntregados || [])
        .filter((it) => it.motivo === 'no_quiso')
        .map((it) => ({
          name: `${it.name} (NO ENT.)`,
          quantity: it.quantity,
          price: 0,
          codigo: it.codigo || '',
          ...(it.itemDiscount ? { itemDiscount: it.itemDiscount } : {}),
        }))
      const remitoData = {
        id: sale.id,
        clientName: sale.clientName,
        sellerName: sale.sellerName,
        items: [
          ...sale.items.map((it) => ({
            name: it.name,
            quantity: it.quantity,
            price: it.price,
            codigo: it.codigo || '',
            ...(it.itemDiscount ? { itemDiscount: it.itemDiscount } : {}),
          })),
          ...noEntregados,
        ],
        total: sale.total,
        discount: sale.discount,
        discountType: sale.discountType,
        paymentType: 'cash' as const,
        createdAt: sale.createdAt,
        deliveryAddress: sale.deliveryAddress,
        remitoNumber: sale.remitoNumber,
      }
      const newPdf = await generarPdfCliente(remitoData, 'remito')
      await salesApi.saveRemitoToSale(sale.id, sale.remitoNumber, newPdf)
      // Refrescar ventas del cliente para que el botón "Descargar remito" tenga el nuevo base64
      const updatedSales = await salesApi.getByClient(selectedClient!.id)
      setClientSales(updatedSales)
      toast.success(`Remito ${sale.remitoNumber} regenerado`)
    } catch (err: any) {
      toast.error(err.message || 'Error al regenerar remito')
    }
  }

  // Vista detalle de cliente
  if (selectedClient) {
    const clientPending = clientComprobantes.filter((c) => c.status === 'pending')
    const clientHistory = clientComprobantes.filter((c) => c.status !== 'pending')
    const txMinorista = clientTransactions.filter((tx) => !tx.cuenta || tx.cuenta === 'minorista')
    const txMayorista = clientTransactions.filter((tx) => tx.cuenta === 'mayorista')
    const balanceMayorista = selectedClient.currentBalanceMayorista ?? 0
    const salesById = new Map(clientSales.map((s) => [s.id, s]))
    // Deudas (remitos/ventas) con saldo pendiente, para imputar pagos
    const deudasPendientes = txMinorista
      .filter((tx) => tx.type === 'debt' && tx.saldo != null && tx.saldo > 0)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
    const etiquetaDeuda = (tx: Transaction) => {
      const sale = tx.saleId ? salesById.get(tx.saleId) : undefined
      const ref = sale?.remitoNumber ? `Remito ${sale.remitoNumber}` : tx.description
      return `${ref} — saldo ${formatCurrency(tx.saldo ?? 0)}`
    }

    return (
      <MainLayout allowedRoles={['admin']} title="Cuenta Corriente" description="Detalle de cliente">
        {/* Header con botón volver */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setSelectedClient(null)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold truncate">{selectedClient.name}</h2>
            <p className="text-sm text-muted-foreground">{selectedClient.sellerName || 'Sin vendedor asignado'}</p>
          </div>
          <div className="text-right flex gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Minorista</p>
              <p className={`text-lg font-bold ${selectedClient.currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {selectedClient.currentBalance > 0 ? formatCurrency(selectedClient.currentBalance) : 'Cancelada'}
              </p>
            </div>
            {balanceMayorista > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Mayorista</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(balanceMayorista)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Clasificación de deuda */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-muted/50">
          <span className="text-sm font-medium text-muted-foreground">Clasificación:</span>
          <Select
            value={selectedClient.debtClassification ?? 'normal'}
            onValueChange={(val) => handleChangeClassification(selectedClient.id, val as DebtClassification)}
          >
            <SelectTrigger className="w-[160px] h-8 text-sm rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="moroso">Moroso</SelectItem>
              <SelectItem value="incobrable">Incobrable</SelectItem>
            </SelectContent>
          </Select>
          {classificationBadge(selectedClient.debtClassification ?? 'normal')}
        </div>

        {loadingDetail ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Comprobantes pendientes */}
            {clientPending.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  Comprobantes pendientes ({clientPending.length})
                </h3>
                <div className="flex flex-col gap-3">
                  {clientPending.map((c) => (
                    <Card key={c.id} className="border-orange-200 dark:border-orange-800">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold">{formatCurrency(c.amount)}</p>
                              <Badge variant="secondary" className="text-orange-600 bg-orange-50 text-xs">
                                <Clock className="h-3 w-3 mr-1" />Pendiente
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Subido por {c.sellerName || 'vendedor'} · {formatDate(c.createdAt)}
                            </p>
                            {c.notes && <p className="text-xs text-muted-foreground mt-1">{c.notes}</p>}
                          </div>
                          {/* Preview archivo */}
                          {c.fileUrl && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="shrink-0 gap-1 text-xs"
                              onClick={() => setPreviewUrl(c.fileUrl)}
                            >
                              <ImageIcon className="h-3 w-3" />
                              Ver
                            </Button>
                          )}
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            className="flex-1 bg-green-600 hover:bg-green-700 gap-1"
                            onClick={() => setApproveDialog(c)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />Aprobar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1 gap-1"
                            onClick={() => setRejectDialog(c)}
                          >
                            <XCircle className="h-3.5 w-3.5" />Rechazar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* ── CUENTA MINORISTA ── */}
            <div className="rounded-2xl border p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-teal-600" />
                  Cuenta Minorista
                </h3>
                <span className={`text-base font-bold ${selectedClient.currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {selectedClient.currentBalance > 0 ? formatCurrency(selectedClient.currentBalance) : 'Cancelada'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  className="gap-2 rounded-xl"
                  onClick={() => setPayDialog(true)}
                  disabled={selectedClient.currentBalance <= 0}
                >
                  <Banknote className="h-4 w-4" />
                  Registrar pago
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 rounded-xl"
                  onClick={() => setHistorialOpen(true)}
                >
                  <History className="h-4 w-4" />
                  Historial de productos
                </Button>
              </div>

              {txMinorista.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">Sin movimientos</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {txMinorista.map((tx) => {
                    const sale = tx.saleId ? salesById.get(tx.saleId) : undefined
                    const devolsSale = sale
                      ? clientDevoluciones.filter((d) => d.saleId === sale.id)
                      : []
                    return (
                      <MovimientoDeudaCard
                        key={tx.id}
                        tx={tx}
                        sale={sale}
                        devoluciones={devolsSale}
                        onRegenerarRemito={handleRegenerarRemito}
                      />
                    )
                  })}
                </div>
              )}
            </div>


            {/* Comprobantes procesados */}
            {clientHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-muted-foreground" />
                  Comprobantes procesados ({clientHistory.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {clientHistory.map((c) => (
                    <Card key={c.id}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                          c.status === 'approved' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                        }`}>
                          {c.status === 'approved'
                            ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                            : <XCircle className="h-4 w-4 text-red-600" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{formatCurrency(c.amount)}</p>
                            {statusBadge(c.status)}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {c.sellerName} · {formatDate(c.createdAt)}
                            {c.rejectionReason && ` — ${c.rejectionReason}`}
                          </p>
                        </div>
                        {c.fileUrl && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setPreviewUrl(c.fileUrl)}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dialog Aprobar */}
        <Dialog open={!!approveDialog} onOpenChange={(open) => !open && setApproveDialog(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Aprobar comprobante</DialogTitle>
              <DialogDescription>Se registrará el pago y se descontará de la deuda.</DialogDescription>
            </DialogHeader>
            {approveDialog && (
              <div className="space-y-2 text-sm">
                <p><strong>Monto:</strong> {formatCurrency(approveDialog.amount)}</p>
                <p><strong>Vendedor:</strong> {approveDialog.sellerName}</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveDialog(null)}>Cancelar</Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => approveDialog && handleApprove(approveDialog)} disabled={processing}>
                {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Rechazar */}
        <Dialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Rechazar comprobante</DialogTitle>
            </DialogHeader>
            {rejectDialog && (
              <div className="space-y-3">
                <div className="text-sm"><p><strong>Monto:</strong> {formatCurrency(rejectDialog.amount)}</p></div>
                <div>
                  <Label>Motivo del rechazo</Label>
                  <Textarea placeholder="Indicar por qué se rechaza..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setRejectDialog(null); setRejectReason('') }}>Cancelar</Button>
              <Button variant="destructive" onClick={handleReject} disabled={!rejectReason || processing}>
                {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Rechazar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Registrar pago */}
        <Dialog open={payDialog} onOpenChange={(open) => { if (!open) { setPayDialog(false); setPayAmount(''); setPayNotes(''); setPayDebtId(''); } }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Registrar pago</DialogTitle>
              <DialogDescription>
                Deuda actual: {formatCurrency(selectedClient.currentBalance)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {deudasPendientes.length > 0 && (
                <div className="space-y-2">
                  <Label>Imputar a</Label>
                  <Select
                    value={payDebtId || 'fifo'}
                    onValueChange={(v) => {
                      setPayDebtId(v === 'fifo' ? '' : v)
                      if (v !== 'fifo') {
                        const d = deudasPendientes.find((t) => t.id === v)
                        if (d?.saldo) setPayAmount(String(d.saldo))
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fifo">Pago general (más antiguo primero)</SelectItem>
                      {deudasPendientes.map((tx) => (
                        <SelectItem key={tx.id} value={tx.id}>{etiquetaDeuda(tx)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Forma de pago</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Monto</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                  <Input
                    type="number"
                    min="0"
                    max={selectedClient.currentBalance}
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="pl-7"
                    placeholder="0"
                    autoFocus
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setPayAmount(String(selectedClient.currentBalance))}
                >
                  Cancelar toda la deuda ({formatCurrency(selectedClient.currentBalance)})
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Textarea
                  placeholder="Ej: Pagó con billete de $10.000"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayDialog(false)}>Cancelar</Button>
              <Button onClick={handleRegisterPayment} disabled={processing || !payAmount || parseFloat(payAmount) <= 0}>
                {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Registrar pago
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Registrar pago mayorista */}
        <Dialog open={payMayoristaDialog} onOpenChange={(open) => { if (!open) { setPayMayoristaDialog(false); setPayMayoristaAmount(''); setPayMayoristaNotes(''); } }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Registrar pago mayorista</DialogTitle>
              <DialogDescription>
                Deuda mayorista: {formatCurrency(balanceMayorista)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Forma de pago</Label>
                <Select value={payMayoristaMethod} onValueChange={setPayMayoristaMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Monto</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                  <Input
                    type="number"
                    min="0"
                    max={balanceMayorista}
                    step="0.01"
                    value={payMayoristaAmount}
                    onChange={(e) => setPayMayoristaAmount(e.target.value)}
                    className="pl-7"
                    placeholder="0"
                    autoFocus
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setPayMayoristaAmount(String(balanceMayorista))}
                >
                  Cancelar toda la deuda ({formatCurrency(balanceMayorista)})
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Textarea
                  placeholder="Ej: Pagó con transferencia"
                  value={payMayoristaNotes}
                  onChange={(e) => setPayMayoristaNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayMayoristaDialog(false)}>Cancelar</Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                onClick={handleRegisterMayoristaPayment}
                disabled={processing || !payMayoristaAmount || parseFloat(payMayoristaAmount) <= 0}
              >
                {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Registrar pago
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview imagen */}
        <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
          <DialogContent className="sm:max-w-lg p-2">
            <DialogHeader className="sr-only">
              <DialogTitle>Comprobante</DialogTitle>
            </DialogHeader>
            {previewUrl && (
              <div className="flex flex-col items-center gap-2">
                <img src={previewUrl} alt="Comprobante" className="max-h-[70vh] w-auto rounded-lg object-contain" />
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-teal-600 hover:underline inline-flex items-center gap-1">
                  Abrir en nueva pestaña <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal historial de productos: faltantes + devoluciones */}
        <Dialog open={historialOpen} onOpenChange={setHistorialOpen}>
          <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Historial de productos — {selectedClient?.name}
              </DialogTitle>
            </DialogHeader>

            {/* Faltantes / No quiso */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                No entregados / No quiso ({clientFaltantes.length})
              </h4>
              {clientFaltantes.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Sin registros</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {clientFaltantes.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded-lg bg-muted/50">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${
                          f.motivo === 'no_quiso'
                            ? 'text-orange-600 border-orange-300 bg-orange-50'
                            : 'text-amber-600 border-amber-300 bg-amber-50'
                        }`}
                      >
                        {f.motivo === 'no_quiso' ? 'NO QUISO' : 'FALTÓ'}
                      </Badge>
                      <span className="flex-1 min-w-0 truncate font-medium">{f.productoNombre}</span>
                      <span className="tabular-nums text-muted-foreground shrink-0">{f.cantidad} u.</span>
                      <span className="text-muted-foreground shrink-0">{formatDate(new Date(f.fecha))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Devoluciones */}
            <div className="space-y-2 mt-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <RotateCcw className="h-3.5 w-3.5 text-purple-500" />
                Devoluciones ({clientDevoluciones.length})
              </h4>
              {clientDevoluciones.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Sin registros</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {clientDevoluciones.map((dev) => (
                    <div key={dev.id} className="rounded-lg border p-2 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-purple-700">{dev.reciboNumero}</span>
                        <span className="text-muted-foreground">{formatDate(dev.createdAt)}</span>
                        <span className="font-bold tabular-nums text-purple-600">-{formatCurrency(dev.total)}</span>
                      </div>
                      {dev.items.map((it, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-2">
                          <span className="flex-1 truncate">{it.quantity}× {it.name}</span>
                          <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3.5 ${it.destino === 'stock' ? 'text-green-600 border-green-300' : 'text-red-500 border-red-300'}`}>
                            {it.destino === 'stock' ? 'a stock' : 'pérdida'}
                          </Badge>
                        </div>
                      ))}
                      {dev.saleNumber && (
                        <p className="text-[10px] text-muted-foreground pl-2">Venta #{dev.saleNumber}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </MainLayout>
    )
  }

  // Vista principal: listado de deudores
  return (
    <MainLayout allowedRoles={['admin']} title="Cuenta Corriente" description="Gestión de deudas y comprobantes de pago">
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
                <CardContent><Skeleton className="h-7 w-20" /></CardContent>
              </Card>
            ))}
          </div>
          <DataTableSkeleton columns={5} rows={6} />
        </div>
      ) : (
        <>
          {/* Tabs Clientes / Mayorista */}
          <div className="flex gap-2 mb-6">
            <Button
              variant={activeTab === 'clientes' ? 'default' : 'outline'}
              className="rounded-xl gap-2"
              onClick={() => setActiveTab('clientes')}
            >
              <Users className="h-4 w-4" />
              Clientes
            </Button>
            <Button
              variant={activeTab === 'mayorista' ? 'default' : 'outline'}
              className={`rounded-xl gap-2 ${activeTab === 'mayorista' ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
              onClick={() => setActiveTab('mayorista')}
            >
              <DollarSign className="h-4 w-4" />
              Mayorista
              {mayBalance > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] bg-red-100 text-red-700">{formatCurrency(mayBalance)}</Badge>
              )}
            </Button>
          </div>

          {activeTab === 'clientes' && (
          <>
          {/* Cards resumen */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <Card>
              <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Deuda total</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pb-4 px-4">
                <div className="text-xl font-bold text-red-600 truncate">{formatCurrency(totalDeuda)}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{debtClients.length} clientes</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Comprobantes pendientes</CardTitle>
                <Clock className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent className="pb-4 px-4">
                <div className="text-xl font-bold text-orange-500">{pendingComprobantes.length}</div>
                <p className="text-xs text-muted-foreground mt-0.5">por revisar</p>
              </CardContent>
            </Card>
            <Card className="col-span-2 md:col-span-1">
              <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Vendedores activos</CardTitle>
                <FileCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pb-4 px-4">
                <div className="text-xl font-bold">{sellers.length}</div>
                <p className="text-xs text-muted-foreground mt-0.5">con clientes asignados</p>
              </CardContent>
            </Card>
          </div>

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-xl"
              />
              {searchQuery && (
                <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => setSearchQuery('')}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <Select value={filterClassification} onValueChange={setFilterClassification}>
              <SelectTrigger className="w-full sm:w-[170px] rounded-xl">
                <SelectValue placeholder="Clasificación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="moroso">Morosos</SelectItem>
                <SelectItem value="incobrable">Incobrables</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSeller} onValueChange={setFilterSeller}>
              <SelectTrigger className="w-full sm:w-[200px] rounded-xl">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los vendedores</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterDiaCobro} onValueChange={setFilterDiaCobro}>
              <SelectTrigger className="w-full sm:w-[170px] rounded-xl">
                <SelectValue placeholder="Día de cobro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los días</SelectItem>
                <SelectItem value="lunes">Lunes</SelectItem>
                <SelectItem value="martes">Martes</SelectItem>
                <SelectItem value="miercoles">Miércoles</SelectItem>
                <SelectItem value="jueves">Jueves</SelectItem>
                <SelectItem value="viernes">Viernes</SelectItem>
                <SelectItem value="sabado">Sábado</SelectItem>
                <SelectItem value="domingo">Domingo</SelectItem>
              </SelectContent>
            </Select>
            {filterSeller !== 'all' && (
              <Button onClick={handlePrintCobranza} className="rounded-xl gap-2 shrink-0">
                <Printer className="h-4 w-4" />
                Imprimir cobranza
              </Button>
            )}
          </div>

          {/* Lista de clientes con deuda */}
          {filteredClients.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No hay clientes con deuda
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="flex flex-col gap-3 md:hidden">
                {paginatedClients.map((c) => {
                  const clientPending = comprobantes.filter((comp) => comp.clientId === c.id && comp.status === 'pending')
                  return (
                    <Card
                      key={c.id}
                      className="cursor-pointer hover:border-teal-300 transition-colors"
                      onClick={() => handleSelectClient(c)}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">{c.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.sellerName || 'Sin vendedor'}
                              {c.diaCobro && <span className="capitalize text-teal-600"> · {c.diaCobro}</span>}
                            </p>
                            {(c.debtClassification ?? 'normal') !== 'normal' && (
                              <div className="mt-1">{classificationBadge(c.debtClassification!)}</div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            {c.currentBalance > 0 ? (
                              <p className="font-bold text-red-600">{formatCurrency(c.currentBalance)}</p>
                            ) : (
                              <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Cancelada</Badge>
                            )}
                            {clientPending.length > 0 && (
                              <Badge variant="secondary" className="text-orange-600 bg-orange-50 text-[10px] mt-1">
                                {clientPending.length} comprobante{clientPending.length > 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Desktop table */}
              <Card className="hidden md:block">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-right">Deuda</TableHead>

                        <TableHead className="text-center">Estado</TableHead>
                        <TableHead className="text-center">Comprobantes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedClients.map((c) => {
                        const clientPending = comprobantes.filter((comp) => comp.clientId === c.id && comp.status === 'pending')
                        return (
                          <TableRow
                            key={c.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleSelectClient(c)}
                          >
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {c.sellerName || 'Sin asignar'}
                              {c.diaCobro && <span className="capitalize text-teal-600"> · {c.diaCobro}</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              {c.currentBalance > 0 ? (
                                <span className="font-bold text-red-600">{formatCurrency(c.currentBalance)}</span>
                              ) : (
                                <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Cancelada</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {classificationBadge(c.debtClassification ?? 'normal')}
                            </TableCell>
                            <TableCell className="text-center">
                              {clientPending.length > 0 ? (
                                <Badge variant="secondary" className="text-orange-600 bg-orange-50">
                                  <Clock className="h-3 w-3 mr-1" />{clientPending.length}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              {/* Paginación */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="rounded-xl text-xs"
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {currentPage} de {totalPages} ({filteredClients.length} clientes)
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="rounded-xl text-xs"
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </>
          )}
          </>
          )}

          {activeTab === 'mayorista' && (
          <>
          {/* ═══ CUENTA CON MAYORISTA (proveedor) ═══ */}
          <div className="space-y-4">
            {/* Sub-pestañas por distribución (dos cuentas que se pagan por separado) */}
            <div className="flex gap-2">
              {([1, 2] as const).map((d) => {
                const bal = mayTxs
                  .filter((t) => t.distribucion === d)
                  .reduce((acc, tx) => (tx.type === 'debt' ? acc + tx.amount : acc - tx.amount), 0)
                return (
                  <Button
                    key={d}
                    variant={mayDist === d ? 'default' : 'outline'}
                    size="sm"
                    className={`rounded-xl gap-2 ${mayDist === d ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                    onClick={() => setMayDist(d)}
                  >
                    Distribución {d}
                    {bal > 0 && (
                      <Badge variant="secondary" className="text-[10px] bg-red-100 text-red-700">
                        {formatCurrency(bal)}
                      </Badge>
                    )}
                  </Button>
                )
              })}
            </div>

            {/* Balance y botones */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-bold ${mayBalanceDist > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {mayBalanceDist > 0 ? formatCurrency(mayBalanceDist) : 'Sin deuda'}
                </span>
                <span className="text-sm text-muted-foreground">deuda Distribución {mayDist}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  className="gap-2 rounded-xl bg-red-600 hover:bg-red-700"
                  size="sm"
                  onClick={() => {
                    setMayAmount(''); setMayDesc(''); setMayBoleta('')
                    const d = new Date()
                    setMayDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10))
                    setMayDeudaDialog(true)
                  }}
                >
                  <ArrowUpCircle className="h-4 w-4" />
                  Registrar deuda
                </Button>
                <Button
                  className="gap-2 rounded-xl bg-green-600 hover:bg-green-700"
                  size="sm"
                  onClick={() => { setMaySelectedDebt(null); setMayAmount(''); setMayDesc(''); setMayPagoDialog(true) }}
                  disabled={mayBalanceDist <= 0}
                >
                  <ArrowDownCircle className="h-4 w-4" />
                  Registrar pago
                </Button>
              </div>
            </div>

            {mayTxsDist.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin movimientos</p>
            ) : (
              <Card className="p-0">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs py-2">Fecha</TableHead>
                        <TableHead className="text-xs py-2">Descripción</TableHead>
                        <TableHead className="text-xs py-2 text-right">Debe</TableHead>
                        <TableHead className="text-xs py-2 text-right">Haber</TableHead>
                        <TableHead className="text-xs py-2 text-center">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mayTxsDist.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-xs py-2 whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                          <TableCell className="text-xs py-2">{tx.description}</TableCell>
                          <TableCell className="text-xs py-2 text-right font-semibold text-red-600 tabular-nums">
                            {tx.type === 'debt' ? formatCurrency(tx.amount) : ''}
                          </TableCell>
                          <TableCell className="text-xs py-2 text-right font-semibold text-green-600 tabular-nums">
                            {tx.type === 'payment' ? formatCurrency(tx.amount) : ''}
                          </TableCell>
                          <TableCell className="text-xs py-2 text-center">
                            {tx.type === 'debt' ? (
                              (tx.saldo ?? tx.amount) > 0 ? (
                                <Badge variant="secondary" className="text-red-600 bg-red-50 text-[10px] cursor-pointer hover:bg-red-100"
                                  onClick={() => {
                                    setMaySelectedDebt(tx)
                                    setMayAmount(String(tx.saldo ?? tx.amount))
                                    setMayDesc('')
                                    setMayPagoDialog(true)
                                  }}
                                >
                                  Debe {formatCurrency(tx.saldo ?? tx.amount)}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-green-600 bg-green-50 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3 mr-0.5" />Pagado
                                </Badge>
                              )
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Dialog cargar deuda mayorista */}
          <Dialog open={mayDeudaDialog} onOpenChange={(open) => !open && setMayDeudaDialog(false)}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Cargar deuda — Distribución {mayDist}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Fecha</Label>
                  <Input type="date" value={mayDate} onChange={(e) => setMayDate(e.target.value)} className="rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label>Monto</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                    <Input
                      type="number" min="0" step="0.01"
                      value={mayAmount} onChange={(e) => setMayAmount(e.target.value)}
                      className="pl-7" placeholder="0" autoFocus
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Boleta</Label>
                  <Input value={mayBoleta} onChange={(e) => setMayBoleta(e.target.value)} placeholder="N° de boleta" className="rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label>Descripción (opcional)</Label>
                  <Textarea placeholder="Ej: Pedido #123" value={mayDesc} onChange={(e) => setMayDesc(e.target.value)} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMayDeudaDialog(false)}>Cancelar</Button>
                <Button className="bg-red-600 hover:bg-red-700" onClick={handleMayAddDeuda} disabled={mayProcessing || !mayAmount || parseFloat(mayAmount) <= 0}>
                  {mayProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Cargar deuda
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog pago mayorista — selector de boleta */}
          <Dialog open={mayPagoDialog} onOpenChange={(open) => { if (!open) { setMayPagoDialog(false); setMaySelectedDebt(null) } }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Registrar pago a mayorista</DialogTitle>
                <DialogDescription>
                  {maySelectedDebt
                    ? `Boleta: ${maySelectedDebt.description} — Saldo: ${formatCurrency(maySelectedDebt.saldo ?? 0)}`
                    : 'Seleccioná una boleta para pagar'}
                </DialogDescription>
              </DialogHeader>
              {!maySelectedDebt ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {mayTxsDist.filter((tx) => tx.type === 'debt' && (tx.saldo ?? tx.amount) > 0).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No hay boletas pendientes</p>
                  ) : (
                    mayTxsDist.filter((tx) => tx.type === 'debt' && (tx.saldo ?? tx.amount) > 0).map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 rounded-xl border cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          setMaySelectedDebt(tx)
                          setMayAmount(String(tx.saldo ?? tx.amount))
                          setMayDesc('')
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                        </div>
                        <span className="text-sm font-bold text-red-600 shrink-0 ml-3">
                          {formatCurrency(tx.saldo ?? tx.amount)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Monto</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                      <Input
                        type="number" min="0" max={maySelectedDebt.saldo ?? 0} step="0.01"
                        value={mayAmount} onChange={(e) => setMayAmount(e.target.value)}
                        className="pl-7" placeholder="0" autoFocus
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setMayAmount(String(maySelectedDebt.saldo ?? 0))}>
                      Pagar todo ({formatCurrency(maySelectedDebt.saldo ?? 0)})
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Descripción (opcional)</Label>
                    <Textarea placeholder="Ej: Transferencia bancaria" value={mayDesc} onChange={(e) => setMayDesc(e.target.value)} rows={2} />
                  </div>
                </div>
              )}
              <DialogFooter>
                {maySelectedDebt ? (
                  <>
                    <Button variant="outline" onClick={() => setMaySelectedDebt(null)}>Volver</Button>
                    <Button className="bg-green-600 hover:bg-green-700" onClick={handleMayPagarBoleta} disabled={mayProcessing || !mayAmount || parseFloat(mayAmount) <= 0}>
                      {mayProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Registrar pago
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => setMayPagoDialog(false)}>Cerrar</Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
          )}
        </>
      )}
    </MainLayout>
  )
}

function classificationBadge(classification: string) {
  switch (classification) {
    case 'moroso':
      return <Badge variant="secondary" className="text-amber-700 bg-amber-50 text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Moroso</Badge>
    case 'incobrable':
      return <Badge variant="destructive" className="text-xs"><Ban className="h-3 w-3 mr-1" />Incobrable</Badge>
    default:
      return <Badge variant="outline" className="text-xs">Normal</Badge>
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge variant="secondary" className="text-orange-600 bg-orange-50 text-xs"><Clock className="h-3 w-3 mr-1" />Pendiente</Badge>
    case 'approved':
      return <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Aprobado</Badge>
    case 'rejected':
      return <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Rechazado</Badge>
    default:
      return null
  }
}
