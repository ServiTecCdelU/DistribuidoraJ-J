// services/admin-insights-service.ts
// Analítica para el panel admin: morosidad, reposición, rentabilidad,
// clientes inactivos y resumen del día. La lógica de cálculo vive en
// lib/utils/admin-insights.ts (pura, testeada); acá solo se trae la data.
import { supabase } from '@/lib/supabase'
import {
  calcularAging,
  calcularVelocidad,
  calcularReposicion,
  calcularRentabilidad,
  estimarCosto,
  calcularInactividad,
  resumirVentasDia,
  diasEntre,
  type AgingBuckets,
  type TxLite,
  type ResultadoRentabilidad,
  type ResumenDia,
} from '@/lib/utils/admin-insights'

const DIA_MS = 24 * 60 * 60 * 1000

// ---------- Morosidad ----------

export interface DeudorAging {
  clientId: string
  nombre: string
  telefono: string
  vendedorNombre: string
  saldo: number
  clasificacion: 'normal' | 'moroso' | 'incobrable'
  aging: AgingBuckets
  diasUltimoPago: number | null
  diasUltimaVenta: number | null
}

export interface MorosidadData {
  deudores: DeudorAging[]
  totales: AgingBuckets & { deudaTotal: number }
}

async function getNombresVendedores(): Promise<Map<string, string>> {
  const { data } = await supabase.from('vendedores').select('id, name')
  const mapa = new Map<string, string>()
  for (const v of data ?? []) mapa.set(v.id, v.name ?? '')
  return mapa
}

export async function getMorosidad(): Promise<MorosidadData> {
  const hoy = new Date()
  const [clientesRes, vendedores] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, name, phone, seller_id, current_balance, debt_classification')
      .gt('current_balance', 0),
    getNombresVendedores(),
  ])
  if (clientesRes.error) throw clientesRes.error
  const clientes = clientesRes.data

  const ids = (clientes ?? []).map((c) => c.id)
  const txPorCliente = new Map<string, TxLite[]>()
  // Traer transacciones minoristas de los deudores en lotes (límite de URL)
  const LOTE = 100
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data: txs, error: txError } = await supabase
      .from('transacciones')
      .select('client_id, type, amount, date, cuenta')
      .in('client_id', ids.slice(i, i + LOTE))
      .order('date', { ascending: true })
    if (txError) throw txError
    for (const t of txs ?? []) {
      if (t.cuenta === 'mayorista') continue
      const lista = txPorCliente.get(t.client_id) ?? []
      lista.push({ type: t.type, amount: Number(t.amount) || 0, date: new Date(t.date) })
      txPorCliente.set(t.client_id, lista)
    }
  }

  const totales = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, deudaTotal: 0 }
  const deudores: DeudorAging[] = (clientes ?? []).map((c) => {
    const saldo = Number(c.current_balance) || 0
    const txs = txPorCliente.get(c.id) ?? []
    const aging = calcularAging(txs, saldo, hoy)
    totales.d0_30 += aging.d0_30
    totales.d31_60 += aging.d31_60
    totales.d61_90 += aging.d61_90
    totales.d90plus += aging.d90plus
    totales.deudaTotal += saldo

    const ultimoPago = txs.filter((t) => t.type === 'payment').at(-1)
    const ultimaVenta = txs.filter((t) => t.type === 'debt').at(-1)
    return {
      clientId: c.id,
      nombre: c.name ?? '',
      telefono: c.phone ?? '',
      vendedorNombre: c.seller_id ? (vendedores.get(c.seller_id) ?? '') : '',
      saldo,
      clasificacion: (c.debt_classification as DeudorAging['clasificacion']) ?? 'normal',
      aging,
      diasUltimoPago: ultimoPago ? diasEntre(ultimoPago.date, hoy) : null,
      diasUltimaVenta: ultimaVenta ? diasEntre(ultimaVenta.date, hoy) : null,
    }
  })

  // Ordenar por deuda más vieja primero, después por saldo
  deudores.sort((a, b) => {
    const viejaA = a.aging.d90plus + a.aging.d61_90
    const viejaB = b.aging.d90plus + b.aging.d61_90
    if (viejaB !== viejaA) return viejaB - viejaA
    return b.saldo - a.saldo
  })

  return { deudores, totales }
}

// ---------- Reposición ----------

export interface ProductoReposicion {
  productId: string
  codigo: string
  nombre: string
  categoria: string
  stock: number
  ventasPorSemana: number
  coberturaDias: number
  sugerido: number
  sugeridoBultos: number | null
  unidadesPorBulto: number | null
}

export interface ReposicionData {
  productos: ProductoReposicion[]
  diasVentana: number
  diasCobertura: number
}

export async function getReposicion(diasCobertura = 14, diasVentana = 28): Promise<ReposicionData> {
  const desde = new Date(Date.now() - diasVentana * DIA_MS)
  const [ventasRes, productosRes] = await Promise.all([
    supabase.from('ventas').select('items').gte('created_at', desde.toISOString()),
    supabase
      .from('productos')
      .select('id, codigo, name, category, stock, unidades_por_bulto, disabled')
      .eq('disabled', false),
  ])
  if (ventasRes.error) throw ventasRes.error
  if (productosRes.error) throw productosRes.error

  const items = (ventasRes.data ?? []).flatMap((v) =>
    ((v.items as any[]) ?? [])
      .filter((it) => it?.productId && !it.esRegalo)
      .map((it) => ({ productId: it.productId as string, quantity: Number(it.quantity) || 0 })),
  )
  const velocidad = calcularVelocidad(items, diasVentana)

  const productos: ProductoReposicion[] = []
  for (const p of productosRes.data ?? []) {
    const vel = velocidad.get(p.id) ?? 0
    if (vel <= 0) continue // sin ventas en la ventana → no hay urgencia medible
    const stock = Number(p.stock) || 0
    const { coberturaDias, sugerido } = calcularReposicion(stock, vel, diasCobertura)
    if (sugerido <= 0) continue
    const upb = p.unidades_por_bulto ? Number(p.unidades_por_bulto) : null
    productos.push({
      productId: p.id,
      codigo: p.codigo ?? '',
      nombre: p.name ?? '',
      categoria: p.category ?? '',
      stock,
      ventasPorSemana: Math.round(vel * 7 * 10) / 10,
      coberturaDias: Math.round(coberturaDias * 10) / 10,
      sugerido,
      sugeridoBultos: upb && upb > 0 ? Math.ceil(sugerido / upb) : null,
      unidadesPorBulto: upb,
    })
  }
  productos.sort((a, b) => a.coberturaDias - b.coberturaDias)
  return { productos, diasVentana, diasCobertura }
}

// ---------- Rentabilidad ----------

export async function getRentabilidad(desde: Date, hasta: Date): Promise<ResultadoRentabilidad> {
  const [ventasRes, productosRes, mayoristaRes] = await Promise.all([
    supabase
      .from('ventas')
      .select('client_id, client_name, items')
      .gte('created_at', desde.toISOString())
      .lte('created_at', hasta.toISOString()),
    supabase
      .from('productos')
      .select('id, name, category, price, precio_venta, precio_base, ganancia_global'),
    supabase.from('mayorista_productos').select('producto_id, precio_lista'),
  ])
  if (ventasRes.error) throw ventasRes.error
  if (productosRes.error) throw productosRes.error
  if (mayoristaRes.error) throw mayoristaRes.error

  const costoMayorista = new Map<string, number>()
  for (const mp of mayoristaRes.data ?? []) {
    if (mp.producto_id && mp.precio_lista != null) {
      costoMayorista.set(mp.producto_id, Number(mp.precio_lista) || 0)
    }
  }

  const infoProductos = new Map<string, { nombre: string; categoria: string; costo?: number }>()
  for (const p of productosRes.data ?? []) {
    infoProductos.set(p.id, {
      nombre: p.name ?? '',
      categoria: p.category || 'Sin rubro',
      costo: estimarCosto({
        precioListaMayorista: costoMayorista.get(p.id),
        precioBase: p.precio_base != null ? Number(p.precio_base) : undefined,
        precioVenta: p.precio_venta != null ? Number(p.precio_venta) : Number(p.price) || undefined,
        gananciaGlobal: p.ganancia_global != null ? Number(p.ganancia_global) : undefined,
      }),
    })
  }

  const ventas = (ventasRes.data ?? []).map((v) => ({
    clientId: v.client_id ?? undefined,
    clientName: v.client_name ?? undefined,
    items: ((v.items as any[]) ?? []).map((it) => ({
      productId: it.productId ?? '',
      quantity: Number(it.quantity) || 0,
      price: Number(it.price) || 0,
      name: it.name,
      itemDiscount: it.itemDiscount != null ? Number(it.itemDiscount) : undefined,
      esRegalo: !!it.esRegalo,
    })),
  }))

  return calcularRentabilidad(ventas, infoProductos)
}

// ---------- Clientes inactivos ----------

export interface ClienteInactivo {
  clientId: string
  nombre: string
  telefono: string
  vendedorNombre: string
  saldo: number
  diasSinComprar: number
  frecuenciaDias: number | null
  promedioCompra: number
  enRiesgo: boolean
}

export async function getClientesInactivos(): Promise<ClienteInactivo[]> {
  const hoy = new Date()
  const [ventasRes, clientesRes, vendedores] = await Promise.all([
    supabase
      .from('ventas')
      .select('client_id, total, created_at')
      .not('client_id', 'is', null)
      .order('created_at', { ascending: true }),
    supabase.from('clientes').select('id, name, phone, seller_id, current_balance'),
    getNombresVendedores(),
  ])
  if (ventasRes.error) throw ventasRes.error
  if (clientesRes.error) throw clientesRes.error

  const comprasPorCliente = new Map<string, { fechas: Date[]; total: number; cantidad: number }>()
  for (const v of ventasRes.data ?? []) {
    const reg = comprasPorCliente.get(v.client_id) ?? { fechas: [], total: 0, cantidad: 0 }
    reg.fechas.push(new Date(v.created_at))
    reg.total += Number(v.total) || 0
    reg.cantidad += 1
    comprasPorCliente.set(v.client_id, reg)
  }

  const resultado: ClienteInactivo[] = []
  for (const c of clientesRes.data ?? []) {
    const compras = comprasPorCliente.get(c.id)
    if (!compras) continue
    const inactividad = calcularInactividad(compras.fechas, hoy)
    if (!inactividad || !inactividad.enRiesgo) continue
    resultado.push({
      clientId: c.id,
      nombre: c.name ?? '',
      telefono: c.phone ?? '',
      vendedorNombre: c.seller_id ? (vendedores.get(c.seller_id) ?? '') : '',
      saldo: Number(c.current_balance) || 0,
      diasSinComprar: inactividad.diasSinComprar,
      frecuenciaDias: inactividad.frecuenciaDias != null ? Math.round(inactividad.frecuenciaDias) : null,
      promedioCompra: compras.cantidad > 0 ? compras.total / compras.cantidad : 0,
      enRiesgo: true,
    })
  }
  // Más valioso primero: mayor compra promedio entre los que llevan más días sin comprar
  resultado.sort((a, b) => b.promedioCompra * b.diasSinComprar - a.promedioCompra * a.diasSinComprar)
  return resultado
}

// ---------- Resumen del día ----------

export interface ResumenDiaData extends ResumenDia {
  fecha: Date
  cobranzasDia: number
  cobranzasCantidad: number
  deudaNueva: number
  comprobantesPendientes: number
}

export async function getResumenDia(fecha: Date): Promise<ResumenDiaData> {
  const inicio = new Date(fecha)
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date(fecha)
  fin.setHours(23, 59, 59, 999)

  const [ventasRes, txRes, comprobantesRes] = await Promise.all([
    supabase
      .from('ventas')
      .select('total, payment_type, payment_method, cash_amount, credit_amount, remito_number')
      .gte('created_at', inicio.toISOString())
      .lte('created_at', fin.toISOString()),
    supabase
      .from('transacciones')
      .select('type, amount, cuenta')
      .gte('date', inicio.toISOString())
      .lte('date', fin.toISOString()),
    supabase
      .from('comprobantes_pago')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])
  if (ventasRes.error) throw ventasRes.error
  if (txRes.error) throw txRes.error

  const resumen = resumirVentasDia(
    (ventasRes.data ?? []).map((v) => ({
      total: Number(v.total) || 0,
      paymentType: v.payment_type,
      paymentMethod: v.payment_method ?? undefined,
      cashAmount: v.cash_amount != null ? Number(v.cash_amount) : undefined,
      creditAmount: v.credit_amount != null ? Number(v.credit_amount) : undefined,
      remitoNumber: v.remito_number ?? undefined,
    })),
  )

  let cobranzasDia = 0
  let cobranzasCantidad = 0
  let deudaNueva = 0
  for (const t of txRes.data ?? []) {
    if (t.cuenta === 'mayorista') continue
    const monto = Number(t.amount) || 0
    if (t.type === 'payment') {
      cobranzasDia += monto
      cobranzasCantidad += 1
    } else if (t.type === 'debt') {
      deudaNueva += monto
    }
  }

  return {
    ...resumen,
    fecha,
    cobranzasDia,
    cobranzasCantidad,
    deudaNueva,
    comprobantesPendientes: comprobantesRes.count ?? 0,
  }
}
