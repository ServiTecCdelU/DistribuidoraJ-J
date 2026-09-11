// Paginación de consultas a Supabase.
//
// PostgREST corta en 1000 filas por defecto: devuelve 1000 sin error y sin aviso. Una
// consulta que "funciona" hoy empieza a mentir cuando la tabla crece, y el caller toma
// el resultado truncado como completo.
//
// Pasó al auditar las cajas: una consulta sobre 1672 ventas devolvió 1000 y produjo un
// diagnóstico falso de 63 cajas descuadradas cuando eran 38.

export interface ResultadoPagina<T> {
  data: T[] | null
  error?: { message?: string } | null
}

export interface OpcionesPaginado {
  /** Filas por consulta. 1000 es el tope por defecto de PostgREST. */
  pageSize?: number
  /** Red de seguridad contra un bucle infinito si el backend siempre devuelve páginas llenas. */
  maxPaginas?: number
}

/**
 * Trae todas las filas de una consulta, página por página.
 *
 * Recibe una función que arma la consulta para cada rango: el query builder de Supabase se
 * consume al ejecutarse, así que hay que crear uno nuevo en cada llamada.
 *
 * ```ts
 * const ventas = await paginarTodo((desde, hasta) =>
 *   supabase.from('ventas').select('*').order('created_at').range(desde, hasta)
 * )
 * ```
 *
 * IMPORTANTE: la consulta debe tener un `.order()` por una columna estable. Sin orden
 * definido, Postgres no garantiza la misma secuencia entre páginas y se pueden repetir o
 * saltear filas.
 *
 * Ante un error corta y lo propaga: devolver los datos parciales sería peor que fallar,
 * porque el caller los tomaría como completos — exactamente el problema que esto resuelve.
 */
export async function paginarTodo<T>(
  // PromiseLike y no Promise: el query builder de Supabase es thenable pero no expone
  // catch ni finally, así que se puede pasar directo sin envolverlo.
  fetchPage: (desde: number, hasta: number) => PromiseLike<ResultadoPagina<T>>,
  opciones: OpcionesPaginado = {},
): Promise<T[]> {
  const pageSize = opciones.pageSize ?? 1000
  const maxPaginas = opciones.maxPaginas ?? 1000

  const todas: T[] = []
  let desde = 0

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const { data, error } = await fetchPage(desde, desde + pageSize - 1)

    if (error) {
      throw new Error(`Error paginando (filas ${desde}-${desde + pageSize - 1}): ${error.message ?? 'desconocido'}`)
    }

    const filas = data ?? []
    todas.push(...filas)

    // Página incompleta = era la última.
    if (filas.length < pageSize) return todas

    desde += pageSize
  }

  throw new Error(
    `Se alcanzó el tope de páginas (${maxPaginas} × ${pageSize} filas). ` +
    `Revisá el filtro de la consulta: no debería traer tantas filas.`,
  )
}
