import { supabase } from '@/lib/supabase'
import type { Sale } from '@/lib/types'
import { getSalesByDateRange } from '@/services/sales-service'
import { getSellers } from '@/services/sellers-service'
import { getGastosFijos, getGastosVariables } from '@/services/gastos-service'
import type { GastoFijo, GastoVariable } from '@/services/gastos-service'

// Margen bruto asumido cuando no se puede estimar el costo de un producto.
const MARGEN_DEFAULT_PCT = 30
const COMISION_DEFAULT_PCT = 10

interface ProductoCosto {
  precioBase: number | null
  precioVenta: number | null
  ganancia: number | null
}

export interface RentabilidadMensual {
  year: number
  month: number
  ingresos: number
  costoMercaderia: number // estimado
  gananciaBruta: number
  comisiones: number
  gastosFijos: number
  gastosVariables: number
  resultadoNeto: number
  margenPct: number
  puntoEquilibrio: number | null // ventas necesarias para cubrir los gastos
  cantidadVentas: number
  gastosFijosVigentes: GastoFijo[]
  gastosVariablesDelMes: GastoVariable[]
}

// Razón costo/venta de un producto (0..1). Cuanto más bajo, mayor el margen.
function ratioCosto(p: ProductoCosto | undefined): number {
  if (p) {
    if (p.precioBase && p.precioVenta && p.precioVenta > 0) {
      return Math.min(1, p.precioBase / p.precioVenta)
    }
    if (p.ganancia != null && p.ganancia >= 0) {
      return 1 / (1 + p.ganancia / 100)
    }
  }
  return 1 / (1 + MARGEN_DEFAULT_PCT / 100)
}

// Costo unitario absoluto (para ítems de regalo, que se venden a $0).
function costoUnitario(p: ProductoCosto | undefined): number {
  if (p) {
    if (p.precioBase != null && p.precioBase > 0) return p.precioBase
    if (p.precioVenta != null && p.precioVenta > 0) {
      return p.precioVenta * ratioCosto(p)
    }
  }
  return 0
}

// Resuelve el costo estimado de la mercadería vendida en el mes.
async function estimarCostoMercaderia(ventas: Sale[]): Promise<number> {
  const ids = new Set<string>()
  ventas.forEach((v) =>
    (v.items ?? []).forEach((it) => {
      if (it.productId) ids.add(it.productId)
    }),
  )
  if (ids.size === 0) return 0

  const allIds = [...ids]
  const mpIds = allIds.filter((id) => id.startsWith('mp_'))

  // mp_XXXX (mayorista) -> producto_id (prod_mp_XXXX)
  const mpMap = new Map<string, string>()
  for (let i = 0; i < mpIds.length; i += 500) {
    const chunk = mpIds.slice(i, i + 500)
    const { data } = await supabase
      .from('mayorista_productos')
      .select('id, producto_id')
      .in('id', chunk)
    ;(data ?? []).forEach((r: any) => {
      if (r.producto_id) mpMap.set(r.id, r.producto_id)
    })
  }

  // IDs de productos reales a consultar
  const prodIds = new Set<string>()
  allIds.forEach((id) => {
    if (!id.startsWith('mp_')) prodIds.add(id)
  })
  mpMap.forEach((pid) => prodIds.add(pid))

  const costMap = new Map<string, ProductoCosto>()
  const prodIdList = [...prodIds]
  for (let i = 0; i < prodIdList.length; i += 500) {
    const chunk = prodIdList.slice(i, i + 500)
    const { data } = await supabase
      .from('productos')
      .select('id, precio_base, precio_venta, price, ganancia_global')
      .in('id', chunk)
    ;(data ?? []).forEach((r: any) => {
      costMap.set(r.id, {
        precioBase: r.precio_base != null ? Number(r.precio_base) : null,
        precioVenta:
          r.precio_venta != null
            ? Number(r.precio_venta)
            : r.price != null
              ? Number(r.price)
              : null,
        ganancia: r.ganancia_global != null ? Number(r.ganancia_global) : null,
      })
    })
  }

  const resolver = (productId: string): ProductoCosto | undefined => {
    const realId = productId.startsWith('mp_') ? mpMap.get(productId) : productId
    return realId ? costMap.get(realId) : undefined
  }

  let cogs = 0
  ventas.forEach((v) =>
    (v.items ?? []).forEach((it) => {
      const p = it.productId ? resolver(it.productId) : undefined
      const qty = Number(it.quantity) || 0
      if (it.esRegalo || !it.price) {
        cogs += qty * costoUnitario(p)
      } else {
        cogs += Number(it.price) * qty * ratioCosto(p)
      }
    }),
  )
  return Math.round(cogs * 100) / 100
}

// Comisiones devengadas en el mes (total de cada venta × tasa del vendedor).
function calcularComisiones(ventas: Sale[], rateById: Map<string, number>): number {
  let total = 0
  ventas.forEach((v) => {
    if (!v.sellerId) return
    const rate = rateById.get(v.sellerId) ?? COMISION_DEFAULT_PCT
    total += (Number(v.total) || 0) * (rate / 100)
  })
  return Math.round(total * 100) / 100
}

// Gastos fijos vigentes en el mes indicado.
function gastosFijosVigentes(
  fijos: GastoFijo[],
  inicioMes: string,
  finMes: string,
): GastoFijo[] {
  return fijos.filter((g) => {
    if (!g.activo) return false
    if (g.desde && g.desde > finMes) return false
    if (g.hasta && g.hasta < inicioMes) return false
    return true
  })
}

export const getRentabilidadMensual = async (
  year: number,
  month: number,
): Promise<RentabilidadMensual> => {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  const mm = String(month).padStart(2, '0')
  const inicioMes = `${year}-${mm}-01`
  const finMes = `${year}-${mm}-${String(end.getDate()).padStart(2, '0')}`

  const [ventas, sellers, fijos, variables] = await Promise.all([
    getSalesByDateRange(start, end),
    getSellers(),
    getGastosFijos(),
    getGastosVariables(year, month),
  ])

  const rateById = new Map<string, number>()
  sellers.forEach((s: any) => {
    rateById.set(s.id, Number(s.commissionRate ?? s.commission_rate) || COMISION_DEFAULT_PCT)
  })

  const ingresos = ventas.reduce((acc, v) => acc + (Number(v.total) || 0), 0)
  const costoMercaderia = await estimarCostoMercaderia(ventas)
  const gananciaBruta = ingresos - costoMercaderia
  const comisiones = calcularComisiones(ventas, rateById)

  const fijosVig = gastosFijosVigentes(fijos, inicioMes, finMes)
  const gastosFijos = fijosVig.reduce((acc, g) => acc + g.monto, 0)
  const gastosVariables = variables.reduce((acc, g) => acc + g.monto, 0)

  const resultadoNeto = gananciaBruta - comisiones - gastosFijos - gastosVariables
  const margenPct = ingresos > 0 ? (gananciaBruta / ingresos) * 100 : 0
  const totalGastos = gastosFijos + gastosVariables + comisiones
  const puntoEquilibrio = margenPct > 0 ? totalGastos / (margenPct / 100) : null

  return {
    year,
    month,
    ingresos: Math.round(ingresos * 100) / 100,
    costoMercaderia,
    gananciaBruta: Math.round(gananciaBruta * 100) / 100,
    comisiones,
    gastosFijos: Math.round(gastosFijos * 100) / 100,
    gastosVariables: Math.round(gastosVariables * 100) / 100,
    resultadoNeto: Math.round(resultadoNeto * 100) / 100,
    margenPct: Math.round(margenPct * 10) / 10,
    puntoEquilibrio: puntoEquilibrio != null ? Math.round(puntoEquilibrio * 100) / 100 : null,
    cantidadVentas: ventas.length,
    gastosFijosVigentes: fijosVig,
    gastosVariablesDelMes: variables,
  }
}
