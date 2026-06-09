/**
 * Extrae el número entre paréntesis del name de cada vendedor → codigo_vendedor.
 * No modifica el name. Ejecutar tras correr la migración SQL.
 * Uso: node scripts/backfill-codigo-vendedor.cjs
 */
const { createClient } = require('@supabase/supabase-js')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data, error } = await supabase.from('vendedores').select('id, name, codigo_vendedor')
  if (error) { console.error('✗', error.message); process.exit(1) }

  let updated = 0
  for (const v of data) {
    const m = String(v.name).match(/\((\d+)\)/)
    const codigo = m ? String(parseInt(m[1], 10)) : null
    console.log(`${v.name} -> ${codigo ?? '(sin codigo)'}`)
    if (codigo && codigo !== v.codigo_vendedor) {
      const { error: e } = await supabase.from('vendedores').update({ codigo_vendedor: codigo }).eq('id', v.id)
      if (e) console.error(`  ✗ ${v.name}:`, e.message)
      else updated++
    }
  }
  console.log(`\n✓ Actualizados: ${updated}`)
}
main().catch(console.error)
