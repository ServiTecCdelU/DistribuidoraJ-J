// Anulación de pedidos. Reemplaza al borrado físico: un pedido anulado no se elimina,
// queda registrado con quién lo anuló, cuándo y por qué.
//
// Es distinto de 'rechazado': el rechazo es información comercial real (el cliente no lo
// quiso) y la anulación es la corrección de un error de carga. Mezclarlos ensuciaría
// cualquier análisis de rechazos por cliente.

export type EstadoPedido =
  | 'pending'
  | 'preparation'
  | 'delivery'
  | 'completed'
  | 'rechazado'
  | 'anulado'

/** Estados que sacan al pedido del flujo de trabajo (no se muestran como activos). */
export const ESTADOS_INACTIVOS: readonly EstadoPedido[] = ['completed', 'rechazado', 'anulado']

export interface CamposAnulacion {
  status: 'anulado'
  held: false
  anulado_at: string
  anulado_por: string
  anulado_motivo: string
}

/**
 * Campos que deja el pedido al anularse. El motivo es obligatorio: es exactamente el dato
 * que hoy se pierde para siempre cuando se elimina un pedido.
 */
export function camposAnulacion(
  responsable: string,
  motivo: string,
  ahora: Date = new Date(),
): CamposAnulacion {
  const quien = (responsable ?? '').trim()
  if (!quien) throw new Error('Falta el responsable de la anulación')

  const porQue = (motivo ?? '').trim()
  if (!porQue) throw new Error('El motivo de anulación es obligatorio')

  return {
    status: 'anulado',
    held: false,
    anulado_at: ahora.toISOString(),
    anulado_por: quien,
    anulado_motivo: porQue,
  }
}

export interface ResultadoPuedeAnular {
  ok: boolean
  motivo?: string
}

/**
 * Un pedido cobrado ya generó venta, movimiento de caja y comisión: anularlo desde acá
 * dejaría esos registros colgados. Esa corrección se hace desde Ventas.
 */
export function puedeAnularse(estado: EstadoPedido): ResultadoPuedeAnular {
  if (estado === 'completed') {
    return { ok: false, motivo: 'El pedido ya fue cobrado. Corregilo desde Ventas.' }
  }
  if (estado === 'anulado') {
    return { ok: false, motivo: 'El pedido ya está anulado.' }
  }
  if (estado === 'rechazado') {
    return { ok: false, motivo: 'El pedido está rechazado por el cliente, no corresponde anularlo.' }
  }
  return { ok: true }
}
