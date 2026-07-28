export interface HojaRutaFiltrable {
  numero: string
  fechaReparto: string
}

/**
 * Filtra hojas de ruta por N° y/o fecha de reparto.
 * El N° se compara sin ceros a la izquierda para que "56" encuentre "056".
 */
export function filtrarHojasRuta<T extends HojaRutaFiltrable>(
  hojas: T[],
  filtros: { numero?: string; fecha?: string },
): T[] {
  const nro = (filtros.numero || '').trim().replace(/^0+/, '').toLowerCase()
  const fecha = filtros.fecha || ''

  return hojas.filter((h) => {
    if (nro && !h.numero.replace(/^0+/, '').toLowerCase().includes(nro)) return false
    if (fecha && h.fechaReparto !== fecha) return false
    return true
  })
}
