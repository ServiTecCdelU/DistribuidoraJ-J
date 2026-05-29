/**
 * Carga el catálogo completo del mayorista desde pedido-mayorista.xlsx a la tabla
 * mayorista_productos.
 *
 * - Toma código (col B) y nombre/descripción (col C). NO usa el código de barras (col A).
 * - Solo INSERTA los códigos que todavía no existen en la base. Los productos ya
 *   cargados (habilitados, con precio y producto_id) se dejan intactos.
 * - Los nuevos se cargan deshabilitados (habilitado=false), listos para habilitar
 *   y ponerles precio de venta después.
 *
 * Uso: node scripts/cargar-mayorista-desde-excel.cjs [archivo.xlsx]
 */
const path = require('path')
const dotenv = require('dotenv')
const XLSX = require('xlsx-js-style')
const { createClient } = require('@supabase/supabase-js')

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY)
const BATCH_SIZE = 500

const archivo = process.argv[2] || path.resolve(__dirname, '..', 'pedido-mayorista.xlsx')

// Columnas del Excel del mayorista:
// A=Barra (ignorada), B=Código, C=Descripción, D=Cons. Final, E=Rubro, F=Subrubro, G=N°
const COL = { barra: 0, codigo: 1, descripcion: 2, precio: 3, rubro: 4, subrubro: 5 }

const str = (v) => (v == null ? '' : String(v).trim())
const num = (v) => {
  if (v == null || v === '') return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}
const idFor = (codigo) => `mp_${codigo.replace(/[^a-zA-Z0-9]/g, '_')}`

function leerExcel() {
  const wb = XLSX.readFile(archivo)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  // Fila 0 = encabezados
  const data = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const codigo = str(r[COL.codigo])
    const descripcion = str(r[COL.descripcion])
    if (!codigo || !descripcion) continue
    data.push({
      id: idFor(codigo),
      codigo,
      descripcion,
      precio_lista: num(r[COL.precio]),
      codigo_barras: str(r[COL.barra]),
      rubro: str(r[COL.rubro]),
      subrubro: str(r[COL.subrubro]),
      categoria: str(r[COL.rubro]),
    })
  }
  // Deduplicar por id (último gana)
  const byId = new Map()
  for (const row of data) byId.set(row.id, row)
  return [...byId.values()]
}

async function idsExistentes() {
  const set = new Set()
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('mayorista_productos')
      .select('id')
      .range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const d of data) set.add(d.id)
    if (data.length < 1000) break
    from += 1000
  }
  return set
}

async function main() {
  console.log(`Leyendo ${path.basename(archivo)}...`)
  const productos = leerExcel()
  console.log(`Productos válidos en Excel: ${productos.length}`)

  const existentes = await idsExistentes()
  console.log(`Ya existen en la base: ${existentes.size}`)

  const nuevos = productos.filter((p) => !existentes.has(p.id))
  console.log(`Nuevos a insertar: ${nuevos.length}`)
  if (nuevos.length === 0) {
    console.log('No hay productos nuevos. Nada para hacer.')
    return
  }

  let insertados = 0
  for (let i = 0; i < nuevos.length; i += BATCH_SIZE) {
    const chunk = nuevos.slice(i, i + BATCH_SIZE).map((p) => ({
      ...p,
      habilitado: false,
    }))
    const { error } = await sb.from('mayorista_productos').insert(chunk)
    if (error) throw new Error(`Error en batch ${i}: ${error.message}`)
    insertados += chunk.length
    console.log(`  insertados ${insertados}/${nuevos.length}`)
  }

  const { count } = await sb
    .from('mayorista_productos')
    .select('*', { count: 'exact', head: true })
  console.log(`\nListo. Insertados ${insertados} nuevos. Total en mayorista_productos: ${count}`)
}

main().catch((err) => {
  console.error('ERROR:', err.message)
  process.exit(1)
})
