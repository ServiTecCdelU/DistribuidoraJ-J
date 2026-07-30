/**
 * Deudas anteriores: ventas viejas cargadas a mano en la cuenta corriente.
 * Se marcan con un tag en la descripción de la transacción (type 'debt'), sin
 * productos, sin stock y sin comisión. Helpers puros de parseo/etiquetado.
 */
export const DEUDA_ANT_TAG = '[DEUDA_ANT]'

/** Concepto que se muestra en la columna Concepto de los movimientos. */
export const DEUDA_ANT_CONCEPTO = 'DEUDA ANT.'

export const esDeudaAnterior = (description?: string | null): boolean =>
  (description ?? '').startsWith(DEUDA_ANT_TAG)

/** Comentario libre cargado al registrar la deuda (sin el tag). */
export const notaDeudaAnterior = (description?: string | null): string =>
  esDeudaAnterior(description) ? (description ?? '').slice(DEUDA_ANT_TAG.length).trim() : ''

/** Descripción a guardar en la transacción a partir del comentario del usuario. */
export const descripcionDeudaAnterior = (nota?: string): string => {
  const limpia = (nota ?? '').trim()
  return limpia ? `${DEUDA_ANT_TAG} ${limpia}` : DEUDA_ANT_TAG
}
