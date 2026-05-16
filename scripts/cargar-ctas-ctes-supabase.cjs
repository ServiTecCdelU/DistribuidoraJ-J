/**
 * Carga vendedores y clientes con deuda en Supabase desde output-ctas-ctes.json
 *
 * Uso: node scripts/cargar-ctas-ctes-supabase.cjs
 */

const { createClient } = require('@supabase/supabase-js')
const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Generar código de cliente: cli_<3 primeras letras apellido><3 primeras letras nombre>_<secuencial>
function generateClientCode(name, index) {
  const slug = slugify(name)
  return `cliente_${slug}_${index}`
}

async function main() {
  // Verificar si seller_id existe en clientes
  const { error: colCheck } = await supabase.from('clientes').select('seller_id').limit(1)
  const hasSellerId = !colCheck || !colCheck.message?.includes('seller_id')

  if (!hasSellerId) {
    console.log('⚠ Columna seller_id no existe aún. Creando clientes SIN asignación de vendedor.')
    console.log('  Después de ejecutar migration-cuenta-corriente.sql, correr: node scripts/asignar-vendedores.cjs')
  } else {
    console.log('✓ Columna seller_id existe')
  }

  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'output-ctas-ctes.json'), 'utf-8'))

  // 1. Crear vendedores
  const vendedorNames = [...new Set(data.map((d) => d.vendedor))]
  const vendedorMap = {} // name → id

  console.log('=== Creando vendedores ===')
  for (const name of vendedorNames) {
    const id = `vendedor_${slugify(name)}_1`

    // Verificar si ya existe
    const { data: existing } = await supabase
      .from('vendedores')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (existing) {
      console.log(`  ✓ ${name} ya existe (${id})`)
      vendedorMap[name] = id
      continue
    }

    const parts = name.split(' ')
    const { error } = await supabase.from('vendedores').insert({
      id,
      name,
      email: '',
      phone: '',
      employee_type: 'vendedor',
      commission_rate: 10,
      is_active: true,
      total_sales: 0,
      total_commission: 0,
    })

    if (error) {
      console.error(`  ✗ Error creando ${name}:`, error.message)
    } else {
      console.log(`  + ${name} → ${id}`)
    }
    vendedorMap[name] = id
  }

  // 2. Crear clientes con deuda y asignar vendedor
  console.log('\n=== Creando clientes ===')
  let created = 0
  let updated = 0
  let errors = 0

  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    const sellerId = vendedorMap[row.vendedor]
    const clientId = generateClientCode(row.cliente, i + 1)

    // Buscar si ya existe por nombre (case insensitive)
    const { data: existing } = await supabase
      .from('clientes')
      .select('id, current_balance')
      .ilike('name', row.cliente)
      .maybeSingle()

    if (existing) {
      // Actualizar balance y asignar vendedor
      const updateData = { current_balance: row.deudaTotal }
      if (hasSellerId) updateData.seller_id = sellerId

      const { error } = await supabase
        .from('clientes')
        .update(updateData)
        .eq('id', existing.id)

      if (error) {
        console.error(`  ✗ Error actualizando ${row.cliente}:`, error.message)
        errors++
      } else {
        updated++
      }
      continue
    }

    // Crear nuevo cliente
    const insertData = {
      id: clientId,
      name: row.cliente,
      email: '',
      phone: '',
      dni: '',
      cuit: '',
      tax_category: 'consumidor_final',
      credit_limit: Math.ceil(row.deudaTotal * 1.5), // Límite = 150% de deuda actual
      current_balance: row.deudaTotal,
      addresses: [],
    }
    if (hasSellerId) insertData.seller_id = sellerId

    const { error } = await supabase.from('clientes').insert(insertData)

    if (error) {
      console.error(`  ✗ Error creando ${row.cliente}:`, error.message)
      errors++
    } else {
      created++
    }
  }

  console.log(`\n=== Resultado ===`)
  console.log(`  Creados: ${created}`)
  console.log(`  Actualizados: ${updated}`)
  console.log(`  Errores: ${errors}`)
  console.log(`  Total procesados: ${data.length}`)

  // 3. Crear transacción inicial de deuda por cada cliente
  console.log('\n=== Creando transacciones de deuda inicial ===')
  let txCreated = 0

  for (let i = 0; i < data.length; i++) {
    const row = data[i]

    // Buscar el cliente
    const { data: client } = await supabase
      .from('clientes')
      .select('id')
      .ilike('name', row.cliente)
      .maybeSingle()

    if (!client) continue

    // Verificar si ya tiene transacción de apertura
    const { data: existingTx } = await supabase
      .from('transacciones')
      .select('id')
      .eq('client_id', client.id)
      .ilike('description', '%Saldo inicial%')
      .maybeSingle()

    if (existingTx) continue

    const txId = `transaccion_saldoinicial_${slugify(row.cliente)}_1`
    const { error } = await supabase.from('transacciones').insert({
      id: txId,
      client_id: client.id,
      type: 'debt',
      amount: row.deudaTotal,
      description: `Saldo inicial importado (${row.cantidadComprobantes} comprobantes)`,
      date: row.ultimaFechaEmision || new Date().toISOString(),
    })

    if (error) {
      // Puede ser ID duplicado, ignorar
    } else {
      txCreated++
    }
  }

  console.log(`  Transacciones creadas: ${txCreated}`)
  console.log('\n✓ Proceso completado')
}

main().catch(console.error)
