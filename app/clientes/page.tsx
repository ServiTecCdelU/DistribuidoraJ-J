'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTableSkeleton } from '@/components/ui/data-table-skeleton'
import { ClientModal } from '@/components/clientes/client-modal'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { clientsApi, sellersApi, salesApi } from '@/lib/api'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Client } from '@/lib/types'
import { formatCurrency, normalizeCuit } from '@/lib/utils/format'
import { useDebounce } from '@/hooks/use-debounce'
import {
  Plus,
  Search,
  Pencil,
  Eye,
  EyeOff,
  MoreVertical,
  Phone,
  Mail,
  MapPin,
  Users,
  Building2,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Minus,
  StickyNote,
  X,
  Loader2,
  Columns3,
  FileSpreadsheet,
  AlertTriangle,
  Ban,
  CheckCircle2,
  User,
  Wallet,
  CalendarDays,
  Printer,
} from 'lucide-react'
import { toast } from 'sonner'
import { getAuthToken } from '@/services/auth-service'
import { clasificarDeuda } from '@/lib/utils/deuda'
import { downloadBase64Pdf } from '@/services/pdf-service'

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [sellers, setSellers] = useState<{ id: string; name: string; codigoVendedor?: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 300)
  const [activoFilter, setActivoFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [sellerFilter, setSellerFilter] = useState<string>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  
  // Detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showNotes, setShowNotes] = useState(false)

  // Paginación
  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)

  // Consulta ARCA
  const [arcaDialogOpen, setArcaDialogOpen] = useState(false)
  const [arcaCuit, setArcaCuit] = useState('')
  const [arcaLoading, setArcaLoading] = useState(false)
  const [arcaDefaults, setArcaDefaults] = useState<Record<string, string> | null>(null)

  const handleConsultarArca = async () => {
    const cuitLimpio = normalizeCuit(arcaCuit)
    if (cuitLimpio.length !== 11) {
      toast.error('Ingresá un CUIT/CUIL válido de 11 dígitos')
      return
    }
    setArcaLoading(true)
    try {
      const token = await getAuthToken()
      if (!token) throw new Error('No autenticado')
      const res = await fetch(`/api/afip/cuit?cuit=${cuitLimpio}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error consultando ARCA')
        return
      }
      // Cerrar dialog ARCA y abrir modal de cliente pre-llenado
      setArcaDefaults({ name: data.nombre || '', address: data.domicilio || '', taxCategory: data.categoriaFiscal || 'consumidor_final', cuit: arcaCuit })
      setArcaDialogOpen(false)
      setArcaCuit('')
      setEditingClient(null)
      setModalOpen(true)
      toast.success(`Datos cargados desde ARCA${data.estadoClave ? ` — ${data.estadoClave}` : ''}`)
    } catch (e: any) {
      toast.error(e.message || 'Error consultando ARCA')
    } finally {
      setArcaLoading(false)
    }
  }

  const loadClients = async (isMounted?: () => boolean) => {
    try {
      const data = await clientsApi.getAll()
      if (isMounted && !isMounted()) return
      setClients(data)
    } catch (error) {
      if (isMounted && !isMounted()) return
      toast.error('Error al cargar los clientes')
    } finally {
      if (isMounted && !isMounted()) return
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    loadClients(() => mounted)
    sellersApi.getAll().then((data) =>
      setSellers(data.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name, codigoVendedor: s.codigoVendedor })))
    )
    return () => { mounted = false }
  }, [])

  // Visibilidad de columnas (persistida en localStorage)
  const COLS_KEY = 'clientes_columnas_visibles'
  const [visibleCols, setVisibleCols] = useState({
    cuit: true,
    categoria: true,
    saldo: true,
    codigoVendedor: false,
  })
  const [colsLoaded, setColsLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY)
      if (raw) setVisibleCols((prev) => ({ ...prev, ...JSON.parse(raw) }))
    } catch {}
    setColsLoaded(true)
  }, [])

  useEffect(() => {
    if (!colsLoaded) return
    try { localStorage.setItem(COLS_KEY, JSON.stringify(visibleCols)) } catch {}
  }, [visibleCols, colsLoaded])

  const toggleCol = (key: keyof typeof visibleCols) =>
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }))

  const [exporting, setExporting] = useState(false)

  // Impresión PDF de clientes
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [printCodigo, setPrintCodigo] = useState<string>('all')
  const [printOrder, setPrintOrder] = useState<'nombre' | 'diaCobro' | 'saldo' | 'codigo'>('nombre')
  const PRINT_COLS_KEY = 'clientes_print_columnas'
  const [printCols, setPrintCols] = useState({
    cuit: false,
    categoria: false,
    telefono: true,
    direccion: true,
    codigoVendedor: true,
    diaCobro: true,
    saldo: true,
  })
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRINT_COLS_KEY)
      if (raw) setPrintCols((prev) => ({ ...prev, ...JSON.parse(raw) }))
    } catch {}
  }, [])
  const togglePrintCol = (key: keyof typeof printCols) =>
    setPrintCols((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(PRINT_COLS_KEY, JSON.stringify(next)) } catch {}
      return next
    })

  const [printing, setPrinting] = useState(false)
  const handlePrintClientes = async () => {
    if (printing) return
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] as string))
    // Filtrar por código de vendedor
    let list = clients.filter((c) => {
      if (printCodigo === 'all') return true
      if (printCodigo === 'none') return !c.sellerId || !sellerCodigoById.get(c.sellerId)
      return c.sellerId ? sellerCodigoById.get(c.sellerId) === printCodigo : false
    })
    if (list.length === 0) { toast.error('No hay clientes para imprimir'); return }

    const diaLabel = (d?: string) => d ? d.charAt(0).toUpperCase() + d.slice(1) : '—'
    // Ordenar
    list = [...list].sort((a, b) => {
      switch (printOrder) {
        case 'saldo': return (b.currentBalance || 0) - (a.currentBalance || 0)
        case 'codigo': {
          const ca = a.sellerId ? (sellerCodigoById.get(a.sellerId) || '') : ''
          const cb = b.sellerId ? (sellerCodigoById.get(b.sellerId) || '') : ''
          return ca.localeCompare(cb, undefined, { numeric: true }) || a.name.localeCompare(b.name)
        }
        case 'diaCobro': {
          const orden = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
          const ia = a.diaCobro ? orden.indexOf(a.diaCobro) : 99
          const ib = b.diaCobro ? orden.indexOf(b.diaCobro) : 99
          return ia - ib || a.name.localeCompare(b.name)
        }
        default: return a.name.localeCompare(b.name)
      }
    })

    const cols: { key: string; label: string; align?: string }[] = [{ key: 'nombre', label: 'Cliente' }]
    if (printCols.codigoVendedor) cols.push({ key: 'codigoVendedor', label: 'Cód. Vend.' })
    if (printCols.cuit) cols.push({ key: 'cuit', label: 'CUIT' })
    if (printCols.categoria) cols.push({ key: 'categoria', label: 'Categoría' })
    if (printCols.telefono) cols.push({ key: 'telefono', label: 'Teléfono' })
    if (printCols.direccion) cols.push({ key: 'direccion', label: 'Dirección' })
    if (printCols.diaCobro) cols.push({ key: 'diaCobro', label: 'Día de pago', align: 'center' })
    if (printCols.saldo) cols.push({ key: 'saldo', label: 'Saldo', align: 'right' })

    const cellValue = (c: Client, key: string): string => {
      switch (key) {
        case 'nombre': return esc(c.name) + (c.activo === false ? ' <span style="color:#b91c1c;font-weight:600">(Desactivado)</span>' : '')
        case 'codigoVendedor': return esc(c.sellerId ? (sellerCodigoById.get(c.sellerId) || '—') : '—')
        case 'cuit': return esc(c.cuit || '—')
        case 'categoria': return esc(formatTaxCategory(c.taxCategory))
        case 'telefono': return esc(c.phone || '—')
        case 'direccion': return esc(c.address || '—')
        case 'diaCobro': return esc(diaLabel(c.diaCobro))
        case 'saldo': return esc(formatCurrency(c.currentBalance || 0))
        default: return ''
      }
    }

    const codigoTitulo = printCodigo === 'all'
      ? 'Todos los vendedores'
      : printCodigo === 'none'
      ? 'Sin vendedor asignado'
      : (codigoOptions.find((c) => c.codigo === printCodigo)?.names.join(', ') || printCodigo)
    const fecha = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())

    const thead = cols.map((c) => `<th style="text-align:${c.align || 'left'}">${c.label}</th>`).join('')
    const tbody = list.map((c) =>
      `<tr>${cols.map((col) => `<td style="text-align:${col.align || 'left'}">${cellValue(c, col.key)}</td>`).join('')}</tr>`
    ).join('')

    const html = `<!doctype html><html><head><meta charset="utf-8">
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 14mm; }
        h1 { font-size: 15px; margin: 0 0 14px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #0d9488; color: #fff; padding: 6px 8px; text-align: left; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) td { background: #f8fafc; }
        .count { font-size: 12px; color: #555; margin-top: 12px; }
      </style></head><body>
      <h1>Listado de Clientes · ${esc(codigoTitulo)} · ${fecha}</h1>
      <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
      <div class="count">Total: ${list.length} cliente(s)</div>
      </body></html>`

    setPrinting(true)
    const toastId = toast.loading('Generando PDF...')
    try {
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, filename: 'clientes.pdf', pageNumbers: true }),
      })
      const data = await res.json()
      if (!res.ok || !data?.pdf) throw new Error(data?.error || 'Error generando PDF')
      downloadBase64Pdf(data.pdf, `clientes_${new Date().toISOString().slice(0, 10)}.pdf`)
      toast.success(`${list.length} clientes impresos`, { id: toastId })
      setPrintDialogOpen(false)
    } catch {
      toast.error('Error al generar el PDF', { id: toastId })
    } finally {
      setPrinting(false)
    }
  }

  const formatTaxCategoryFull = (category: Client['taxCategory']) => {
    switch (category) {
      case 'responsable_inscripto': return 'Responsable Inscripto'
      case 'monotributo': return 'Monotributo'
      case 'consumidor_final': return 'Consumidor Final'
      case 'exento': return 'Exento'
      case 'no_responsable': return 'No Responsable'
      default: return 'Consumidor Final'
    }
  }

  const handleExportExcel = async () => {
    if (exporting) return
    if (filteredClients.length === 0) {
      toast.error('No hay clientes para exportar')
      return
    }
    setExporting(true)
    try {
      // Contar compras por cliente
      const purchasesByClient = new Map<string, number>()
      try {
        const sales = await salesApi.getAll()
        for (const s of sales) {
          if (!s.clientId) continue
          purchasesByClient.set(s.clientId, (purchasesByClient.get(s.clientId) || 0) + 1)
        }
      } catch {
        toast.error('No se pudo contar las compras; se exporta sin ese dato')
      }

      const XLSX = (await import('xlsx-js-style')).default ?? (await import('xlsx-js-style'))

      const headers = [
        'Nombre', 'Código', 'Dirección', 'CUIT', 'Teléfono', 'Correo',
        'Categoría Fiscal', 'Vendedor', 'Saldo C.C.', 'Estado', 'Compras', 'Notas',
      ]
      // Columnas (0-based): Saldo=8 (money), Compras=10 (centrado), Código=1 y CUIT=3 centrados
      const MONEY_COLS = new Set([8])
      const CENTER_COLS = new Set([1, 3, 9, 10])

      // Estado por clasificación de deuda -> etiqueta + color de fondo/texto
      const estadoInfo = (c: Client): { label: string; bg: string; fg: string } => {
        const clasif = (c.currentBalance || 0) > 0 ? clasificarDeuda(c.debtSince) : 'normal'
        switch (clasif) {
          case 'incobrable': return { label: 'Incobrable', bg: 'FEE2E2', fg: '991B1B' }
          case 'moroso': return { label: 'Moroso', bg: 'FFEDD5', fg: '9A3412' }
          case 'atrasado': return { label: 'Atrasado', bg: 'FEF9C3', fg: '854D0E' }
          default: return { label: 'Al día', bg: 'DCFCE7', fg: '166534' }
        }
      }

      const dataRows = filteredClients.map((c) => {
        const balance = c.currentBalance || 0
        const vendedor = c.sellerId ? (sellerNameById.get(c.sellerId) || 'Vendedor') : 'Sin vendedor'
        return [
          c.name || '',
          c.codigo || '',
          c.address || '',
          c.cuit || '',
          c.phone || '',
          c.email || '',
          formatTaxCategoryFull(c.taxCategory),
          vendedor,
          balance,
          estadoInfo(c).label,
          purchasesByClient.get(c.id) || 0,
          c.notes || '',
        ]
      })

      const aoa = [headers, ...dataRows]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      const lastRow = aoa.length

      ws['!cols'] = [
        { wch: 30 }, { wch: 12 }, { wch: 34 }, { wch: 16 }, { wch: 16 }, { wch: 28 },
        { wch: 20 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 40 },
      ]
      ws['!autofilter'] = { ref: `A1:L${lastRow}` }
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' } as any

      const MONEY_FMT = '"$ "#,##0.00'
      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
        fill: { fgColor: { rgb: '0D9488' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: { bottom: { style: 'thin', color: { rgb: '0B7C72' } } },
      }
      const range = XLSX.utils.decode_range(ws['!ref'] as string)
      for (let R = range.s.r; R <= range.e.r; R++) {
        const isHeader = R === 0
        for (let C = range.s.c; C <= range.e.c; C++) {
          const ref = XLSX.utils.encode_cell({ r: R, c: C })
          const cell = ws[ref]
          if (!cell) continue
          if (isHeader) { cell.s = headerStyle; continue }
          const money = MONEY_COLS.has(C)
          if (money) cell.z = MONEY_FMT
          const style: any = {
            alignment: {
              horizontal: money ? 'right' : CENTER_COLS.has(C) ? 'center' : 'left',
              vertical: 'center',
              wrapText: C === 11,
            },
          }
          if (C === 9) {
            const est = estadoInfo(filteredClients[R - 1])
            style.fill = { fgColor: { rgb: est.bg } }
            style.font = { bold: true, color: { rgb: est.fg } }
          }
          cell.s = style
        }
      }
      ws['!rows'] = [{ hpt: 22 }]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
      const fileName = `clientes_${new Date().toISOString().slice(0, 10)}.xlsx`
      XLSX.writeFile(wb, fileName)
      toast.success(`${filteredClients.length} clientes exportados`)
    } catch (e: any) {
      toast.error('Error al exportar la lista')
    } finally {
      setExporting(false)
    }
  }

  const handleCreate = () => {
    setEditingClient(null)
    setModalOpen(true)
  }

  const handleEdit = (client: Client) => {
    setEditingClient(client)
    setModalOpen(true)
  }

  const handleViewDetail = (client: Client) => {
    setSelectedClient(client)
    setShowNotes(false)
    setDetailModalOpen(true)
  }

  const [togglingActivo, setTogglingActivo] = useState(false)
  const handleToggleActivo = async (client: Client) => {
    if (togglingActivo) return
    const nuevoActivo = client.activo === false
    setTogglingActivo(true)
    try {
      const updated = await clientsApi.update(client.id, { activo: nuevoActivo })
      setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setSelectedClient((prev) => (prev && prev.id === updated.id ? updated : prev))
      toast.success(nuevoActivo ? 'Cliente activado' : 'Cliente desactivado')
    } catch {
      toast.error('Error al cambiar el estado del cliente')
    } finally {
      setTogglingActivo(false)
    }
  }

  // Asigna el cliente a un código de vendedor (vía el vendedor representante de ese código)
  const handleAssignByCodigo = async (codigo: string) => {
    if (!selectedClient) return
    const repId = codigo ? (sellers.find((s) => (s.codigoVendedor || '').trim() === codigo)?.id || '') : ''
    try {
      const updated = await clientsApi.update(selectedClient.id, { sellerId: repId || undefined })
      setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setSelectedClient(updated)
      toast.success(codigo ? `Asignado a código ${codigo}` : 'Código quitado')
    } catch {
      toast.error('Error al asignar el código')
    }
  }

  // Cambia el día de visita/cobro del cliente desde el detalle
  const handleAssignDiaCobro = async (dia: string) => {
    if (!selectedClient) return
    try {
      const updated = await clientsApi.update(selectedClient.id, { diaCobro: dia || undefined })
      setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setSelectedClient(updated)
      toast.success(dia ? 'Día de pago actualizado' : 'Día de pago quitado')
    } catch {
      toast.error('Error al cambiar el día de pago')
    }
  }

  const handleSave = async (clientData: Omit<Client, 'id' | 'createdAt' | 'currentBalance'>) => {
    try {
      if (editingClient) {
        const updated = await clientsApi.update(editingClient.id, clientData)
        setClients(clients.map(c => c.id === editingClient.id ? updated : c))
        toast.success('Cliente actualizado correctamente')
      } else {
        const newClient = await clientsApi.create(clientData)
        setClients([newClient, ...clients])
        toast.success('Cliente creado correctamente')
      }
      setModalOpen(false)
    } catch (error) {
      toast.error('Error al guardar el cliente')
    }
  }

  const sellerNameById = useMemo(() => new Map(sellers.map((s) => [s.id, s.name])), [sellers])
  const sellerCodigoById = useMemo(() => new Map(sellers.map((s) => [s.id, (s.codigoVendedor || '').trim()])), [sellers])

  // Opciones de filtro por código de vendedor (un código puede compartirse entre varios vendedores)
  const codigoOptions = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const s of sellers) {
      const cod = (s.codigoVendedor || '').trim()
      if (!cod) continue
      const arr = map.get(cod) ?? []
      arr.push(s.name)
      map.set(cod, arr)
    }
    return Array.from(map.entries())
      .map(([codigo, names]) => ({ codigo, names }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
  }, [sellers])

  const filteredClients = clients.filter(client => {
    const query = debouncedSearch.toLowerCase()
    const queryDigits = normalizeCuit(debouncedSearch)
    const cuitDigits = normalizeCuit(client.cuit)
    const dniDigits = normalizeCuit(client.dni)
    const matchesSearch =
      (client.dni?.toLowerCase().includes(query) ?? false) ||
      (client.cuit?.toLowerCase().includes(query) ?? false) ||
      client.name.toLowerCase().includes(query) ||
      (queryDigits.length > 0 && (cuitDigits.includes(queryDigits) || dniDigits.includes(queryDigits)))
    const matchesActivo =
      activoFilter === 'all' ||
      (activoFilter === 'active' ? client.activo !== false : client.activo === false)
    const clientCodigo = client.sellerId ? (sellerCodigoById.get(client.sellerId) || '') : ''
    const matchesSeller =
      sellerFilter === 'all' ||
      (sellerFilter === 'none' ? !clientCodigo : clientCodigo === sellerFilter)
    return matchesSearch && matchesActivo && matchesSeller
  })

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1) }, [debouncedSearch, activoFilter, sellerFilter])

  const pagedClients = useMemo(
    () => filteredClients.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredClients, currentPage, pageSize]
  )

  const formatTaxCategory = (category: Client['taxCategory']) => {
    switch (category) {
      case 'responsable_inscripto':
        return 'Resp. Inscripto'
      case 'monotributo':
        return 'Monotributo'
      case 'consumidor_final':
        return 'Cons. Final'
      case 'exento':
        return 'Exento'
      case 'no_responsable':
        return 'No Responsable'
      default:
        return 'Cons. Final'
    }
  }

  const getCategoryColor = (category: Client['taxCategory']) => {
    switch (category) {
      case 'responsable_inscripto':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
      case 'monotributo':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
      case 'consumidor_final':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
      case 'exento':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
      case 'no_responsable':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
    }
  }

  const getDebtIndicator = (balance: number | undefined | null, limit: number | undefined | null) => {
    const safeBalance = balance ?? 0
    const safeLimit = limit ?? 0
    if (safeBalance === 0) {
      return { 
        color: 'text-emerald-600 dark:text-emerald-400', 
        bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
        borderColor: 'border-emerald-200 dark:border-emerald-800',
        icon: Minus,
        label: 'Sin deuda' 
      }
    }
    const ratio = safeLimit > 0 ? safeBalance / safeLimit : 1
    if (ratio < 0.5) {
      return { 
        color: 'text-amber-600 dark:text-amber-400', 
        bgColor: 'bg-amber-50 dark:bg-amber-900/20',
        borderColor: 'border-amber-200 dark:border-amber-800',
        icon: TrendingUp,
        label: 'Deuda moderada' 
      }
    }
    return { 
      color: 'text-red-600 dark:text-red-400', 
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-200 dark:border-red-800',
      icon: TrendingDown,
      label: 'Deuda alta' 
    }
  }

  // Estado de cuenta del cliente: combina clasificación de deuda y saldo
  const getAccountStatus = (client: Client) => {
    const balance = client.currentBalance || 0
    if (client.debtClassification === 'incobrable') {
      return { label: 'Incobrable', icon: Ban, className: 'bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-800' }
    }
    if (client.debtClassification === 'moroso') {
      return { label: 'Moroso', icon: AlertTriangle, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800' }
    }
    if (balance > 0) {
      return { label: 'Con deuda', icon: TrendingUp, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800' }
    }
    return { label: 'Al día', icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' }
  }

  // Stats
  const totalClients = clients.length
  const totalDebt = clients.reduce((sum, c) => sum + (c.currentBalance || 0), 0)
  const clientsWithDebt = clients.filter(c => c.currentBalance > 0).length

  return (
    <MainLayout allowedRoles={['admin']} title="Clientes" description="Gestiona tus clientes y sus cuentas corrientes">
      {/* Stats Cards - Solo visible en desktop */}
      <div className="hidden lg:grid grid-cols-3 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Clientes</p>
                <p className="text-2xl font-bold text-foreground">{totalClients}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Deuda Total</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalDebt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-rose-500/5 to-rose-500/10 border-rose-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10">
                <TrendingUp className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Con Deuda</p>
                <p className="text-2xl font-bold text-foreground">{clientsWithDebt} <span className="text-sm font-normal text-muted-foreground">clientes</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header Actions - Desktop */}
      <div className="hidden md:flex flex-col gap-3 mb-6">
        {/* Fila 1: buscador grande + Nuevo Cliente */}
        <div className="flex flex-row gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, DNI o CUIT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-12 text-base bg-background"
            />
          </div>
          <Button onClick={handleCreate} className="gap-2 shadow-sm h-12 shrink-0">
            <Plus className="h-4 w-4" />
            Nuevo Cliente
          </Button>
        </div>
        {/* Fila 2: filtros y acciones */}
        <div className="flex flex-row gap-3 flex-wrap">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={activoFilter}
            onChange={(e) => setActivoFilter(e.target.value as typeof activoFilter)}
          >
            <option value="all">Todos los clientes</option>
            <option value="active">Clientes activados</option>
            <option value="inactive">Clientes desactivados</option>
          </select>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
          >
            <option value="all">Todos los códigos</option>
            <option value="none">Sin código</option>
            {codigoOptions.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                Cód. {c.codigo} — {c.names.join(', ')}
              </option>
            ))}
          </select>
          {/* <Button variant="outline" onClick={() => setArcaDialogOpen(true)} className="gap-2">
            <Search className="h-4 w-4" />
            Consultar ARCA
          </Button> */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Columns3 className="h-4 w-4" />
                Columnas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Mostrar columnas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={visibleCols.cuit} onCheckedChange={() => toggleCol('cuit')} onSelect={(e) => e.preventDefault()}>
                CUIT
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={visibleCols.categoria} onCheckedChange={() => toggleCol('categoria')} onSelect={(e) => e.preventDefault()}>
                Categoría
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={visibleCols.saldo} onCheckedChange={() => toggleCol('saldo')} onSelect={(e) => e.preventDefault()}>
                Saldo
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={visibleCols.codigoVendedor} onCheckedChange={() => toggleCol('codigoVendedor')} onSelect={(e) => e.preventDefault()}>
                Código de vendedor
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={() => setPrintDialogOpen(true)} className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimir clientes
          </Button>
          <Button variant="outline" onClick={handleExportExcel} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Excel de Clientes
          </Button>
        </div>
      </div>

      {/* Header Actions - Mobile */}
      <div className="flex md:hidden flex-col gap-3 mb-4">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-background"
          />
        </div>
        <div className="flex gap-2">
          <select
            className="h-10 flex-1 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={activoFilter}
            onChange={(e) => setActivoFilter(e.target.value as typeof activoFilter)}
          >
            <option value="all">Todos los clientes</option>
            <option value="active">Activados</option>
            <option value="inactive">Desactivados</option>
          </select>
          <select
            className="h-10 flex-1 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
          >
            <option value="all">Todos los códigos</option>
            <option value="none">Sin código</option>
            {codigoOptions.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                Cód. {c.codigo} — {c.names.join(', ')}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPrintDialogOpen(true)} className="gap-2 flex-1">
            <Printer className="h-4 w-4" />
            Imprimir clientes
          </Button>
          <Button variant="outline" onClick={handleExportExcel} disabled={exporting} className="gap-2 flex-1">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Excel de Clientes
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <>
          <div className="hidden md:block">
            <DataTableSkeleton columns={7} rows={5} />
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
          {filteredClients.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <Users className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">No se encontraron clientes</h3>
                <p className="text-muted-foreground text-sm text-center mb-6 max-w-sm">
                  {searchQuery || activoFilter !== 'all'
                    ? 'Intenta ajustar los filtros de busqueda para encontrar lo que buscas'
                    : 'Comienza agregando tu primer cliente para gestionar sus cuentas corrientes'}
                </p>
                {!searchQuery && activoFilter === 'all' && (
                  <Button onClick={handleCreate} className="gap-2" size="lg">
                    <Plus className="h-5 w-5" />
                    Agregar Primer Cliente
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
                        <th className="text-left p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-12">#</th>
                        <th className="text-left p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Cliente</th>
                        <th className="text-left p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Código</th>
                        {visibleCols.cuit && <th className="text-left p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">CUIT</th>}
                        {visibleCols.categoria && <th className="text-left p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Categoria</th>}
                        {visibleCols.codigoVendedor && <th className="text-left p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Cód. Vendedor</th>}
                        <th className="text-left p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Contacto</th>
                        {visibleCols.saldo && <th className="text-right p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Saldo</th>}
                        <th className="text-center p-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pagedClients.map((client, idx) => {
                        const debt = getDebtIndicator(client.currentBalance || 0, client.creditLimit || 0)
                        const DebtIcon = debt.icon
                        return (
                          <tr key={client.id} className="hover:bg-muted/40 transition-colors group">
                            <td className="p-4 text-sm text-muted-foreground">
                              {(currentPage - 1) * pageSize + idx + 1}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-foreground truncate">{client.name}</p>
                                    {client.activo === false && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800 shrink-0">
                                        <Ban className="h-3 w-3" />
                                        Desactivado
                                      </span>
                                    )}
                                    {client.notes && (
                                      <StickyNote className="h-3.5 w-3.5 text-amber-500" />
                                    )}
                                  </div>
                                  {client.address && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                      <MapPin className="h-3 w-3 shrink-0" />
                                      {client.address}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="font-mono text-sm text-muted-foreground">{client.codigo || '-'}</span>
                            </td>
                            {visibleCols.cuit && (
                              <td className="p-4">
                                <span className="font-mono text-sm text-foreground bg-muted px-2 py-1 rounded">
                                  {client.cuit || '-'}
                                </span>
                              </td>
                            )}
                            {visibleCols.categoria && (
                              <td className="p-4">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getCategoryColor(client.taxCategory)}`}>
                                  {formatTaxCategory(client.taxCategory)}
                                </span>
                              </td>
                            )}
                            {visibleCols.codigoVendedor && (
                              <td className="p-4">
                                <div className="min-w-0">
                                  <p className="font-mono text-sm text-foreground">
                                    {(client.sellerId && sellerCodigoById.get(client.sellerId)) || '-'}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {(client.sellerId && sellerNameById.get(client.sellerId)) || '-'}
                                  </p>
                                </div>
                              </td>
                            )}
                            <td className="p-4">
                              <div className="space-y-1">
                                {client.email && (
                                  <p className="text-sm text-foreground flex items-center gap-1.5">
                                    <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="truncate max-w-[120px] sm:max-w-[180px]">{client.email}</span>
                                  </p>
                                )}
                                {client.phone && (
                                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                    <Phone className="h-3 w-3 shrink-0" />
                                    {client.phone}
                                  </p>
                                )}
                                {!client.email && !client.phone && (
                                  <span className="text-sm text-muted-foreground">-</span>
                                )}
                              </div>
                            </td>
                            {visibleCols.saldo && (
                              <td className="p-4 text-right">
                                <div className="flex flex-col items-end gap-1">
                                  <div className={`flex items-center gap-1.5 font-semibold ${debt.color}`}>
                                    <DebtIcon className="h-4 w-4" />
                                    {formatCurrency(client.currentBalance || 0)}
                                  </div>
                                  {(client.currentBalance || 0) > 0 && (client.creditLimit || 0) > 0 && (
                                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          ((client.currentBalance || 0) / (client.creditLimit || 1)) < 0.5
                                            ? 'bg-amber-500'
                                            : 'bg-red-500'
                                        }`}
                                        style={{ width: `${Math.min(((client.currentBalance || 0) / (client.creditLimit || 1)) * 100, 100)}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </td>
                            )}
                            <td className="p-4">
                              <div className="flex justify-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                                  onClick={() => handleViewDetail(client)}
                                >
                                  <Eye className="h-4 w-4" />
                                  <span className="sr-only">Ver detalle</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-600"
                                  onClick={() => handleEdit(client)}
                                >
                                  <Pencil className="h-4 w-4" />
                                  <span className="sr-only">Editar</span>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile List (tabla 2 filas) */}
              <div className="md:hidden border border-border rounded-2xl overflow-hidden bg-card shadow-sm divide-y divide-border" style={{ fontSize: '12px' }}>
                {/* Encabezado de columnas */}
                <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_5rem_6rem] gap-x-2 px-3 py-1.5 bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>#</span>
                  <span>Cliente</span>
                  <span className="text-center">Código</span>
                  <span className="text-right">C.C.</span>
                </div>
                {pagedClients.map((client, idx) => {
                  const debt = getDebtIndicator(client.currentBalance || 0, client.creditLimit || 0)
                  const vendedor = client.sellerId ? (sellerNameById.get(client.sellerId) || 'Vendedor') : 'Sin vendedor'
                  return (
                    <div
                      key={client.id}
                      className="px-3 py-2 active:bg-muted/50 transition-colors"
                      onClick={() => handleViewDetail(client)}
                    >
                      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_5rem_6rem] gap-x-2 items-start leading-tight">
                        {/* Col número */}
                        <span className="text-[11px] text-muted-foreground pt-0.5">{(currentPage - 1) * pageSize + idx + 1}</span>
                        {/* Col 1: cliente / vendedor */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="font-semibold text-xs text-foreground truncate">{client.name}</p>
                            {client.activo === false && <Ban className="h-3 w-3 text-red-500 shrink-0" />}
                            {client.notes && <StickyNote className="h-3 w-3 text-amber-500 shrink-0" />}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{vendedor}</p>
                        </div>
                        {/* Col 2: código / dato fiscal */}
                        <div className="text-center min-w-0">
                          <p className="text-[11px] font-mono text-muted-foreground truncate">{client.codigo || '—'}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{formatTaxCategory(client.taxCategory)}</p>
                        </div>
                        {/* Col 3: cuenta corriente */}
                        <div className="text-right">
                          <span className={`text-xs font-semibold whitespace-nowrap ${debt.color}`}>{formatCurrency(client.currentBalance || 0)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Pagination controls */}
              {filteredClients.length > pageSize && (
                <div className="flex items-center justify-between px-2 pb-6 md:pb-0 mt-4">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredClients.length)} de {filteredClients.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                      <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n} por página</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Anterior</Button>
                    <span className="text-sm text-muted-foreground">{currentPage}/{Math.ceil(filteredClients.length / pageSize)}</span>
                    <Button variant="outline" size="sm" disabled={currentPage >= Math.ceil(filteredClients.length / pageSize)} onClick={() => setCurrentPage(p => p + 1)}>Siguiente</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* FAB for Mobile */}
      <div className="md:hidden fixed bottom-6 right-6 z-50">
        <Button
          onClick={handleCreate}
          className="h-12 w-12 sm:h-14 sm:w-14 rounded-full shadow-lg shadow-primary/25"
          size="icon"
        >
          <Plus className="h-6 w-6" />
          <span className="sr-only">Nuevo Cliente</span>
        </Button>
      </div>

      {/* Client Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedClient && (
                <>
                  <div>
                    <p className="font-semibold">
                      {selectedClient.name}
                      {selectedClient.codigo && <span className="ml-2 text-sm font-mono font-normal text-muted-foreground">{selectedClient.codigo}</span>}
                    </p>
                    <p className="text-sm font-normal text-muted-foreground">{selectedClient.cuit}</p>
                  </div>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {selectedClient && (
            <div className="space-y-4 pt-2">
              {/* Badges: categoría, estado de cuenta y cuenta corriente */}
              <div className="flex flex-wrap gap-2">
                {selectedClient.activo === false && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
                    <Ban className="h-3 w-3 mr-1" />
                    Cliente desactivado
                  </span>
                )}
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getCategoryColor(selectedClient.taxCategory)}`}>
                  <Building2 className="h-3 w-3 mr-1" />
                  {formatTaxCategory(selectedClient.taxCategory)}
                </span>
                {(() => {
                  const st = getAccountStatus(selectedClient)
                  const StIcon = st.icon
                  return (
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${st.className}`}>
                      <StIcon className="h-3 w-3 mr-1" />
                      {st.label}
                    </span>
                  )
                })()}
                {(selectedClient.creditLimit || 0) > 0 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    <Wallet className="h-3 w-3 mr-1" />
                    En cuenta corriente
                  </span>
                )}
              </div>

              {/* Contact Info */}
              <div className="space-y-2">
                {selectedClient.phone && (
                  <a 
                    href={`tel:${selectedClient.phone}`}
                    className="flex items-center gap-3 text-sm p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedClient.phone}</span>
                  </a>
                )}
                {selectedClient.email && (
                  <a 
                    href={`mailto:${selectedClient.email}`}
                    className="flex items-center gap-3 text-sm p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{selectedClient.email}</span>
                  </a>
                )}
                {selectedClient.address && (
                  <div className="flex items-center gap-3 text-sm p-2 rounded-lg text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{selectedClient.address}</span>
                  </div>
                )}
              </div>

              {/* Saldo */}
              {(() => {
                const debt = getDebtIndicator(selectedClient.currentBalance || 0, selectedClient.creditLimit || 0)
                const DebtIcon = debt.icon
                return (
                  <div className={`rounded-xl p-4 ${debt.bgColor} border ${debt.borderColor}`}>
                    <div>
                      <p className="text-xs text-muted-foreground">Saldo Deuda</p>
                      <div className={`flex items-center gap-1.5 ${debt.color}`}>
                        <DebtIcon className="h-4 w-4" />
                        <p className="font-bold text-xl">{formatCurrency(selectedClient.currentBalance || 0)}</p>
                      </div>
                    </div>
                    {(selectedClient.currentBalanceMayorista || 0) > 0 && (
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                        <p className="text-xs text-muted-foreground">Saldo mayorista</p>
                        <p className="font-semibold text-foreground">{formatCurrency(selectedClient.currentBalanceMayorista || 0)}</p>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Código de vendedor asignado (editable) */}
              <div className="flex items-center gap-3 text-sm p-2 rounded-lg bg-muted/40">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground shrink-0">Código:</span>
                <select
                  className="flex h-9 w-full rounded-2xl border border-input bg-background px-3 text-sm"
                  value={selectedClient.sellerId ? (sellerCodigoById.get(selectedClient.sellerId) || '') : ''}
                  onChange={(e) => handleAssignByCodigo(e.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {codigoOptions.map((c) => (
                    <option key={c.codigo} value={c.codigo}>
                      Cód. {c.codigo} — {c.names.join(', ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Día de pago (editable) */}
              <div className="flex items-center gap-3 text-sm p-2 rounded-lg bg-muted/40">
                <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground shrink-0">Día de pago:</span>
                <select
                  className="flex h-9 w-full rounded-2xl border border-input bg-background px-3 text-sm"
                  value={selectedClient.diaCobro || ''}
                  onChange={(e) => handleAssignDiaCobro(e.target.value)}
                >
                  <option value="">Sin asignar</option>
                  <option value="lunes">Lunes</option>
                  <option value="martes">Martes</option>
                  <option value="miercoles">Miércoles</option>
                  <option value="jueves">Jueves</option>
                  <option value="viernes">Viernes</option>
                  <option value="sabado">Sábado</option>
                  <option value="domingo">Domingo</option>
                </select>
              </div>

              {/* Private Notes */}
              {selectedClient.notes && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowNotes(!showNotes)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <StickyNote className="h-4 w-4 text-amber-500" />
                      Observaciones Privadas
                    </div>
                    {showNotes ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {showNotes && (
                    <div className="px-3 pb-3">
                      <p className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-900/20 p-2 rounded border border-amber-200 dark:border-amber-800">
                        {selectedClient.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 bg-transparent"
                  onClick={() => {
                    setDetailModalOpen(false)
                    handleEdit(selectedClient)
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
              {/* Activar / Desactivar */}
              {selectedClient.activo === false ? (
                <Button
                  variant="outline"
                  className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                  disabled={togglingActivo}
                  onClick={() => handleToggleActivo(selectedClient)}
                >
                  {togglingActivo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Activar cliente
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                  disabled={togglingActivo}
                  onClick={() => handleToggleActivo(selectedClient)}
                >
                  {togglingActivo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Ban className="h-4 w-4 mr-2" />}
                  Desactivar cliente
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Client Modal (Create/Edit) */}
      <ClientModal
        open={modalOpen}
        onOpenChange={(open) => { setModalOpen(open); if (!open) setArcaDefaults(null) }}
        client={editingClient}
        onSave={handleSave}
        defaultValues={arcaDefaults ?? undefined}
        sellers={sellers}
      />

      {/* Dialog Imprimir Clientes */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-primary" />
              Imprimir clientes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Vendedor / código */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Vendedor</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={printCodigo}
                onChange={(e) => setPrintCodigo(e.target.value)}
              >
                <option value="all">Todos los vendedores</option>
                <option value="none">Sin código</option>
                {codigoOptions.map((c) => (
                  <option key={c.codigo} value={c.codigo}>Cód. {c.codigo} — {c.names.join(', ')}</option>
                ))}
              </select>
            </div>

            {/* Columnas a mostrar */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Qué mostrar</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['codigoVendedor', 'Cód. vendedor'],
                  ['cuit', 'CUIT'],
                  ['categoria', 'Categoría'],
                  ['telefono', 'Teléfono'],
                  ['direccion', 'Dirección'],
                  ['diaCobro', 'Día de pago'],
                  ['saldo', 'Saldo'],
                ] as [keyof typeof printCols, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm p-2 rounded-lg border border-border cursor-pointer hover:bg-muted/40">
                    <input type="checkbox" checked={printCols[key]} onChange={() => togglePrintCol(key)} className="accent-primary h-4 w-4" />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">El nombre del cliente se muestra siempre.</p>
            </div>

            {/* Orden */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Ordenar por</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={printOrder}
                onChange={(e) => setPrintOrder(e.target.value as typeof printOrder)}
              >
                <option value="nombre">Nombre (A-Z)</option>
                <option value="diaCobro">Día de pago</option>
                <option value="saldo">Saldo (mayor a menor)</option>
                <option value="codigo">Código de vendedor</option>
              </select>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setPrintDialogOpen(false)} disabled={printing}>Cancelar</Button>
              <Button onClick={handlePrintClientes} disabled={printing} className="gap-2">
                {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Imprimir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Consultar ARCA */}
      <Dialog open={arcaDialogOpen} onOpenChange={(open) => { setArcaDialogOpen(open); if (!open) setArcaCuit('') }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              Consultar en ARCA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Ingresá el CUIT o CUIL para buscar los datos fiscales del contribuyente.
            </p>
            <div className="space-y-2">
              <Input
                placeholder="20-12345678-9"
                value={arcaCuit}
                onChange={(e) => setArcaCuit(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConsultarArca()}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setArcaDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleConsultarArca} disabled={arcaLoading} className="gap-2">
                {arcaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </MainLayout>
  )
}
