/**
 * Notas de débito: cargo manual a la cuenta corriente, sin venta ni remito asociado.
 * Se guardan como transacción `debt` marcada con un tag en la descripción.
 */
export const NOTA_DEBITO_TAG = '[NOTA_DEBITO]'

/** Concepto que se muestra en la columna Concepto de los movimientos. */
export const NOTA_DEBITO_CONCEPTO = 'Nota de débito'

export const esNotaDebito = (description?: string | null): boolean =>
  (description ?? '').startsWith(NOTA_DEBITO_TAG)

/** Motivo cargado al registrar la nota (sin el tag). */
export const motivoNotaDebito = (description?: string | null): string =>
  esNotaDebito(description) ? (description ?? '').slice(NOTA_DEBITO_TAG.length).trim() : ''

/** Descripción a guardar en la transacción a partir del motivo del usuario. */
export const descripcionNotaDebito = (motivo?: string): string => {
  const limpio = (motivo ?? '').trim()
  return limpio ? `${NOTA_DEBITO_TAG} ${limpio}` : NOTA_DEBITO_TAG
}
