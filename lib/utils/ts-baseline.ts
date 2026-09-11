// Comparación de errores de TypeScript contra un baseline congelado.
//
// El proyecto compila con `typescript.ignoreBuildErrors: true` y arrastra ~99 errores. No se
// pueden arreglar de una, pero sí evitar que crezcan: se congela el conteo POR ARCHIVO y se
// falla si alguno sube o si aparece un archivo nuevo con errores.
//
// Por archivo y no por total: con el total, un error nuevo en un archivo puede quedar tapado
// por uno resuelto en otro. Fue exactamente lo que dejó pasar un `AuditAction` inválido — 99
// errores antes, 99 después.

/** Conteo de errores por archivo, con rutas normalizadas a barras `/`. */
export type ConteoPorArchivo = Record<string, number>

const LINEA_ERROR = /^(.+?)\((\d+),(\d+)\):\s+error\s+TS\d+/

/** Parsea la salida de `tsc --noEmit` y cuenta errores por archivo. */
export function contarPorArchivo(salidaTsc: string): ConteoPorArchivo {
  const conteo: ConteoPorArchivo = {}
  for (const linea of salidaTsc.split(/\r?\n/)) {
    const m = LINEA_ERROR.exec(linea.trim())
    if (!m) continue
    const archivo = m[1].replace(/\\/g, '/')
    conteo[archivo] = (conteo[archivo] ?? 0) + 1
  }
  return conteo
}

export interface CambioArchivo {
  archivo: string
  antes: number
  ahora: number
}

export interface ResultadoComparacion {
  ok: boolean
  /** Archivos con más errores que en el baseline, o nuevos. Bloquean. */
  empeoraron: CambioArchivo[]
  /** Archivos con menos errores. Se informan para actualizar el baseline. */
  mejoraron: CambioArchivo[]
  totalAntes: number
  totalAhora: number
}

const sumar = (c: ConteoPorArchivo): number =>
  Object.values(c).reduce((a, n) => a + n, 0)

/** Compara el conteo actual contra el baseline. `ok: false` si algún archivo empeoró. */
export function compararConBaseline(
  baseline: ConteoPorArchivo,
  actual: ConteoPorArchivo,
): ResultadoComparacion {
  const empeoraron: CambioArchivo[] = []
  const mejoraron: CambioArchivo[] = []

  for (const archivo of new Set([...Object.keys(baseline), ...Object.keys(actual)])) {
    const antes = baseline[archivo] ?? 0
    const ahora = actual[archivo] ?? 0
    if (ahora > antes) empeoraron.push({ archivo, antes, ahora })
    else if (ahora < antes) mejoraron.push({ archivo, antes, ahora })
  }

  const porArchivo = (a: CambioArchivo, b: CambioArchivo) => a.archivo.localeCompare(b.archivo)

  return {
    ok: empeoraron.length === 0,
    empeoraron: empeoraron.sort(porArchivo),
    mejoraron: mejoraron.sort(porArchivo),
    totalAntes: sumar(baseline),
    totalAhora: sumar(actual),
  }
}
