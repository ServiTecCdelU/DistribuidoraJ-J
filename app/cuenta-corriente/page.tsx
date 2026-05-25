'use client'

import { useEffect, useState, useCallback } from 'react'
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
import { cobranzasApi, clientsApi, paymentsApi, sellersApi, mayoristaCuentaApi } from '@/lib/api'
import type { TransaccionMayorista } from '@/services/mayorista-cuenta-service'
import { useAuth } from '@/hooks/use-auth'
import type { Client, ComprobantePago, DebtClassification, Seller, Transaction } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import {
  Users, FileCheck, CheckCircle2, XCircle, Clock, Loader2, ExternalLink,
  ChevronLeft, DollarSign, ArrowDownCircle, ArrowUpCircle, Search, X,
  Banknote, CreditCard, Image as ImageIcon, AlertTriangle, Ban,
} from 'lucide-react'
import { toast } from 'sonner'

type ClientWithSeller = Client & { sellerName?: string }

export default function CuentaCorrientePage() {
  const { user } = useAuth()
  const [debtClients, setDebtClients] = useState<ClientWithSeller[]>([])
  const [comprobantes, setComprobantes] = useState<ComprobantePago[]>([])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSeller, setFilterSeller] = useState<string>('all')
  const [filterClassification, setFilterClassification] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Cliente seleccionado
  const [selectedClient, setSelectedClient] = useState<ClientWithSeller | null>(null)
  const [clientTransactions, setClientTransactions] = useState<Transaction[]>([])
  const [clientComprobantes, setClientComprobantes] = useState<ComprobantePago[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

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
  const [mayDeudaDialog, setMayDeudaDialog] = useState(false)
  const [mayPagoDialog, setMayPagoDialog] = useState(false)
  const [mayAmount, setMayAmount] = useState('')
  const [mayDesc, setMayDesc] = useState('')
  const [mayProcessing, setMayProcessing] = useState(false)

  // Preview imagen comprobante
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [clientsData, compData, sellersData, mayTxsData] = await Promise.all([
        cobranzasApi.getDebtClients(),
        cobranzasApi.getComprobantes(),
        sellersApi.getAll(),
        mayoristaCuentaApi.getTransacciones(),
      ])
      setDebtClients(clientsData)
      setComprobantes(compData)
      setSellers(sellersData.filter((s) => s.isActive))
      setMayTxs(mayTxsData)
      const bal = mayTxsData.reduce((acc, tx) => tx.type === 'debt' ? acc + tx.amount : acc - tx.amount, 0)
      setMayBalance(bal)
    } catch { /* silenciado */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const totalDeuda = debtClients.reduce((acc, c) => acc + c.currentBalance, 0)
  const pendingComprobantes = comprobantes.filter((c) => c.status === 'pending')

  const filteredClients = debtClients.filter((c) => {
    const matchesSeller = filterSeller === 'all' || c.sellerId === filterSeller
    const matchesSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesClassification = filterClassification === 'all' || (c.debtClassification ?? 'normal') === filterClassification
    return matchesSeller && matchesSearch && matchesClassification
  })

  const totalPages = Math.ceil(filteredClients.length / PAGE_SIZE)
  const paginatedClients = filteredClients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Reset página al cambiar filtros
  useEffect(() => { setCurrentPage(1) }, [searchQuery, filterSeller, filterClassification])

  // Seleccionar cliente → cargar detalle
  const handleSelectClient = async (client: ClientWithSeller) => {
    setSelectedClient(client)
    setLoadingDetail(true)
    try {
      const [txs, comps] = await Promise.all([
        clientsApi.getTransactions(client.id),
        cobranzasApi.getComprobantes(),
      ])
      setClientTransactions(txs)
      setClientComprobantes(comps.filter((c) => c.clientId === client.id))
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
      const desc = payNotes
        ? `${methods[payMethod] || methods.otro} — ${payNotes}`
        : methods[payMethod] || methods.otro

      await paymentsApi.registerCashPayment({
        clientId: selectedClient.id,
        amount,
        description: desc,
      })

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
      const tx = await mayoristaCuentaApi.addDeuda({ amount, description: mayDesc || undefined })
      setMayTxs((prev) => [tx, ...prev])
      setMayBalance((prev) => prev + amount)
      setMayDeudaDialog(false)
      setMayAmount('')
      setMayDesc('')
      toast.success(`Deuda de ${formatCurrency(amount)} registrada`)
    } catch (err: any) {
      toast.error(err.message || 'Error al registrar deuda')
    } finally { setMayProcessing(false) }
  }

  // Mayorista proveedor — registrar pago
  const handleMayAddPago = async () => {
    const amount = parseFloat(mayAmount)
    if (isNaN(amount) || amount <= 0) { toast.error('Ingresá un monto válido'); return }
    if (amount > mayBalance) { toast.error('El monto no puede superar la deuda actual'); return }
    setMayProcessing(true)
    try {
      const tx = await mayoristaCuentaApi.addPago({ amount, description: mayDesc || undefined })
      setMayTxs((prev) => [tx, ...prev])
      setMayBalance((prev) => prev - amount)
      setMayPagoDialog(false)
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

      await paymentsApi.registerMayoristaPayment({
        clientId: selectedClient.id,
        amount,
        description: desc,
      })

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

  // Vista detalle de cliente
  if (selectedClient) {
    const clientPending = clientComprobantes.filter((c) => c.status === 'pending')
    const clientHistory = clientComprobantes.filter((c) => c.status !== 'pending')
    const txMinorista = clientTransactions.filter((tx) => !tx.cuenta || tx.cuenta === 'minorista')
    const txMayorista = clientTransactions.filter((tx) => tx.cuenta === 'mayorista')
    const balanceMayorista = selectedClient.currentBalanceMayorista ?? 0

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
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-teal-600" />
                  Cuenta Minorista
                </h3>
                <span className={`text-base font-bold ${selectedClient.currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {selectedClient.currentBalance > 0 ? formatCurrency(selectedClient.currentBalance) : 'Cancelada'}
                </span>
              </div>

              <Button
                className="w-full sm:w-auto gap-2 rounded-xl"
                onClick={() => setPayDialog(true)}
                disabled={selectedClient.currentBalance <= 0}
              >
                <Banknote className="h-4 w-4" />
                Registrar pago
              </Button>

              {txMinorista.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">Sin movimientos</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {txMinorista.map((tx) => (
                    <Card key={tx.id}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                          tx.type === 'payment' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                        }`}>
                          {tx.type === 'payment'
                            ? <ArrowDownCircle className="h-4 w-4 text-green-600" />
                            : <ArrowUpCircle className="h-4 w-4 text-red-600" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                        </div>
                        <p className={`font-bold tabular-nums ${tx.type === 'payment' ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.type === 'payment' ? '-' : '+'}{formatCurrency(tx.amount)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* ── CUENTA MAYORISTA ── */}
            <div className="rounded-2xl border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-purple-600" />
                  Cuenta Mayorista
                </h3>
                <span className={`text-base font-bold ${balanceMayorista > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {balanceMayorista > 0 ? formatCurrency(balanceMayorista) : 'Cancelada'}
                </span>
              </div>

              <Button
                className="w-full sm:w-auto gap-2 rounded-xl bg-purple-600 hover:bg-purple-700"
                onClick={() => setPayMayoristaDialog(true)}
                disabled={balanceMayorista <= 0}
              >
                <Banknote className="h-4 w-4" />
                Registrar pago mayorista
              </Button>

              {txMayorista.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">Sin movimientos</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {txMayorista.map((tx) => (
                    <Card key={tx.id}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                          tx.type === 'payment' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                        }`}>
                          {tx.type === 'payment'
                            ? <ArrowDownCircle className="h-4 w-4 text-green-600" />
                            : <ArrowUpCircle className="h-4 w-4 text-red-600" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                        </div>
                        <p className={`font-bold tabular-nums ${tx.type === 'payment' ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.type === 'payment' ? '-' : '+'}{formatCurrency(tx.amount)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
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
        <Dialog open={payDialog} onOpenChange={(open) => { if (!open) { setPayDialog(false); setPayAmount(''); setPayNotes(''); } }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Registrar pago</DialogTitle>
              <DialogDescription>
                Deuda actual: {formatCurrency(selectedClient.currentBalance)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
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
                            <p className="text-xs text-muted-foreground">{c.sellerName || 'Sin vendedor'}</p>
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
                        <TableHead className="text-right">Límite</TableHead>
                        <TableHead className="text-center">% Usado</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                        <TableHead className="text-center">Comprobantes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedClients.map((c) => {
                        const pct = c.creditLimit > 0 ? Math.round((c.currentBalance / c.creditLimit) * 100) : 100
                        const clientPending = comprobantes.filter((comp) => comp.clientId === c.id && comp.status === 'pending')
                        return (
                          <TableRow
                            key={c.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleSelectClient(c)}
                          >
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{c.sellerName || 'Sin asignar'}</TableCell>
                            <TableCell className="text-right">
                              {c.currentBalance > 0 ? (
                                <span className="font-bold text-red-600">{formatCurrency(c.currentBalance)}</span>
                              ) : (
                                <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Cancelada</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(c.creditLimit)}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={c.currentBalance === 0 ? 'outline' : pct >= 90 ? 'destructive' : pct >= 70 ? 'secondary' : 'outline'} className={c.currentBalance === 0 ? 'text-green-600' : ''}>
                                {pct}%
                              </Badge>
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

          {/* ═══ CUENTA CON MAYORISTA (proveedor) ═══ */}
          <div className="mt-8">
            <Card className="rounded-2xl border-purple-200 dark:border-purple-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-purple-600" />
                    Cuenta con Mayorista
                  </CardTitle>
                  <span className={`text-xl font-bold ${mayBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {mayBalance > 0 ? formatCurrency(mayBalance) : 'Sin deuda'}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    className="gap-2 rounded-xl bg-red-600 hover:bg-red-700"
                    size="sm"
                    onClick={() => { setMayAmount(''); setMayDesc(''); setMayDeudaDialog(true) }}
                  >
                    <ArrowUpCircle className="h-4 w-4" />
                    Cargar deuda
                  </Button>
                  <Button
                    className="gap-2 rounded-xl bg-green-600 hover:bg-green-700"
                    size="sm"
                    onClick={() => { setMayAmount(''); setMayDesc(''); setMayPagoDialog(true) }}
                    disabled={mayBalance <= 0}
                  >
                    <ArrowDownCircle className="h-4 w-4" />
                    Registrar pago
                  </Button>
                </div>

                {mayTxs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin movimientos</p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
                    {mayTxs.map((tx) => (
                      <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                          tx.type === 'payment' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                        }`}>
                          {tx.type === 'payment'
                            ? <ArrowDownCircle className="h-4 w-4 text-green-600" />
                            : <ArrowUpCircle className="h-4 w-4 text-red-600" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                        </div>
                        <p className={`font-bold tabular-nums ${tx.type === 'payment' ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.type === 'payment' ? '-' : '+'}{formatCurrency(tx.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Dialog cargar deuda mayorista */}
          <Dialog open={mayDeudaDialog} onOpenChange={(open) => !open && setMayDeudaDialog(false)}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Cargar deuda con mayorista</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
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

          {/* Dialog pago mayorista */}
          <Dialog open={mayPagoDialog} onOpenChange={(open) => !open && setMayPagoDialog(false)}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Registrar pago a mayorista</DialogTitle>
                <DialogDescription>Deuda actual: {formatCurrency(mayBalance)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Monto</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                    <Input
                      type="number" min="0" max={mayBalance} step="0.01"
                      value={mayAmount} onChange={(e) => setMayAmount(e.target.value)}
                      className="pl-7" placeholder="0" autoFocus
                    />
                  </div>
                  <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setMayAmount(String(mayBalance))}>
                    Cancelar toda la deuda ({formatCurrency(mayBalance)})
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Descripción (opcional)</Label>
                  <Textarea placeholder="Ej: Transferencia bancaria" value={mayDesc} onChange={(e) => setMayDesc(e.target.value)} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMayPagoDialog(false)}>Cancelar</Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={handleMayAddPago} disabled={mayProcessing || !mayAmount || parseFloat(mayAmount) <= 0}>
                  {mayProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Registrar pago
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
