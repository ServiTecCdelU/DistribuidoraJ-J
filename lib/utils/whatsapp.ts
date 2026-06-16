// lib/utils/whatsapp.ts
// Construcción de enlaces wa.me (sin API key) para enviar mensajes a clientes.
// Normaliza teléfonos argentinos al formato internacional que espera WhatsApp.
// El monto llega ya formateado desde el llamador (formatCurrency) para mantener
// este módulo libre de dependencias pesadas y fácil de testear.

/**
 * Normaliza un teléfono argentino al formato de wa.me: 54 9 <area><numero>, solo dígitos.
 * Heurística pragmática para los formatos típicos que se cargan a mano:
 *  - "3541123456", "03541 123456", "(03541) 15-123456", "+54 9 3541 123456".
 * Devuelve null si no parece un número válido.
 */
export function normalizeArgPhone(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '')
  if (!d) return null

  // Ya viene con prefijo internacional argentino.
  if (d.startsWith('54')) {
    const rest = d.slice(2)
    // Asegurar el 9 de celular.
    return rest.startsWith('9') ? `54${rest}` : `549${rest}`
  }

  // Sacar el 0 de larga distancia inicial (0351...).
  d = d.replace(/^0/, '')

  // Nota: no intentamos quitar el "15" de celular local porque es ambiguo y
  // puede corromper números válidos. Si un teléfono se cargó con 15, conviene
  // guardarlo como código de área + número.
  if (d.length < 8) return null
  return `549${d}`
}

/**
 * Arma la URL wa.me con un recordatorio de deuda. Devuelve null si el teléfono
 * no es válido o no hay saldo a reclamar.
 */
export function buildDebtWhatsappUrl(params: {
  phone: string | null | undefined
  clientName: string
  balance: number
  /** Monto ya formateado (ej: "$ 1.500"). */
  montoFormateado: string
  businessName?: string
}): string | null {
  const { phone, clientName, balance, montoFormateado, businessName = 'Distribuidora Patricia' } = params
  if (!(balance > 0)) return null
  const num = normalizeArgPhone(phone)
  if (!num) return null

  const saludo = clientName?.trim() ? `Hola ${clientName.trim()}` : 'Hola'
  const mensaje =
    `${saludo}, te escribimos de ${businessName}. ` +
    `Te recordamos que figura un saldo pendiente de ${montoFormateado}. ` +
    `Cualquier consulta quedamos a disposición. ¡Gracias!`

  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`
}
