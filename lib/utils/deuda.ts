import type { DebtClassification } from '@/lib/types'

// Umbrales en días desde que la deuda entró a cuenta corriente
export const DIAS_ATRASADO = 7 // a partir de 7 días: atrasado
export const DIAS_MOROSO = 15 // a partir de 15 días: moroso
export const DIAS_INCOBRABLE = 365 // a partir de 1 año: incobrable

/** Días transcurridos desde una fecha hasta ahora (piso a 0). */
export function diasDesde(fecha?: Date | null, ahora: Date = new Date()): number {
  if (!fecha) return 0
  return Math.max(0, Math.floor((ahora.getTime() - fecha.getTime()) / 86400000))
}

export type EstadoDiaPago = 'falta' | 'hoy' | 'atrasado' | 'moroso' | 'incobrable'

export interface DiaDePagoInfo {
  /** Días que faltan para el día de pago (cuando aún no venció), 0 si es hoy, o días totales en cuenta corriente si ya venció. */
  numero: number
  estado: EstadoDiaPago
}

/**
 * Información del día de pago (plazo de 7 días):
 * - falta: aún dentro del plazo, numero = días restantes (1..7)
 * - hoy: hoy es el día de pago, numero = 0
 * - atrasado/moroso/incobrable: ya venció, numero = días totales en cuenta corriente (no se reinicia)
 */
export function diaDePagoInfo(debtSince?: Date | null, ahora: Date = new Date()): DiaDePagoInfo {
  if (!debtSince) return { numero: DIAS_ATRASADO, estado: 'falta' }
  const dias = diasDesde(debtSince, ahora)
  if (dias < DIAS_ATRASADO) return { numero: DIAS_ATRASADO - dias, estado: 'falta' }
  if (dias === DIAS_ATRASADO) return { numero: 0, estado: 'hoy' }
  if (dias >= DIAS_INCOBRABLE) return { numero: dias, estado: 'incobrable' }
  if (dias >= DIAS_MOROSO) return { numero: dias, estado: 'moroso' }
  return { numero: dias, estado: 'atrasado' }
}

/** Hoy es el día de pago: se cumple exactamente el plazo de 7 días desde que entró a cuenta corriente. */
export function esDiaDePago(debtSince?: Date | null, ahora: Date = new Date()): boolean {
  if (!debtSince) return false
  return diasDesde(debtSince, ahora) === DIAS_ATRASADO
}

/**
 * Clasifica la deuda según la antigüedad de la deuda pendiente más antigua:
 * - normal: dentro del plazo de 7 días
 * - atrasado: entre 7 y 15 días
 * - moroso: entre 15 días y 1 año
 * - incobrable: más de 1 año
 */
export function clasificarDeuda(debtSince?: Date | null, ahora: Date = new Date()): DebtClassification {
  if (!debtSince) return 'normal'
  const dias = diasDesde(debtSince, ahora)
  if (dias >= DIAS_INCOBRABLE) return 'incobrable'
  if (dias >= DIAS_MOROSO) return 'moroso'
  if (dias >= DIAS_ATRASADO) return 'atrasado'
  return 'normal'
}
