// lib/utils/admin-insights.ts
// Lógica pura de análisis para el panel admin (sin Supabase — testeable con Vitest).

// ---------- Morosidad / aging ----------

export interface TxLite {
  type: 'debt' | 'payment'
  amount: number
  date: Date
}

export interface AgingBuckets {
  d0_30: number
  d31_60: number
  d61_90: number
  d90plus: number
}

export const AGING_VACIO: AgingBuckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 }

const DIA_MS = 24 * 60 * 60 * 1000

export function diasEntre(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / DIA_MS)
}

/**
 * Asigna el saldo actual a la antigüedad de las deudas usando FIFO:
 * los pagos cancelan primero las deudas más viejas. Lo que queda sin
 * cancelar se bucketiza por días desde la fecha de la deuda.
 * Si el saldo real no coincide con las transacciones (datos legacy),
 * la diferencia positiva se asigna a +90 días (deuda sin registro = vieja).
 */
export function calcularAging(transacciones: TxLite[], saldoActual: number, hoy: Date): AgingBuckets {
  if (saldoActual <= 0) return { ...AGING_VACIO }

  const ordenadas = [...transacciones].sort((a, b) => a.date.getTime() - b.date.getTime())
  const deudas: { fecha: Date; restante: number }[] = []
  for (const tx of ordenadas) {
    if (tx.amount <= 0) continue
    if (tx.type === 'debt') {
      deudas.push({ fecha: tx.date, restante: tx.amount })
    } else {
      let pago = tx.amount
      for (const d of deudas) {
        if (pago <= 0) break
        const aplica = Math.min(d.restante, pago)
        d.restante -= aplica
        pago -= aplica
      }
    }
  }

  let pendientes = deudas.filter((d) => d.restante > 0.009)
  let totalPendiente = pendientes.reduce((acc, d) => acc + d.restante, 0)

  // Reconciliar contra el saldo real
  if (totalPendiente > saldoActual) {
    // Sobran deudas registradas: cancelar las más viejas hasta igualar
    let exceso = totalPendiente - saldoActual
    for (const d of pendientes) {
      if (exceso <= 0) break
      const aplica = Math.min(d.restante, exceso)
      d.restante -= aplica
      exceso -= aplica
    }
    pendientes = pendientes.filter((d) => d.restante > 0.009)
    totalPendiente = saldoActual
  }

  const buckets: AgingBuckets = { ...AGING_VACIO }
  for (const d of pendientes) {
    const dias = diasEntre(d.fecha, hoy)
    if (dias <= 30) buckets.d0_30 += d.restante
    else if (dias <= 60) buckets.d31_60 += d.restante
    else if (dias <= 90) buckets.d61_90 += d.restante
    else buckets.d90plus += d.restante
  }

  // Saldo sin transacciones que lo respalden → deuda vieja
  const faltante = saldoActual - totalPendiente
  if (faltante > 0.009) buckets.d90plus += faltante

  return buckets
}

// ---------- Reposición de stock ----------

export interface VentaItemLite {
  productId: string
  quantity: number
}

/** Unidades vendidas por producto en la ventana → unidades por día. */
export function calcularVelocidad(items: VentaItemLite[], diasVentana: number): Map<string, number> {
  const dias = Math.max(1, diasVentana)
  const unidades = new Map<string, number>()
  for (const it of items) {
    if (!it.productId || !(it.quantity > 0)) continue
    unidades.set(it.productId, (unidades.get(it.productId) ?? 0) + it.quantity)
  }
  const velocidad = new Map<string, number>()
  unidades.forEach((u, id) => velocidad.set(id, u / dias))
  return velocidad
}

export interface Reposicion {
  /** Días que cubre el stock actual al ritmo de venta. Infinity si no se vende. */
  coberturaDias: number
  /** Unidades sugeridas a reponer para cubrir `diasCobertura`. */
  sugerido: number
}

export function calcularReposicion(stock: number, velocidadDia: number, diasCobertura: number): Reposicion {
  if (velocidadDia <= 0) return { coberturaDias: Infinity, sugerido: 0 }
  const coberturaDias = stock / velocidadDia
  const sugerido = Math.max(0, Math.ceil(velocidadDia * diasCobertura - stock))
  return { coberturaDias, sugerido }
}

// ---------- Rentabilidad ----------

export interface VentaLite {
  clientId?: string
  clientName?: string
  items: {
    productId: string
    quantity: number
    price: number
    name?: string
    itemDiscount?: number
    esRegalo?: boolean
  }[]
}

export interface InfoProducto {
  nombre: string
  categoria: string
  /** Costo unitario; undefined = costo desconocido (se excluye del margen). */
  costo?: number
}

export interface FilaRentabilidad {
  id: string
  nombre: string
  facturado: number
  costo: number
  margen: number
  margenPct: number
  unidades: number
  /** true si alguna parte no tiene costo conocido. */
  costoIncompleto: boolean
}

export interface ResultadoRentabilidad {
  porProducto: FilaRentabilidad[]
  porCategoria: FilaRentabilidad[]
  porCliente: FilaRentabilidad[]
  totales: { facturado: number; costo: number; margen: number; margenPct: number; costoIncompleto: boolean }
}

function filaVacia(id: string, nombre: string): FilaRentabilidad {
  return { id, nombre, facturado: 0, costo: 0, margen: 0, margenPct: 0, unidades: 0, costoIncompleto: false }
}

function cerrarFila(f: FilaRentabilidad): FilaRentabilidad {
  f.margen = f.facturado - f.costo
  f.margenPct = f.facturado > 0 ? (f.margen / f.facturado) * 100 : 0
  return f
}

/**
 * Ganancia bruta por producto / rubro / cliente a partir de los items de venta.
 * Ingreso por item: price × qty × (1 − itemDiscount%). Regalos: ingreso 0, costo sí.
 */
export function calcularRentabilidad(
  ventas: VentaLite[],
  productos: Map<string, InfoProducto>,
): ResultadoRentabilidad {
  const porProducto = new Map<string, FilaRentabilidad>()
  const porCategoria = new Map<string, FilaRentabilidad>()
  const porCliente = new Map<string, FilaRentabilidad>()

  for (const venta of ventas) {
    const clienteId = venta.clientId || venta.clientName || 'sin_cliente'
    const clienteNombre = venta.clientName || 'Sin cliente'
    for (const item of venta.items ?? []) {
      const qty = Number(item.quantity) || 0
      if (qty <= 0) continue
      const info = productos.get(item.productId)
      const descuento = item.itemDiscount ? Math.min(100, Math.max(0, item.itemDiscount)) : 0
      const facturado = item.esRegalo ? 0 : (Number(item.price) || 0) * qty * (1 - descuento / 100)
      const costoUnit = info?.costo
      const costo = costoUnit != null ? costoUnit * qty : 0
      const sinCosto = costoUnit == null

      const nombreProd = info?.nombre || item.name || item.productId
      const categoria = info?.categoria || 'Sin rubro'

      const acumular = (mapa: Map<string, FilaRentabilidad>, id: string, nombre: string) => {
        const fila = mapa.get(id) ?? filaVacia(id, nombre)
        fila.facturado += facturado
        fila.costo += costo
        fila.unidades += qty
        if (sinCosto) fila.costoIncompleto = true
        mapa.set(id, fila)
      }
      acumular(porProducto, item.productId, nombreProd)
      acumular(porCategoria, categoria, categoria)
      acumular(porCliente, clienteId, clienteNombre)
    }
  }

  const ordenar = (mapa: Map<string, FilaRentabilidad>) =>
    Array.from(mapa.values()).map(cerrarFila).sort((a, b) => b.margen - a.margen)

  const listas = {
    porProducto: ordenar(porProducto),
    porCategoria: ordenar(porCategoria),
    porCliente: ordenar(porCliente),
  }
  const facturado = listas.porProducto.reduce((acc, f) => acc + f.facturado, 0)
  const costo = listas.porProducto.reduce((acc, f) => acc + f.costo, 0)
  const margen = facturado - costo
  return {
    ...listas,
    totales: {
      facturado,
      costo,
      margen,
      margenPct: facturado > 0 ? (margen / facturado) * 100 : 0,
      costoIncompleto: listas.porProducto.some((f) => f.costoIncompleto),
    },
  }
}

/**
 * Costo unitario estimado de un producto:
 * 1) precio de lista mayorista (costo real), 2) precioBase (manuales),
 * 3) derivado de la ganancia global, 4) desconocido.
 */
export function estimarCosto(p: {
  precioListaMayorista?: number
  precioBase?: number
  precioVenta?: number
  gananciaGlobal?: number
}): number | undefined {
  if (p.precioListaMayorista != null && p.precioListaMayorista > 0) return p.precioListaMayorista
  if (p.precioBase != null && p.precioBase > 0) return p.precioBase
  if (p.gananciaGlobal != null && p.gananciaGlobal > 0 && p.precioVenta != null && p.precioVenta > 0) {
    return p.precioVenta / (1 + p.gananciaGlobal / 100)
  }
  return undefined
}

// ---------- Clientes inactivos ----------

export interface Inactividad {
  /** Días desde la última compra. */
  diasSinComprar: number
  /** Promedio de días entre compras (últimas N). null si compró 1 sola vez. */
  frecuenciaDias: number | null
  /** true si superó 2× su frecuencia habitual (mínimo 14 días). */
  enRiesgo: boolean
}

export function calcularInactividad(fechasCompras: Date[], hoy: Date, maxCompras = 10): Inactividad | null {
  if (fechasCompras.length === 0) return null
  const ordenadas = [...fechasCompras].sort((a, b) => a.getTime() - b.getTime())
  const ultimas = ordenadas.slice(-maxCompras)
  const diasSinComprar = diasEntre(ultimas[ultimas.length - 1], hoy)

  let frecuenciaDias: number | null = null
  if (ultimas.length >= 2) {
    const gaps: number[] = []
    for (let i = 1; i < ultimas.length; i++) gaps.push(diasEntre(ultimas[i - 1], ultimas[i]))
    frecuenciaDias = gaps.reduce((acc, g) => acc + g, 0) / gaps.length
  }

  const umbral = Math.max(14, frecuenciaDias != null ? frecuenciaDias * 2 : 30)
  return { diasSinComprar, frecuenciaDias, enRiesgo: diasSinComprar > umbral }
}

// ---------- Resumen del día ----------

export interface VentaDiaLite {
  total: number
  paymentType: 'cash' | 'credit' | 'mixed'
  paymentMethod?: 'efectivo' | 'transferencia'
  cashAmount?: number
  creditAmount?: number
  remitoNumber?: string
}

export interface ResumenDia {
  totalVendido: number
  cantidadVentas: number
  efectivo: number
  transferencia: number
  cuentaCorriente: number
}

export function resumirVentasDia(ventas: VentaDiaLite[]): ResumenDia {
  const resumen: ResumenDia = { totalVendido: 0, cantidadVentas: 0, efectivo: 0, transferencia: 0, cuentaCorriente: 0 }
  for (const v of ventas) {
    const total = Number(v.total) || 0
    resumen.totalVendido += total
    resumen.cantidadVentas += 1
    if (v.paymentType === 'credit') {
      resumen.cuentaCorriente += total
    } else if (v.paymentType === 'mixed') {
      const cash = Number(v.cashAmount) || 0
      const credit = Number(v.creditAmount) || 0
      resumen.cuentaCorriente += credit
      if (v.paymentMethod === 'transferencia') resumen.transferencia += cash
      else resumen.efectivo += cash
    } else {
      if (v.paymentMethod === 'transferencia') resumen.transferencia += total
      else resumen.efectivo += total
    }
  }
  return resumen
}
