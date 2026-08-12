'use client'

import React from "react"

import { useEffect, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DataTableSkeleton } from '@/components/ui/data-table-skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { sellersApi, ordersApi } from '@/lib/api'
import type { Seller, SellerCommission, EmployeeType, Order } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { statusConfig } from '@/lib/order-constants'
import { resumenComisiones } from '@/lib/utils/comisiones'
import { comisionesDelPago } from '@/lib/utils/comision-imputacion'
import { toInputDate } from '@/lib/utils/comisiones-period'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Eye,
  MoreVertical,
  Phone,
  Mail,
  Users,
  TrendingUp,
  DollarSign,
  X,
  CheckCircle,
  Clock,
  Banknote,
  Loader2,
  Truck,
  ShoppingCart,
  MapPin,
  Package,
  Calendar,
  ChevronDown,
  ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'

const EMPLOYEE_TYPE_LABELS: Record<EmployeeType, string> = {
  vendedor: 'Vendedor',
  transportista: 'Transportista',
  ambos: 'Vendedor + Transportista',
  cobrador: 'Cobrador',
  vendedor_cobrador: 'Vendedor + Cobrador',
}

const EMPLOYEE_TYPE_BADGE: Record<EmployeeType, string> = {
  vendedor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
  transportista: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border border-violet-200 dark:border-violet-800',
  ambos: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 border border-teal-200 dark:border-teal-800',
  cobrador: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
  vendedor_cobrador: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
}

export default function EmpleadosPage() {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sellerToDelete, setSellerToDelete] = useState<Seller | null>(null)

  // Detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)
  const [commissions, setCommissions] = useState<SellerCommission[]>([])
  const [loadingCommissions, setLoadingCommissions] = useState(false)
  const [pagos, setPagos] = useState<any[]>([])
  const [expandedPagoId, setExpandedPagoId] = useState<string | null>(null)
  const [calcModalOpen, setCalcModalOpen] = useState(false)

  // Filtros de comisiones (rango de fechas + estado) y pago por período
  const [comDesde, setComDesde] = useState('')
  const [comHasta, setComHasta] = useState('')
  const [comEstado, setComEstado] = useState<'pendiente' | 'pagado' | 'todos'>('pendiente')
  const [paying, setPaying] = useState(false)

  // Modal de pago: monto (puede ser mayor/menor/igual), fecha real y nota
  const [pagoModalOpen, setPagoModalOpen] = useState(false)
  const [pagoMonto, setPagoMonto] = useState('')
  const [pagoFecha, setPagoFecha] = useState('')
  const [pagoNota, setPagoNota] = useState('')

  // Pedidos activos del empleado
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    codigoVendedor: '',
    isVendedor: true,
    isTransportista: false,
    isCobrador: false,
    commissionRate: 10,
    transportistaCommissionRate: 10,
    maxDiscount: 6,
    isActive: true,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    const doLoad = async () => {
      try {
        const data = await sellersApi.getAll()
        if (!mounted) return
        setSellers(data)
      } catch (error) {
        if (!mounted) return

        toast.error('Error al cargar empleados')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    doLoad()
    return () => { mounted = false }
  }, [])

  const loadSellers = async () => {
    try {
      const data = await sellersApi.getAll()
      setSellers(data)
    } catch (error) {
      toast.error('Error al cargar empleados')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingSeller(null)
    setFormData({
      name: '',
      email: '',
      phone: '',
      codigoVendedor: '',
      isVendedor: true,
      isTransportista: false,
      isCobrador: false,
      commissionRate: 10,
      transportistaCommissionRate: 10,
      maxDiscount: 6,
      isActive: true,
    })
    setModalOpen(true)
  }

  const handleEdit = (seller: Seller) => {
    setEditingSeller(seller)
    setFormData({
      name: seller.name,
      email: seller.email,
      phone: seller.phone,
      codigoVendedor: seller.codigoVendedor ?? '',
      isVendedor: seller.employeeType === 'vendedor' || seller.employeeType === 'ambos' || seller.employeeType === 'vendedor_cobrador',
      isTransportista: seller.employeeType === 'transportista' || seller.employeeType === 'ambos',
      isCobrador: seller.employeeType === 'cobrador' || seller.employeeType === 'vendedor_cobrador',
      commissionRate: seller.commissionRate,
      transportistaCommissionRate: seller.transportistaCommissionRate ?? 10,
      maxDiscount: seller.maxDiscount ?? 6,
      isActive: seller.isActive,
    })
    setModalOpen(true)
  }

  const handleDelete = (seller: Seller) => {
    setSellerToDelete(seller)
    setDeleteDialogOpen(true)
  }

  const handleViewDetail = async (seller: Seller) => {
    setSelectedSeller(seller)
    setDetailModalOpen(true)
    setExpandedOrderId(null)
    setExpandedPagoId(null)
    setActiveOrders([])
    setComDesde('')
    setComHasta('')
    setComEstado('pendiente')
    setLoadingCommissions(true)
    setLoadingOrders(true)
    try {
      const [data, pagosData] = await Promise.all([
        sellersApi.getCommissions(seller.id),
        sellersApi.getPagosComisiones(seller.id),
      ])
      setCommissions(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      setPagos(pagosData)
    } catch (error) {
      toast.error('Error al cargar comisiones')
    } finally {
      setLoadingCommissions(false)
    }
    try {
      const esVendedor = seller.employeeType === 'vendedor' || seller.employeeType === 'ambos' || seller.employeeType === 'vendedor_cobrador'
      const esTransportista = seller.employeeType === 'transportista' || seller.employeeType === 'ambos'
      const [porVendedor, porTransportista] = await Promise.all([
        esVendedor ? ordersApi.getBySeller(seller.id) : Promise.resolve([] as Order[]),
        esTransportista ? ordersApi.getByTransportista(seller.id) : Promise.resolve([] as Order[]),
      ])
      const dedup = new Map<string, Order>()
      for (const o of [...porVendedor, ...porTransportista]) dedup.set(o.id, o)
      const activos = Array.from(dedup.values())
        .filter((o) => o.status !== 'completed')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setActiveOrders(activos)
    } catch (error) {
      toast.error('Error al cargar pedidos del empleado')
    } finally {
      setLoadingOrders(false)
    }
  }

  const confirmDelete = async () => {
    if (!sellerToDelete) return
    try {
      await sellersApi.delete(sellerToDelete.id)
      setSellers(sellers.filter(s => s.id !== sellerToDelete.id))
      toast.success('Empleado eliminado correctamente')
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar empleado')
    } finally {
      setDeleteDialogOpen(false)
      setSellerToDelete(null)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.isVendedor && !formData.isTransportista && !formData.isCobrador) {
      toast.error('Seleccioná al menos un rol (Vendedor, Transportista o Cobrador)')
      return
    }
    setSaving(true)
    const employeeType: EmployeeType =
      formData.isCobrador && formData.isVendedor ? 'vendedor_cobrador'
      : formData.isCobrador ? 'cobrador'
      : formData.isVendedor && formData.isTransportista ? 'ambos'
      : formData.isTransportista ? 'transportista'
      : 'vendedor'
    const payload: Record<string, any> = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      codigoVendedor: formData.codigoVendedor.trim() || undefined,
      employeeType,
      commissionRate: formData.isVendedor ? formData.commissionRate : 0,
      maxDiscount: formData.maxDiscount,
      isActive: formData.isActive,
    }
    try {
      if (editingSeller) {
        const updated = await sellersApi.update(editingSeller.id, payload)
        setSellers(sellers.map(s => s.id === editingSeller.id ? updated : s))
        toast.success('Empleado actualizado correctamente')
      } else {
        const newSeller = await sellersApi.create(payload)
        setSellers([newSeller, ...sellers])
        toast.success('Empleado creado correctamente')
      }
      setModalOpen(false)
    } catch (error) {
      toast.error('Error al guardar empleado')
    } finally {
      setSaving(false)
    }
  }

  const buildComisionesPDF = (
    seller: Seller,
    desde: Date | null,
    hasta: Date | null,
    items: SellerCommission[],
    monto: number,
  ) => {
    const now = new Date()
    const stamp = new Intl.DateTimeFormat('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(now)
    const periodoTxt = desde || hasta
      ? `${desde ? formatDate(desde) : '—'} al ${hasta ? formatDate(hasta) : '—'}`
      : 'Todas las comisiones pendientes'
    const ventas = items.filter((c) => c.commissionAmount >= 0)
    const devol = items.filter((c) => c.commissionAmount < 0)
    const totalVentas = ventas.reduce((s, c) => s + c.saleTotal, 0)
    const devMonto = Math.abs(devol.reduce((s, c) => s + c.saleTotal, 0))
    const ventasNetas = totalVentas - devMonto

    const rows = (list: SellerCommission[]) =>
      list.map((c) => `
        <tr>
          <td>${formatDate(c.createdAt)}</td>
          <td>${c.saleNumber ? String(c.saleNumber) : '—'}</td>
          <td>${c.clientName ? c.clientName : '—'}</td>
          <td class="num">${formatCurrency(c.saleTotal)}</td>
          <td class="num">${c.commissionRate}%</td>
          <td class="num">${formatCurrency(c.commissionAmount)}</td>
        </tr>`).join('')

    const html = `<!doctype html><html><head><meta charset="utf-8"/>
      <title>Comisiones ${seller.name}</title>
      <style>
        @page { size: A4; margin: 16mm; }
        * { font-family: Arial, sans-serif; color: #111; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        h2 { font-size: 14px; margin: 18px 0 6px; }
        .sub { color: #555; font-size: 12px; margin: 0 0 2px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
        th, td { border: 1px solid #ccc; padding: 5px 6px; text-align: left; }
        th { background: #f1f5f9; }
        .num { text-align: right; white-space: nowrap; }
        .totbox { margin-top: 14px; padding: 10px 14px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; display: inline-block; }
        .totbox .lbl { font-size: 11px; color: #555; }
        .totbox .val { font-size: 20px; font-weight: bold; color: #047857; }
        .pasos { margin-top: 12px; width: 420px; }
        .paso { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
        .paso .n { display: inline-block; width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 50%; background: #ccfbf1; color: #0f766e; font-weight: bold; font-size: 11px; margin-right: 8px; }
        .paso .v { font-weight: bold; white-space: nowrap; }
        .paso .neg { color: #b91c1c; }
        .paso.sub { background: #f8fafc; font-weight: 600; }
        .paso.final { background: #ecfdf5; border: 2px solid #5eead4; border-radius: 10px; margin-top: 8px; padding: 12px; }
        .paso.final .lbl { font-size: 16px; font-weight: bold; }
        .paso.final .v { font-size: 22px; color: #0d9488; }
        .footer { margin-top: 24px; font-size: 10px; color: #888; }
      </style></head><body>
      <h1>Liquidación de Comisiones</h1>
      <p class="sub"><strong>Vendedor:</strong> ${seller.name}${seller.codigoVendedor ? ` (cód. ${seller.codigoVendedor})` : ''}</p>
      <p class="sub"><strong>Comisión:</strong> ${seller.commissionRate}%</p>
      <p class="sub"><strong>Período:</strong> ${periodoTxt}</p>
      <p class="sub"><strong>Ventas incluidas:</strong> ${ventas.length} — Total ventas: ${formatCurrency(totalVentas)}</p>
      <h2>Ventas y comisiones</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Venta</th><th>Cliente</th><th class="num">Total venta</th><th class="num">%</th><th class="num">Comisión</th></tr></thead>
        <tbody>${ventas.length ? rows(ventas) : '<tr><td colspan="6">Sin ventas en el período</td></tr>'}</tbody>
      </table>
      ${devol.length ? `<h2>Devoluciones / ajustes</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Ref.</th><th>Cliente</th><th class="num">Total</th><th class="num">%</th><th class="num">Ajuste</th></tr></thead>
        <tbody>${rows(devol)}</tbody>
      </table>` : ''}
      <h2>Cómo se calcula lo que se le paga</h2>
      <div class="pasos">
        <div class="paso"><span><span class="n">1</span>Vendió</span><span class="v">${formatCurrency(totalVentas)}</span></div>
        <div class="paso"><span><span class="n">2</span>Devoluciones</span><span class="v neg">− ${formatCurrency(devMonto)}</span></div>
        <div class="paso sub"><span style="margin-left:28px">Venta menos devolución</span><span class="v">${formatCurrency(ventasNetas)}</span></div>
        <div class="paso"><span><span class="n">3</span>Comisión ${seller.commissionRate}%</span><span class="v" style="font-weight:normal;color:#555;font-size:11px">${seller.commissionRate}% × ${formatCurrency(ventasNetas)}</span></div>
        <div class="paso final"><span class="lbl">Se le paga</span><span class="v">${formatCurrency(monto)}</span></div>
      </div>
      <div class="footer">Generado el ${stamp} — Distribuidora Patricia</div>
      </body></html>`

    // Imprimir vía iframe oculto para no abrir una pestaña "about:blank"
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (!doc) {
      document.body.removeChild(iframe)
      toast.error('No se pudo generar el PDF')
      return
    }
    doc.open()
    doc.write(html)
    doc.close()
    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
      }, 1000)
    }
    iframe.onload = () => {
      const w = iframe.contentWindow
      if (!w) { cleanup(); return }
      w.focus()
      w.onafterprint = cleanup
      w.print()
      // Fallback por si onafterprint no dispara
      setTimeout(cleanup, 60000)
    }
  }

  // Abre el modal de pago. El pago se imputa siempre desde la comisión más vieja,
  // así que lo pendiente anterior al período se cubre primero.
  const handlePagarPeriodo = () => {
    if (!selectedSeller) return
    if (pendingInRange.length === 0) {
      toast.error('No hay comisiones pendientes en el período seleccionado')
      return
    }
    setPagoMonto(String(Math.round((pendienteAnterior + pendingInRangeTotal) * 100) / 100))
    setPagoFecha(toInputDate(new Date()))
    setPagoNota('')
    setPagoModalOpen(true)
  }

  const handleConfirmarPago = async () => {
    if (!selectedSeller) return
    const montoPagado = Number(pagoMonto)
    if (!Number.isFinite(montoPagado) || montoPagado < 0) {
      toast.error('Ingresá un monto válido')
      return
    }
    if (!pagoFecha) {
      toast.error('Ingresá la fecha del pago')
      return
    }
    const desdeDate = comDesde ? new Date(`${comDesde}T00:00:00`) : null
    const hastaDate = comHasta ? new Date(`${comHasta}T23:59:59.999`) : null
    const items = pendingInRange
    const monto = pendingInRangeTotal
    setPaying(true)
    try {
      await sellersApi.pagarComisionesPeriodo(
        selectedSeller.id,
        selectedSeller.name,
        desdeDate ?? new Date(0),
        hastaDate ?? new Date(),
        {
          montoPagado,
          fechaPago: new Date(`${pagoFecha}T12:00:00`),
          nota: pagoNota || undefined,
        },
      )
      setPagoModalOpen(false)
      // El comprobante lista solo lo que este pago alcanzó a cubrir.
      const acumuladoAntes = pagos.reduce((sum: number, p: any) => sum + (p.montoPagado ?? p.monto ?? 0), 0)
      const cubiertas = comisionesDelPago(
        [...commissions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        acumuladoAntes,
        montoPagado,
      )
      buildComisionesPDF(selectedSeller, desdeDate, hastaDate, cubiertas, montoPagado)
      const [updatedCommissions, pagosData] = await Promise.all([
        sellersApi.getCommissions(selectedSeller.id),
        sellersApi.getPagosComisiones(selectedSeller.id),
      ])
      setCommissions(updatedCommissions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      setPagos(pagosData)
      await loadSellers()
      const restante = updatedCommissions.reduce(
        (s, c) => (c.isPaid ? s : s + c.commissionAmount - (c.montoImputado ?? 0)),
        0,
      )
      toast.success(
        restante < 0.01
          ? 'Pago registrado — no queda nada pendiente'
          : `Pago registrado — queda pendiente ${formatCurrency(restante)}`,
      )
    } catch (error: any) {
      toast.error(error?.message || 'Error al pagar comisiones')
    } finally {
      setPaying(false)
    }
  }

  const handlePdfPreview = () => {
    if (!selectedSeller) return
    const desdeDate = comDesde ? new Date(`${comDesde}T00:00:00`) : null
    const hastaDate = comHasta ? new Date(`${comHasta}T23:59:59.999`) : null
    const items = commissions.filter(
      (c) =>
        !c.isPaid &&
        (!desdeDate || c.createdAt >= desdeDate) &&
        (!hastaDate || c.createdAt <= hastaDate),
    )
    if (items.length === 0) {
      toast.error('No hay comisiones pendientes en el período seleccionado')
      return
    }
    const monto = items.reduce((s, c) => s + c.commissionAmount - (c.montoImputado ?? 0), 0)
    buildComisionesPDF(selectedSeller, desdeDate, hastaDate, items, monto)
  }

  // Comisiones que cubrió un pago: tramo de la imputación FIFO entre lo acumulado
  // antes de ese pago y lo acumulado después.
  const getPagoItems = (pago: any): SellerCommission[] => {
    const cronologicos = [...pagos].sort(
      (a: any, b: any) => new Date(a.fechaPago ?? a.createdAt).getTime() - new Date(b.fechaPago ?? b.createdAt).getTime(),
    )
    const idx = cronologicos.findIndex((p: any) => p.id === pago.id)
    if (idx < 0) return []
    const acumuladoAntes = cronologicos
      .slice(0, idx)
      .reduce((sum: number, p: any) => sum + (p.montoPagado ?? p.monto ?? 0), 0)
    return comisionesDelPago(
      [...commissions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      acumuladoAntes,
      pago.montoPagado ?? pago.monto ?? 0,
    )
  }

  const handlePagoPdf = (pago: any) => {
    if (!selectedSeller) return
    const items = getPagoItems(pago)
    buildComisionesPDF(
      selectedSeller,
      pago.periodoDesde ?? null,
      pago.periodoHasta ?? null,
      items,
      pago.montoPagado ?? pago.monto,
    )
  }

  const filteredSellers = sellers.filter(seller => {
    const query = searchQuery.toLowerCase()
    const matchesSearch =
      seller.name.toLowerCase().includes(query) ||
      (seller.email?.toLowerCase().includes(query) ?? false) ||
      (seller.phone?.toLowerCase().includes(query) ?? false)
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && seller.isActive) ||
      (statusFilter === 'inactive' && !seller.isActive)
    const matchesType =
      typeFilter === 'all' ||
      (typeFilter === 'vendedor' && (seller.employeeType === 'vendedor' || seller.employeeType === 'ambos' || seller.employeeType === 'vendedor_cobrador')) ||
      (typeFilter === 'transportista' && (seller.employeeType === 'transportista' || seller.employeeType === 'ambos')) ||
      (typeFilter === 'cobrador' && (seller.employeeType === 'cobrador' || seller.employeeType === 'vendedor_cobrador'))
    return matchesSearch && matchesStatus && matchesType
  })

  const getCommissionColor = (rate: number) => {
    if (rate >= 15) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
    if (rate >= 10) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
  }

  const getStatusBadge = (isActive: boolean) => {
    if (isActive) {
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
    }
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
  }

  const getEmployeeTypeIcon = (type: EmployeeType) => {
    if (type === 'vendedor') return <ShoppingCart className="h-3 w-3 mr-1" />
    if (type === 'transportista') return <Truck className="h-3 w-3 mr-1" />
    if (type === 'cobrador' || type === 'vendedor_cobrador') return <Banknote className="h-3 w-3 mr-1" />
    return <Users className="h-3 w-3 mr-1" />
  }

  // Stats
  const activeSellers = sellers.filter(s => s.isActive).length
  const totalSales = sellers.reduce((sum, s) => sum + (s.totalSales || 0), 0)
  const totalCommissions = sellers.reduce((sum, s) => sum + (s.totalCommission || 0), 0)

  // Filtro de comisiones (rango + estado) para la lista del detalle
  const comDesdeDate = comDesde ? new Date(`${comDesde}T00:00:00`) : null
  const comHastaDate = comHasta ? new Date(`${comHasta}T23:59:59.999`) : null
  const inComRange = (c: SellerCommission) =>
    (!comDesdeDate || c.createdAt >= comDesdeDate) &&
    (!comHastaDate || c.createdAt <= comHastaDate)

  // Totales del detalle — respetan el rango de fechas elegido abajo
  const commissionsInRange = commissions.filter(inComRange)
  const pendingCommissions = commissionsInRange.filter(c => !c.isPaid)
  const ventaEntries = commissionsInRange.filter(c => c.commissionAmount >= 0)
  const devEntries = commissionsInRange.filter(c => c.commissionAmount < 0)
  const allSalesTotal = ventaEntries.reduce((sum, c) => sum + c.saleTotal, 0)
  const devSalesTotal = devEntries.reduce((sum, c) => sum + c.saleTotal, 0) // negativo
  const ventasNetas = allSalesTotal + devSalesTotal
  // Totales de comisiones: MISMA fuente que ve el vendedor (resumenComisiones).
  const resumenDetalle = resumenComisiones(commissionsInRange)
  const comisionesBrutas = resumenDetalle.brutas
  const devolucionesTotal = -resumenDetalle.devoluciones // negativo (se muestra con Math.abs)
  const comisionesFinales = resumenDetalle.finales
  const filteredCommissions = commissions.filter(
    (c) =>
      inComRange(c) &&
      (comEstado === 'todos' || (comEstado === 'pagado' ? c.isPaid : !c.isPaid)),
  )
  const pendingInRange = commissions.filter((c) => !c.isPaid && inComRange(c))
  // Lo que falta pagar: descuenta la parte ya cubierta de las comisiones parciales.
  const pendingInRangeTotal = pendingInRange.reduce(
    (sum, c) => sum + c.commissionAmount - (c.montoImputado ?? 0),
    0,
  )
  // Pendiente anterior al período: el pago se imputa desde lo más viejo, así que
  // esto se cubre antes que las comisiones del rango elegido.
  const pendienteTotal = commissions.reduce(
    (sum, c) => (c.isPaid ? sum : sum + c.commissionAmount - (c.montoImputado ?? 0)),
    0,
  )
  const pendienteAnterior = comDesdeDate
    ? commissions
        .filter((c) => !c.isPaid && c.createdAt < comDesdeDate)
        .reduce((sum, c) => sum + c.commissionAmount - (c.montoImputado ?? 0), 0)
    : 0
  // Primer día a pagar = fecha de la comisión pendiente más antigua
  const firstPendingDate = pendingCommissions.length > 0
    ? new Date(Math.min(...pendingCommissions.map((c) => c.createdAt.getTime())))
    : null

  // Pedidos activos agrupados por día y luego por cliente (más reciente primero)
  const ordersByDay = activeOrders.reduce<Record<string, { label: string; clients: Record<string, Order[]> }>>((acc, order) => {
    const d = new Date(order.createdAt)
    const key = d.toISOString().slice(0, 10)
    if (!acc[key]) acc[key] = { label: formatDate(order.createdAt), clients: {} }
    const cliente = order.clientName || 'Sin cliente'
    if (!acc[key].clients[cliente]) acc[key].clients[cliente] = []
    acc[key].clients[cliente].push(order)
    return acc
  }, {})
  const orderDays = Object.keys(ordersByDay).sort((a, b) => b.localeCompare(a))
  // Contador de pedidos por cliente (clientes distintos con pedidos activos)
  const totalClientes = new Set(activeOrders.map((o) => o.clientName || 'Sin cliente')).size

  return (
    <MainLayout allowedRoles={['admin']} title="Empleados" description="Gestiona tu equipo de vendedores y transportistas">
      {!detailModalOpen && (
      <>
      {/* Stats Cards - Solo visible en desktop */}
      <div className="hidden lg:grid grid-cols-3 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Empleados Activos</p>
                <p className="text-2xl font-bold text-foreground">{activeSellers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ventas Totales</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalSales)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-rose-500/5 to-rose-500/10 border-rose-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10">
                <DollarSign className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Comisiones Totales</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalCommissions)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header Actions - Desktop */}
      <div className="hidden md:flex flex-row gap-4 justify-between mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email o telefono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-background"
          />
        </div>
        <div className="flex flex-row gap-3">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Todos los tipos</option>
            <option value="vendedor">Vendedor</option>
            <option value="transportista">Transportista</option>
            <option value="cobrador">Cobrador</option>
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <Button onClick={handleCreate} className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            Nuevo Empleado
          </Button>
        </div>
      </div>

      {/* Header Actions - Mobile */}
      <div className="flex md:hidden flex-col gap-3 mb-4">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar empleado..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-background"
          />
        </div>
        <div className="flex gap-2">
          <select
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Todos los tipos</option>
            <option value="vendedor">Vendedor</option>
            <option value="transportista">Transportista</option>
            <option value="cobrador">Cobrador</option>
          </select>
          <select
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <>
          <div className="hidden md:block">
            <DataTableSkeleton columns={8} rows={5} />
          </div>
          <div className="md:hidden space-y-3 pb-20">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-5 bg-muted rounded w-2/3 mb-2" />
                  <div className="h-4 bg-muted rounded w-1/3 mb-3" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Empty State */}
          {filteredSellers.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <Users className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">No se encontraron empleados</h3>
                <p className="text-muted-foreground text-sm text-center mb-6 max-w-sm">
                  {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                    ? 'Intenta ajustar los filtros de busqueda para encontrar lo que buscas'
                    : 'Comienza agregando tu primer empleado para gestionar tu equipo'}
                </p>
                {!searchQuery && statusFilter === 'all' && typeFilter === 'all' && (
                  <Button onClick={handleCreate} className="gap-2" size="lg">
                    <Plus className="h-5 w-5" />
                    Agregar Primer Empleado
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Empleado</th>
                        <th className="text-center p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Tipo</th>
                        <th className="text-left p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Contacto</th>
                        <th className="text-center p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Comision</th>
                        <th className="text-right p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Ventas</th>
                        <th className="text-right p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Comisiones</th>
                        <th className="text-center p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Estado</th>
                        <th className="text-center p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredSellers.map((seller) => (
                        <tr key={seller.id} className="hover:bg-muted/40 transition-colors group">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-sm font-semibold text-primary">
                                  {seller.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate">{seller.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Desde {formatDate(seller.createdAt)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${EMPLOYEE_TYPE_BADGE[seller.employeeType]}`}>
                              {getEmployeeTypeIcon(seller.employeeType)}
                              {EMPLOYEE_TYPE_LABELS[seller.employeeType]}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="space-y-1">
                              {seller.email && (
                                <p className="text-sm text-foreground flex items-center gap-1.5">
                                  <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="truncate max-w-[180px]">{seller.email}</span>
                                </p>
                              )}
                              {seller.phone && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                  <Phone className="h-3 w-3 shrink-0" />
                                  {seller.phone}
                                </p>
                              )}
                              {!seller.email && !seller.phone && (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {(seller.employeeType === 'vendedor' || seller.employeeType === 'ambos' || seller.employeeType === 'vendedor_cobrador') ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getCommissionColor(seller.commissionRate)}`}>
                                  <ShoppingCart className="h-2.5 w-2.5 mr-1" />{seller.commissionRate}%
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <span className="font-medium text-foreground">
                              {formatCurrency(seller.totalSales || 0)}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(seller.totalCommission || 0)}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(seller.isActive)}`}>
                              {seller.isActive ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                                onClick={() => handleViewDetail(seller)}
                              >
                                <Eye className="h-4 w-4" />
                                <span className="sr-only">Ver detalle</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-600"
                                onClick={() => handleEdit(seller)}
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Editar</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-red-500/10 text-red-500 hover:text-red-600"
                                onClick={() => handleDelete(seller)}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Eliminar</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-2 pb-24">
                {filteredSellers.map((seller) => (
                  <Card key={seller.id} className="overflow-hidden border-border/60 shadow-sm active:scale-[0.99] transition-transform">
                    <CardContent className="p-0" style={{ fontSize: '11px' }}>
                      {/* Card Header */}
                      <div className="p-1.5 border-b border-border/50 bg-muted/30">
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-semibold text-primary">
                                {seller.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-foreground truncate text-[13px] leading-tight">{seller.name}</h3>
                              <p className="text-[10px] text-muted-foreground leading-tight">Desde {formatDate(seller.createdAt)}</p>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 -mr-0.5">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => handleViewDetail(seller)} className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                Ver detalle
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(seller)} className="flex items-center gap-2">
                                <Pencil className="h-4 w-4" />
                                Editar empleado
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(seller)}
                                className="flex items-center gap-2 text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                              >
                                <Trash2 className="h-4 w-4" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${EMPLOYEE_TYPE_BADGE[seller.employeeType]}`}>
                            {getEmployeeTypeIcon(seller.employeeType)}
                            {EMPLOYEE_TYPE_LABELS[seller.employeeType]}
                          </span>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadge(seller.isActive)}`}>
                            {seller.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                          {(seller.employeeType === 'vendedor' || seller.employeeType === 'ambos' || seller.employeeType === 'vendedor_cobrador') && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getCommissionColor(seller.commissionRate)}`}>
                              <ShoppingCart className="h-2.5 w-2.5 mr-0.5" />{seller.commissionRate}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-1.5 space-y-1.5">
                        {/* Contact Info */}
                        {(seller.phone || seller.email) && (
                          <div className="flex items-center gap-3 text-[11px] min-w-0">
                            {seller.phone && (
                              <a
                                href={`tel:${seller.phone}`}
                                className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors shrink-0"
                              >
                                <Phone className="h-3 w-3 shrink-0" />
                                {seller.phone}
                              </a>
                            )}
                            {seller.email && (
                              <a
                                href={`mailto:${seller.email}`}
                                className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors min-w-0"
                              >
                                <Mail className="h-3 w-3 shrink-0" />
                                <span className="truncate">{seller.email}</span>
                              </a>
                            )}
                          </div>
                        )}

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="rounded-md px-2 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-baseline justify-between gap-1">
                            <p className="text-[10px] text-muted-foreground font-medium uppercase">Ventas</p>
                            <p className="font-bold text-[12px] text-foreground tabular-nums">
                              {formatCurrency(seller.totalSales || 0)}
                            </p>
                          </div>
                          <div className="rounded-md px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex items-baseline justify-between gap-1">
                            <p className="text-[10px] text-muted-foreground font-medium uppercase">Comis.</p>
                            <p className="font-bold text-[12px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                              {formatCurrency(seller.totalCommission || 0)}
                            </p>
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-6 bg-transparent text-[11px] px-2"
                            onClick={() => handleEdit(seller)}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 h-6 text-[11px] px-2"
                            onClick={() => handleViewDetail(seller)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Ver Detalle
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* FAB for Mobile */}
      <div className="md:hidden fixed bottom-6 right-6 z-50">
        <Button
          onClick={handleCreate}
          className="h-14 w-14 rounded-full shadow-lg shadow-primary/25"
          size="icon"
        >
          <Plus className="h-6 w-6" />
          <span className="sr-only">Nuevo Empleado</span>
        </Button>
      </div>
      </>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSeller ? 'Editar Empleado' : 'Nuevo Empleado'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nombre Completo</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Juan Perez"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="codigoVendedor">Código de vendedor</Label>
                <Input
                  id="codigoVendedor"
                  value={formData.codigoVendedor}
                  onChange={(e) => setFormData({ ...formData, codigoVendedor: e.target.value })}
                  placeholder="Ej: 3"
                />
              </div>
              <div className="grid gap-2">
                <Label>Roles del Empleado</Label>
                <div className="rounded-lg border border-border/60 divide-y divide-border/40">
                  <div className="flex items-center gap-3 p-3">
                    <Checkbox
                      id="isVendedor"
                      checked={formData.isVendedor}
                      onCheckedChange={(checked) => setFormData({ ...formData, isVendedor: !!checked })}
                    />
                    <label htmlFor="isVendedor" className="flex items-center gap-2 cursor-pointer flex-1">
                      <ShoppingCart className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Vendedor</span>
                    </label>
                    {formData.isVendedor && (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={formData.commissionRate}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setFormData({ ...formData, commissionRate: Number(e.target.value) })}
                          className="h-8 w-20 text-sm text-center"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 p-3">
                    <Checkbox
                      id="isTransportista"
                      checked={formData.isTransportista}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, isTransportista: !!checked, isCobrador: checked ? false : formData.isCobrador })
                      }
                    />
                    <label htmlFor="isTransportista" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Truck className="h-4 w-4 text-violet-500" />
                      <span className="text-sm font-medium">Transportista</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-3 p-3">
                    <Checkbox
                      id="isCobrador"
                      checked={formData.isCobrador}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          isCobrador: !!checked,
                          // Cobrador puede combinarse con Vendedor, pero no con Transportista
                          // (el transportista ya tiene su propio flujo de reparto/pedidos).
                          isTransportista: checked ? false : formData.isTransportista,
                        })
                      }
                    />
                    <label htmlFor="isCobrador" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Banknote className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium">Cobrador</span>
                    </label>
                  </div>
                </div>
                {formData.isCobrador && (
                  <p className="text-xs text-muted-foreground">
                    Ve todas las cuentas corrientes y registra pagos (siempre con comprobante). Puede combinarse con Vendedor, pero no con Transportista.
                  </p>
                )}
              </div>
              {formData.isVendedor && (
                <div className="grid gap-2">
                  <Label htmlFor="maxDiscount">Descuento máximo permitido</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id="maxDiscount"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={formData.maxDiscount}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setFormData({ ...formData, maxDiscount: Number(e.target.value) })}
                      className="h-8 w-24 text-sm text-center"
                    />
                    <span className="text-sm text-muted-foreground">% máximo de descuento que puede aplicar en sus ventas</span>
                  </div>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Ej: juan@email.com"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Telefono</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Ej: 11 1234-5678"
                  required
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="isActive">Empleado Activo</Label>
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingSeller ? 'Guardar Cambios' : 'Crear Empleado'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail View (inline, reemplaza la tabla) */}
      {detailModalOpen && selectedSeller && (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-border rounded-t-xl">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-lg font-semibold text-primary">
                  {selectedSeller.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{selectedSeller.name}</p>
                <p className="text-sm font-normal text-muted-foreground truncate">{selectedSeller.email}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setDetailModalOpen(false)} className="gap-2 shrink-0">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </div>

          {selectedSeller && (
            <div className="space-y-6 p-4 md:p-6">
              {/* Employee Info Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${EMPLOYEE_TYPE_BADGE[selectedSeller.employeeType]}`}>
                  {getEmployeeTypeIcon(selectedSeller.employeeType)}
                  {EMPLOYEE_TYPE_LABELS[selectedSeller.employeeType]}
                </span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(selectedSeller.isActive)}`}>
                  {selectedSeller.isActive ? 'Activo' : 'Inactivo'}
                </span>
                {(selectedSeller.employeeType === 'vendedor' || selectedSeller.employeeType === 'ambos' || selectedSeller.employeeType === 'vendedor_cobrador') && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getCommissionColor(selectedSeller.commissionRate)}`}>
                    <ShoppingCart className="h-3 w-3 mr-1" />
                    {selectedSeller.commissionRate}% vendedor
                  </span>
                )}
                {(selectedSeller.employeeType === 'vendedor' || selectedSeller.employeeType === 'ambos' || selectedSeller.employeeType === 'vendedor_cobrador') && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                    Desc. máx {selectedSeller.maxDiscount ?? 6}%
                  </span>
                )}
                {selectedSeller.phone && (
                  <a
                    href={`tel:${selectedSeller.phone}`}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
                  >
                    <Phone className="h-3 w-3 mr-1" />
                    {selectedSeller.phone}
                  </a>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Ventas Totales</p>
                  <p className="font-bold text-xl text-foreground">
                    {formatCurrency(allSalesTotal)}
                  </p>
                  <p className="text-xs text-muted-foreground">Neto (− devol.): {formatCurrency(ventasNetas)}</p>
                </div>
                <div className="rounded-xl p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Comisiones Totales</p>
                  <p className="font-bold text-xl text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(comisionesBrutas)}
                  </p>
                </div>
                <div className="rounded-xl p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Devoluciones</p>
                  <p className="font-bold text-xl text-rose-600 dark:text-rose-400">
                    {formatCurrency(Math.abs(devolucionesTotal))}
                  </p>
                  <p className="text-xs text-muted-foreground">{devEntries.length} {devEntries.length === 1 ? 'devolución' : 'devoluciones'}</p>
                </div>
                <div className="rounded-xl p-4 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Comisiones Finales</p>
                  <p className="font-bold text-xl text-teal-600 dark:text-teal-400">
                    {formatCurrency(comisionesFinales)}
                  </p>
                  <p className="text-xs text-muted-foreground">Comisiones − devoluciones</p>
                </div>
              </div>

              <Tabs defaultValue="comisiones" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="comisiones">Comisiones</TabsTrigger>
                  <TabsTrigger value="pedidos">Pedidos activos</TabsTrigger>
                  <TabsTrigger value="cobros">Cobros</TabsTrigger>
                </TabsList>

              <TabsContent value="pedidos" className="mt-4">
              {/* Pedidos activos del empleado */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-foreground flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    Pedidos Activos
                  </h4>
                  {!loadingOrders && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                      {totalClientes} {totalClientes === 1 ? 'cliente' : 'clientes'}
                    </span>
                  )}
                </div>

                {loadingOrders ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse rounded-lg border p-4">
                        <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : activeOrders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No tiene pedidos activos</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[min(360px,45vh)] overflow-y-auto">
                    {orderDays.map((dayKey) => {
                      const day = ordersByDay[dayKey]
                      const clientNames = Object.keys(day.clients)
                      return (
                        <div key={dayKey}>
                          <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">{day.label}</span>
                            <span className="text-xs text-muted-foreground">
                              · {clientNames.length} {clientNames.length === 1 ? 'cliente' : 'clientes'}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {clientNames.map((cliente) => {
                              const clientOrders = day.clients[cliente]
                              const groupKey = `${dayKey}-${cliente}`
                              const isExpanded = expandedOrderId === groupKey
                              const itemsCount = clientOrders.reduce((n, o) => n + o.items.reduce((m, it) => m + it.quantity, 0), 0)
                              const productsCount = clientOrders.reduce((n, o) => n + o.items.length, 0)
                              const firstStatus = statusConfig[clientOrders[0].status]
                              return (
                                <div key={groupKey} className="rounded-lg border bg-card overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedOrderId(isExpanded ? null : groupKey)}
                                    className="w-full text-left p-3 flex items-start justify-between gap-3 hover:bg-muted/40 transition-colors"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        {clientOrders.length > 1 ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                                            {clientOrders.length} pedidos
                                          </span>
                                        ) : (
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${firstStatus.bgColor} ${firstStatus.color} ${firstStatus.borderColor} border`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${firstStatus.dotColor}`} />
                                            {firstStatus.label}
                                          </span>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                          {productsCount} {productsCount === 1 ? 'producto' : 'productos'} · {itemsCount} u.
                                        </span>
                                      </div>
                                      <p className="font-medium text-foreground truncate">{cliente}</p>
                                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        {clientOrders[0].address}
                                      </p>
                                    </div>
                                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  </button>
                                  {isExpanded && (
                                    <div className="border-t bg-muted/20 divide-y divide-border/60">
                                      {clientOrders.map((order, oIdx) => {
                                        const cfg = statusConfig[order.status]
                                        return (
                                          <div key={order.id} className="p-3 space-y-1.5">
                                            {clientOrders.length > 1 && (
                                              <div className="flex items-center gap-2 text-xs">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${cfg.bgColor} ${cfg.color} ${cfg.borderColor} border`}>
                                                  <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
                                                  {cfg.label}
                                                </span>
                                                <span className="text-muted-foreground truncate">Pedido {oIdx + 1} · {order.address}</span>
                                              </div>
                                            )}
                                            {order.items.map((it, idx) => (
                                              <div key={`${order.id}-${idx}`} className="flex items-center justify-between text-sm">
                                                <span className="text-foreground truncate pr-2">
                                                  <span className="text-muted-foreground">{it.quantity}×</span> {it.name}
                                                </span>
                                                <span className="text-muted-foreground shrink-0">
                                                  {formatCurrency(it.price * it.quantity)}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              </TabsContent>

              <TabsContent value="cobros" className="mt-4">
              {pendienteTotal > 0.01 && (
                <div className="mb-3 flex items-center gap-2 text-sm rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2">
                  <Banknote className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="text-foreground">
                    Pendiente de pago: <strong>{formatCurrency(pendienteTotal)}</strong>
                  </span>
                </div>
              )}

              {/* Historial de pagos realizados */}
              {pagos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                  <Banknote className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No hay cobros registrados</p>
                </div>
              ) : (
                <div>
                  <h4 className="font-semibold text-foreground mb-3">Historial de Pagos</h4>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {pagos.map((pago: any) => {
                      const isOpen = expandedPagoId === pago.id
                      const pagoItems = isOpen ? getPagoItems(pago) : []
                      return (
                      <div key={pago.id} className="rounded-lg border bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800 overflow-hidden">
                        <div className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Banknote className="h-4 w-4 text-emerald-600 shrink-0" />
                              <span className="font-semibold text-foreground">{formatCurrency(pago.montoPagado ?? pago.monto)}</span>
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">{formatDate(pago.fechaPago ?? pago.createdAt)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Devengado {formatCurrency(pago.monto)} · {pago.cantidadComisiones} comisiones
                            {(pago.periodoDesde || pago.periodoHasta) && (
                              <> · Período {pago.periodoDesde ? formatDate(pago.periodoDesde) : '—'} al {pago.periodoHasta ? formatDate(pago.periodoHasta) : '—'}</>
                            )}
                            {pago.nota && <> — {pago.nota}</>}
                          </p>
                          {pago.montoPagado != null && Math.abs(pago.montoPagado - pago.monto) > 0.01 && (
                            <p className="text-xs mt-0.5">
                              {pago.montoPagado < pago.monto ? (
                                <span className="text-amber-600">
                                  Pago parcial — faltaron {formatCurrency(pago.monto - pago.montoPagado)}
                                </span>
                              ) : (
                                <span className="text-teal-600">
                                  Pagó {formatCurrency(pago.montoPagado - pago.monto)} de más (a cuenta)
                                </span>
                              )}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 bg-transparent"
                              onClick={() => setExpandedPagoId(isOpen ? null : pago.id)}
                            >
                              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                              {isOpen ? 'Ocultar' : 'Ver detalle'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 bg-transparent"
                              onClick={() => handlePagoPdf(pago)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              PDF
                            </Button>
                          </div>
                        </div>
                        {isOpen && (
                          <div className="border-t border-emerald-200 dark:border-emerald-800 bg-background/40 divide-y divide-border/60">
                            {pagoItems.length === 0 ? (
                              <p className="p-3 text-xs text-muted-foreground">No se encontraron las comisiones de este cobro.</p>
                            ) : (
                              pagoItems.map((c) => (
                                <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                                  <div className="min-w-0">
                                    <p className="text-foreground truncate">
                                      {c.saleNumber ? `Venta ${c.saleNumber}` : 'Venta'}{c.clientName ? ` · ${c.clientName}` : ''}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatDate(c.createdAt)} · {formatCurrency(c.saleTotal)} × {c.commissionRate}%
                                    </p>
                                  </div>
                                  <span className={`font-semibold tabular-nums shrink-0 ${c.commissionAmount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                    {formatCurrency(c.commissionAmount)}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      )
                    })}
                  </div>
                </div>
              )}
              </TabsContent>

              <TabsContent value="comisiones" className="mt-4 space-y-6">
              {/* Commissions List con filtros por fecha/estado */}
              <div>
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <h4 className="font-semibold text-foreground">
                    {comEstado === 'pagado' ? 'Historial de Comisiones' : comEstado === 'todos' ? 'Comisiones' : 'Comisiones Pendientes'}
                  </h4>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCalcModalOpen(true)}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Ver cálculo
                    </Button>
                    {comEstado !== 'pagado' && pendingInRange.length > 0 && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handlePdfPreview}
                          className="gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          PDF
                        </Button>
                        <Button
                          size="sm"
                          onClick={handlePagarPeriodo}
                          disabled={paying}
                          className="gap-2"
                        >
                          {paying ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Banknote className="h-4 w-4" />
                          )}
                          Pagar ({formatCurrency(pendingInRangeTotal)})
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Recordatorio: primer día a pagar */}
                {comEstado !== 'pagado' && firstPendingDate && (
                  <div className="mb-3 flex items-center gap-2 flex-wrap text-sm rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-foreground">
                      Primer día a pagar: <strong>{formatDate(firstPendingDate)}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setComDesde(firstPendingDate.toISOString().slice(0, 10))}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Usar como "Desde"
                    </button>
                  </div>
                )}

                {/* Filtros */}
                <div className="flex items-end gap-2 flex-wrap mb-3 p-3 rounded-xl border border-border/60 bg-muted/30">
                  <div className="grid gap-1">
                    <Label htmlFor="comDesde" className="text-xs text-muted-foreground">Desde</Label>
                    <Input
                      id="comDesde"
                      type="date"
                      value={comDesde}
                      onChange={(e) => setComDesde(e.target.value)}
                      className="h-9 w-[150px]"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="comHasta" className="text-xs text-muted-foreground">Hasta</Label>
                    <Input
                      id="comHasta"
                      type="date"
                      value={comHasta}
                      onChange={(e) => setComHasta(e.target.value)}
                      className="h-9 w-[150px]"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="comEstado" className="text-xs text-muted-foreground">Estado</Label>
                    <select
                      id="comEstado"
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={comEstado}
                      onChange={(e) => setComEstado(e.target.value as 'pendiente' | 'pagado' | 'todos')}
                    >
                      <option value="pendiente">No pagas</option>
                      <option value="pagado">Pagas (historial)</option>
                      <option value="todos">Todas</option>
                    </select>
                  </div>
                  {(comDesde || comHasta || comEstado !== 'pendiente') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9"
                      onClick={() => { setComDesde(''); setComHasta(''); setComEstado('pendiente') }}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Limpiar
                    </Button>
                  )}
                </div>

                {loadingCommissions ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse rounded-lg border p-4">
                        <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : filteredCommissions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                    <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>
                      {comEstado === 'pagado'
                        ? 'No hay comisiones pagas en el período'
                        : comEstado === 'todos'
                          ? 'No hay comisiones en el período'
                          : 'No hay comisiones pendientes en el período'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[min(300px,40vh)] overflow-y-auto">
                    {filteredCommissions.map((commission) => (
                      <div
                        key={commission.id}
                        className={`rounded-lg border p-4 flex items-center justify-between gap-4 ${
                          commission.isPaid
                            ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {commission.isPaid ? (
                              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            )}
                            <span className="font-semibold text-foreground">
                              {formatCurrency(commission.commissionAmount)}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              commission.isPaid
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : commission.estadoPago === 'parcial'
                                  ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>
                              {commission.isPaid ? 'Pagada' : commission.estadoPago === 'parcial' ? 'Parcial' : 'Pendiente'}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Venta: {formatCurrency(commission.saleTotal)} - {commission.commissionRate}% comision
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(commission.createdAt)}
                            {commission.estadoPago === 'parcial' && (
                              <> - Cobrado {formatCurrency(commission.montoImputado ?? 0)}, falta {formatCurrency(commission.commissionAmount - (commission.montoImputado ?? 0))}</>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </TabsContent>
              </Tabs>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 bg-transparent"
                  onClick={() => {
                    setDetailModalOpen(false)
                    handleEdit(selectedSeller)
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  className="bg-transparent"
                  onClick={() => setDetailModalOpen(false)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Registrar pago de comisiones */}
      <Dialog open={pagoModalOpen} onOpenChange={setPagoModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pago{selectedSeller ? ` a ${selectedSeller.name}` : ''}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-2xl border bg-muted/30 p-3 space-y-1 text-sm">
              {pendienteAnterior > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pendiente anterior al período</span>
                  <span className="font-semibold tabular-nums text-amber-600">{formatCurrency(pendienteAnterior)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pendiente del período ({pendingInRange.length})</span>
                <span className="font-semibold tabular-nums">{formatCurrency(pendingInRangeTotal)}</span>
              </div>
              <div className="flex justify-between border-t pt-1">
                <span className="font-medium">Total pendiente</span>
                <span className="font-bold tabular-nums">{formatCurrency(pendienteAnterior + pendingInRangeTotal)}</span>
              </div>
            </div>

            <div>
              <Label htmlFor="pagoMonto" className="text-xs text-muted-foreground">Monto que le pagás</Label>
              <Input
                id="pagoMonto"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={pagoMonto}
                onChange={(e) => setPagoMonto(e.target.value)}
                className="rounded-2xl mt-1"
              />
              {(() => {
                const m = Number(pagoMonto)
                if (!Number.isFinite(m)) return null
                const restante = pendienteAnterior + pendingInRangeTotal - m
                if (Math.abs(restante) < 0.01) {
                  return <p className="text-xs text-teal-600 mt-1">Cubre todo lo pendiente.</p>
                }
                return restante > 0 ? (
                  <p className="text-xs text-amber-600 mt-1">
                    Queda pendiente {formatCurrency(restante)}. Se paga desde la comisión más vieja;
                    la última que alcance queda parcial.
                  </p>
                ) : (
                  <p className="text-xs text-teal-600 mt-1">
                    Le pagás {formatCurrency(Math.abs(restante))} de más — queda a cuenta de comisiones futuras.
                  </p>
                )
              })()}
            </div>

            <div>
              <Label htmlFor="pagoFecha" className="text-xs text-muted-foreground">Fecha del pago</Label>
              <Input
                id="pagoFecha"
                type="date"
                value={pagoFecha}
                onChange={(e) => setPagoFecha(e.target.value)}
                className="rounded-2xl mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Podés poner una fecha anterior si el pago ya se hizo y no estaba registrado.
              </p>
            </div>

            <div>
              <Label htmlFor="pagoNota" className="text-xs text-muted-foreground">Nota (opcional)</Label>
              <Input
                id="pagoNota"
                value={pagoNota}
                onChange={(e) => setPagoNota(e.target.value)}
                placeholder="Ej: efectivo, transferencia..."
                className="rounded-2xl mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-2xl" onClick={() => setPagoModalOpen(false)} disabled={paying}>
              Cancelar
            </Button>
            <Button className="rounded-2xl gap-2" onClick={handleConfirmarPago} disabled={paying}>
              {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
              Confirmar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Cómo se calcula la comisión */}
      <Dialog open={calcModalOpen} onOpenChange={setCalcModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cómo se calcula lo que se le paga</DialogTitle>
          </DialogHeader>
          {selectedSeller && (
            <>
              <p className="text-xs text-muted-foreground -mt-2">
                {comDesde || comHasta
                  ? <>Desde {comDesde ? formatDate(new Date(`${comDesde}T00:00:00`)) : '—'} hasta {comHasta ? formatDate(new Date(`${comHasta}T00:00:00`)) : '—'}</>
                  : 'De todo el tiempo'}
              </p>
              <div className="space-y-3 pt-2">
                {/* Paso 1 */}
                <div className="flex items-start gap-3">
                  <span className="h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">1</span>
                  <div className="flex-1 flex items-baseline justify-between gap-2">
                    <span className="text-foreground">Vendió</span>
                    <span className="font-bold text-foreground tabular-nums">{formatCurrency(allSalesTotal)}</span>
                  </div>
                </div>
                {/* Paso 2 */}
                <div className="flex items-start gap-3">
                  <span className="h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">2</span>
                  <div className="flex-1 flex items-baseline justify-between gap-2">
                    <span className="text-foreground">Devoluciones</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">− {formatCurrency(Math.abs(devSalesTotal))}</span>
                  </div>
                </div>
                {/* Resultado ventas netas */}
                <div className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 ml-9">
                  <span className="text-foreground font-medium">Venta menos devolución</span>
                  <span className="font-bold text-foreground tabular-nums">{formatCurrency(ventasNetas)}</span>
                </div>
                {/* Paso 3 */}
                <div className="flex items-start gap-3">
                  <span className="h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">3</span>
                  <div className="flex-1 flex items-baseline justify-between gap-2">
                    <span className="text-foreground">Comisión <strong>{selectedSeller.commissionRate}%</strong></span>
                    <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{selectedSeller.commissionRate}% × {formatCurrency(ventasNetas)}</span>
                  </div>
                </div>
                {/* Resultado final */}
                <div className="flex items-center justify-between gap-2 rounded-xl bg-teal-50 dark:bg-teal-900/20 border-2 border-teal-300 dark:border-teal-800 px-4 py-3">
                  <span className="text-foreground font-bold text-lg">Se le paga</span>
                  <span className="font-bold text-2xl text-teal-600 dark:text-teal-400 tabular-nums">{formatCurrency(comisionesFinales)}</span>
                </div>
                {/* Aún sin pagar */}
                {pendingInRange.length > 0 && (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2">
                    <span className="text-foreground">
                      De eso, todavía <strong>no le pagaste</strong>
                      <span className="block text-xs text-muted-foreground">{pendingInRange.length} {pendingInRange.length === 1 ? 'venta' : 'ventas'} sin pagar</span>
                    </span>
                    <span className="font-bold text-lg text-amber-600 dark:text-amber-400 tabular-nums">{formatCurrency(pendingInRangeTotal)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Eliminar Empleado"
        description={`¿Estas seguro de eliminar a "${sellerToDelete?.name}"? Esta accion no se puede deshacer.`}
        confirmText="Eliminar"
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </MainLayout>
  )
}
