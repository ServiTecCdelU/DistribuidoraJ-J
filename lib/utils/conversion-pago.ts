// Campos de la venta al convertir su forma de pago (contado ↔ cuenta corriente).
//
// El repartidor puede registrar un cobro en efectivo o transferencia y el admin corregirlo
// después desde Ventas. Esa corrección tiene que dejar los montos cobrados consistentes:
// si la venta pasa a cuenta corriente no entró plata, y si vuelve a contado el monto va en
// el medio nuevo. Un residuo del medio anterior hace que la caja informe plata inexistente.
//
// Lógica pura para poder testear la conversión sin pegarle a Supabase.

export type DireccionConversion = 'aPagado' | 'aCuentaCorriente'
export type MetodoPago = 'efectivo' | 'transferencia'

export interface CamposConversion {
  payment_type: 'cash' | 'credit'
  payment_method?: MetodoPago
  cash_amount: null
  credit_amount: number | null
  efectivo_amount: number | null
  transferencia_amount: number | null
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

export function camposConversionPago(
  direccion: DireccionConversion,
  monto: number,
  metodo: MetodoPago = 'efectivo',
): CamposConversion {
  const m = round2(Number(monto) || 0)

  if (direccion === 'aCuentaCorriente') {
    // Pasa a deuda: no ingresó dinero por ningún medio.
    return {
      payment_type: 'credit',
      credit_amount: m,
      cash_amount: null,
      efectivo_amount: null,
      transferencia_amount: null,
    }
  }

  // Pasa a cobrada: el monto queda en el medio elegido y el otro se limpia.
  return {
    payment_type: 'cash',
    payment_method: metodo,
    cash_amount: null,
    credit_amount: null,
    efectivo_amount: metodo === 'efectivo' ? m : null,
    transferencia_amount: metodo === 'transferencia' ? m : null,
  }
}
