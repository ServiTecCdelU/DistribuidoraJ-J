// Detectores de inconsistencias de datos.
//
// Son las consultas que se usaron para encontrar el descuadre del remito R-2026-01782 y los
// problemas que aparecieron tirando de ese hilo. Quedan acá como lógica pura para poder
// testearlas; `scripts/health-check.ts` las ejecuta contra la base.
//
// Cada detector devuelve la lista de casos con problema. Lista vacía = todo bien.

import { consolidarItems } from './items-pedido'
import { claveLinea } from './clave-linea'
import { desglosePago } from './caja-desglose'

/** Tolerancia de redondeo: menos de un centavo no es una inconsistencia. */
const EPSILON = 0.011

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const r2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100

// ───────────────────────────── 1. Ventas descuadradas ─────────────────────────────

export interface VentaDescuadrada {
  id: string
  saleNumber?: string
  total: number
  sumaItems: number
  diferencia: number
}

/**
 * Ventas donde la suma de los items no coincide con el total.
 * Es la firma de los dos bugs de dinero: plata cobrada sin respaldo en el detalle.
 */
export function ventasDescuadradas(ventas: any[]): VentaDescuadrada[] {
  const out: VentaDescuadrada[] = []
  for (const v of ventas) {
    const items = v?.items ?? []
    if (!Array.isArray(items) || items.length === 0) continue
    const suma = r2(items.reduce(
      (acc: number, i: any) => acc + num(i.price) * num(i.quantity) * (1 - num(i.itemDiscount) / 100),
      0,
    ))
    const total = r2(num(v.total))
    const dif = r2(suma - total)
    if (Math.abs(dif) < EPSILON) continue
    out.push({ id: v.id, saleNumber: v.sale_number, total, sumaItems: suma, diferencia: dif })
  }
  return out
}

// ──────────────────────────── 2. Cobrado ≠ facturado ─────────────────────────────

export interface VentaCobroDistinto {
  id: string
  saleNumber?: string
  clientName?: string
  total: number
  cobrado: number
  diferencia: number
  /**
   * 'falta'     → entró MENOS de lo facturado. Siempre es un problema.
   * 'excedente' → entró MÁS. Puede ser legítimo (el cliente pagó deuda anterior o
   *               redondeó para arriba), pero también es la firma del bug del remito
   *               R-2026-01782, donde faltaba un item en el detalle de la venta.
   */
  tipo: 'falta' | 'excedente'
}

/**
 * Ventas donde lo que entró no coincide con lo facturado.
 * Solo mira las que tienen el monto cobrado cargado: en las anteriores a ese campo no hay
 * con qué comparar, y las de cuenta corriente no tienen cobro.
 */
export function ventasConCobroDistinto(ventas: any[]): VentaCobroDistinto[] {
  const out: VentaCobroDistinto[] = []
  for (const v of ventas) {
    if (v?.payment_type === 'credit') continue
    const tieneCobro = v?.efectivo_amount != null || v?.transferencia_amount != null
    if (!tieneCobro) continue

    const d = desglosePago(v)
    const cobrado = r2(d.efectivo + d.transferencia + d.credito)
    const total = r2(num(v.total))
    const dif = r2(cobrado - total)
    if (Math.abs(dif) < EPSILON) continue
    out.push({
      id: v.id,
      saleNumber: v.sale_number,
      clientName: v.client_name,
      total,
      cobrado,
      diferencia: dif,
      tipo: dif < 0 ? 'falta' : 'excedente',
    })
  }
  return out
}

// ────────────────────── 3. Pedidos con el producto repetido ──────────────────────

export interface PedidoDuplicado {
  id: string
  remitoNumber?: string
  clientName?: string
  duplicados: Array<{ name: string; renglones: number; unidades: number }>
}

/**
 * Pedidos con el mismo producto en más de un renglón, al mismo precio y descuento.
 * A distinto precio es deliberado y no se reporta (ver items-pedido.ts).
 */
export function pedidosConItemsDuplicados(pedidos: any[]): PedidoDuplicado[] {
  const out: PedidoDuplicado[] = []
  for (const p of pedidos) {
    const items = p?.items ?? []
    if (!Array.isArray(items) || items.length === 0) continue

    const grupos = new Map<string, any[]>()
    for (const i of items) {
      if (!i?.productId) continue
      const k = claveLinea(i)
      grupos.set(k, (grupos.get(k) ?? []).concat([i]))
    }

    const duplicados = [...grupos.values()]
      .filter((g) => g.length > 1)
      .map((g) => ({
        name: String(g[0].name ?? g[0].productId),
        renglones: g.length,
        unidades: g.reduce((a, x) => a + num(x.quantity), 0),
      }))

    if (duplicados.length === 0) continue
    out.push({ id: p.id, remitoNumber: p.remito_number, clientName: p.client_name, duplicados })
  }
  return out
}

// ─────────────────── 4. Residuos de conversión de forma de pago ──────────────────

export interface VentaConResiduo {
  id: string
  saleNumber?: string
  clientName?: string
  efectivo: number | null
  transferencia: number | null
}

/**
 * Ventas a cuenta corriente que conservan un monto cobrado.
 * Es plata que no entró pero quedó anotada: si la venta vuelve a pasarse a contado, revive.
 */
export function ventasCreditConMontoCobrado(ventas: any[]): VentaConResiduo[] {
  return ventas
    .filter((v) => v?.payment_type === 'credit' &&
      (v?.efectivo_amount != null || v?.transferencia_amount != null))
    .map((v) => ({
      id: v.id,
      saleNumber: v.sale_number,
      clientName: v.client_name,
      efectivo: v.efectivo_amount ?? null,
      transferencia: v.transferencia_amount ?? null,
    }))
}

// ──────────────────────── 5. Cajas duplicadas el mismo día ───────────────────────

export interface CajaDuplicada {
  dia: string
  ids: string[]
}

/** Más de una caja abierta el mismo día: duplica los totales en cualquier reporte. */
export function cajasDuplicadas(cajas: any[]): CajaDuplicada[] {
  const porDia = new Map<string, string[]>()
  for (const c of cajas) {
    if (!c?.opened_at) continue
    const dia = String(c.opened_at).slice(0, 10)
    porDia.set(dia, (porDia.get(dia) ?? []).concat([c.id]))
  }
  return [...porDia.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([dia, ids]) => ({ dia, ids: ids.slice().sort() }))
}

// ───────────────── 6. Cajas cerradas que no coinciden con su recálculo ────────────

const OFFSET_AR = 3 * 60 * 60 * 1000 // Argentina UTC-3, sin horario de verano
const HORA_CIERRE = 23

export interface CajaDesactualizada {
  id: string
  efectivo: { guardado: number; real: number }
  transferencia: { guardado: number; real: number }
  credito: { guardado: number; real: number }
}

/**
 * Cajas cerradas cuyos totales guardados no coinciden con recalcular sus ventas.
 * Pasa cuando una venta se edita después del cierre (por ejemplo al pasarla a cuenta
 * corriente): la caja quedó con la foto vieja.
 */
export function cajasDesactualizadas(cajas: any[], ventas: any[]): CajaDesactualizada[] {
  const out: CajaDesactualizada[] = []

  for (const c of cajas) {
    if (c?.status !== 'closed' || !c?.opened_at) continue

    const apertura = new Date(c.opened_at)
    const local = new Date(apertura.getTime() - OFFSET_AR)
    const cierre = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), HORA_CIERRE) + OFFSET_AR,
    )

    let efectivo = 0
    let transferencia = 0
    let credito = 0
    for (const v of ventas) {
      const t = new Date(v.created_at).getTime()
      if (t < apertura.getTime() || t > cierre.getTime()) continue
      const d = desglosePago(v)
      efectivo += d.efectivo
      transferencia += d.transferencia
      credito += d.credito
    }

    const dif = (guardado: unknown, real: number) => Math.abs(r2(real - num(guardado))) >= EPSILON
    if (!dif(c.cash_total, efectivo) && !dif(c.transfer_total, transferencia) && !dif(c.credit_total, credito)) {
      continue
    }

    out.push({
      id: c.id,
      efectivo: { guardado: r2(num(c.cash_total)), real: r2(efectivo) },
      transferencia: { guardado: r2(num(c.transfer_total)), real: r2(transferencia) },
      credito: { guardado: r2(num(c.credit_total)), real: r2(credito) },
    })
  }

  return out
}
