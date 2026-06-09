/**
 * Lee clientes_Nueva Zona.csv y, matcheando cliente por NOMBRE, setea:
 *   codigo_externo = codigo del CSV
 *   seller_id      = vendedor cuyo codigo_vendedor coincide con codigo_vendedor del CSV
 * No crea clientes. Reporta no-matcheados.
 * Ejecutar tras la migración SQL y el backfill de vendedores.
 * Uso: node scripts/import-clientes-vendedor.cjs
 */
const { createClient } = require('@supabase/supabase-js')
const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const numOf = (v) => { const m = String(v).match(/\d+/); return m ? parseInt(m[0], 10) : null }

async function main() {
  // 1) Mapa numero -> seller_id
  const { data: vends, error: ev } = await supabase.from('vendedores').select('id, codigo_vendedor')
  if (ev) { console.error('✗', ev.message); process.exit(1) }
  const vendByNum = new Map()
  vends.forEach((v) => { const n = numOf(v.codigo_vendedor); if (n != null) vendByNum.set(n, v.id) })
  console.log('Vendedores por codigo:', [...vendByNum.entries()].map(([n, id]) => `${n}->${id}`).join(', '))

  // 2) Clientes por nombre normalizado
  const { data: clients, error: ec } = await supabase.from('clientes').select('id, name')
  if (ec) { console.error('✗', ec.message); process.exit(1) }
  const clientByName = new Map()
  clients.forEach((c) => clientByName.set(norm(c.name), c))

  // 3) CSV
  const csvPath = path.resolve(__dirname, '..', 'clientes_Nueva Zona.csv')
  const raw = fs.readFileSync(csvPath, 'latin1').split(/\r?\n/).filter(Boolean)
  const rows = raw.slice(1).map((l) => l.split(';').map((x) => x.replace(/^"|"$/g, '')))

  let updated = 0
  const sinCliente = []
  const sinVendedor = []
  for (const r of rows) {
    // CSV: codigo;nombre;direccion;localidad;codigo_vendedor;codigo_zona;nombre_zona
    const codigo = r[0]
    const nombre = r[1]
    const codVend = r[4]
    const c = clientByName.get(norm(nombre))
    if (!c) { sinCliente.push(`${codigo} ${nombre}`); continue }
    const sellerId = vendByNum.get(numOf(codVend))
    if (!sellerId) { sinVendedor.push(`${nombre} (codVend ${codVend})`) }
    const { error: e } = await supabase
      .from('clientes')
      .update({ codigo_externo: String(codigo), seller_id: sellerId ?? null })
      .eq('id', c.id)
    if (e) console.error(`  ✗ ${nombre}:`, e.message)
    else updated++
  }

  console.log(`\n✓ Clientes actualizados: ${updated}`)
  console.log(`✗ Sin match por nombre (${sinCliente.length}):`)
  sinCliente.forEach((x) => console.log('   ' + x))
  if (sinVendedor.length) {
    console.log(`⚠ Filas con codigo_vendedor sin vendedor (${sinVendedor.length}):`)
    sinVendedor.forEach((x) => console.log('   ' + x))
  }
}
main().catch(console.error)
