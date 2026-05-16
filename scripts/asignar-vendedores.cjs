/**
 * Asigna seller_id a los clientes importados.
 * Ejecutar DESPUÉS de correr migration-cuenta-corriente.sql en Supabase SQL Editor.
 *
 * Uso: node scripts/asignar-vendedores.cjs
 */

const { createClient } = require('@supabase/supabase-js')
const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function slugify(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

async function main() {
  // Verificar columna
  const { error } = await supabase.from('clientes').select('seller_id').limit(1)
  if (error && error.message.includes('seller_id')) {
    console.error('✗ Columna seller_id no existe. Ejecutar migration-cuenta-corriente.sql primero.')
    process.exit(1)
  }

  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'output-ctas-ctes.json'), 'utf-8'))
  const vendedorNames = [...new Set(data.map((d) => d.vendedor))]

  // Mapear vendedores
  const vendedorMap = {}
  for (const name of vendedorNames) {
    vendedorMap[name] = `vendedor_${slugify(name)}_1`
  }

  console.log('=== Asignando vendedores a clientes ===')
  let updated = 0
  let errors = 0

  for (const row of data) {
    const sellerId = vendedorMap[row.vendedor]

    const { data: client } = await supabase
      .from('clientes')
      .select('id')
      .ilike('name', row.cliente)
      .maybeSingle()

    if (!client) {
      console.error(`  ✗ Cliente no encontrado: ${row.cliente}`)
      errors++
      continue
    }

    const { error: updateErr } = await supabase
      .from('clientes')
      .update({ seller_id: sellerId })
      .eq('id', client.id)

    if (updateErr) {
      console.error(`  ✗ Error ${row.cliente}:`, updateErr.message)
      errors++
    } else {
      updated++
    }
  }

  console.log(`\n✓ Actualizados: ${updated}`)
  if (errors) console.log(`✗ Errores: ${errors}`)
}

main().catch(console.error)
