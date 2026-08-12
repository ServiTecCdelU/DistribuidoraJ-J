// Cálculo del pago de comisiones a un empleado.
// El saldo se recalcula SIEMPRE sobre todos los pagos (holístico, no incremental)
// para que no se desfase si un registro se edita o se borra.

export interface PagoLike {
  monto: number        // devengado del período
  montoPagado: number  // lo efectivamente entregado
}

export interface ResultadoPago {
  pagado: number
  saldoRestante: number
}

/**
 * Saldo arrastrado del empleado.
 * Positivo = se le debe. Negativo = se le pagó de más (adelanto).
 */
export function calcularSaldo(pagos: PagoLike[] | undefined | null): number {
  return (pagos ?? []).reduce((s, p) => s + (p.monto || 0) - (p.montoPagado || 0), 0)
}

/**
 * Resultado de un pago. Si no se especifica `montoPagado`, se paga todo:
 * lo devengado del período más lo que quedaba debiendo.
 */
export function calcularPago(
  devengado: number,
  saldoAnterior: number,
  montoPagado?: number | null,
): ResultadoPago {
  const pagado = montoPagado != null ? montoPagado : devengado + saldoAnterior
  return { pagado, saldoRestante: saldoAnterior + devengado - pagado }
}

/** Monto sugerido al abrir el modal de pago: devengado + deuda arrastrada (nunca negativo). */
export function montoSugerido(devengado: number, saldoAnterior: number): number {
  return Math.max(0, Math.round((devengado + saldoAnterior) * 100) / 100)
}
