// Medio de pago de un cobro de cuenta corriente (columna transacciones.metodo_pago).
// La caja suma al efectivo esperado solo los cobros en efectivo.

export type MetodoPago = 'efectivo' | 'transferencia' | 'otro'

/** Deduce el medio desde la descripción con que se registró el cobro ("Pago en efectivo…"). */
export function metodoPagoDesdeDescripcion(description?: string | null): MetodoPago | null {
  const d = (description ?? '').trim().toLowerCase()
  if (d.startsWith('pago en efectivo')) return 'efectivo'
  if (d.startsWith('pago por transferencia') || d.startsWith('pago con comprobante')) return 'transferencia'
  if (d.startsWith('pago registrado manualmente')) return 'otro'
  return null
}
