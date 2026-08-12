// Backfill: productos con codigo/code en NULL. Sin codigo no aparecen al buscar
// en "Nueva venta". El codigo se recupera de dos fuentes:
//   1. El sufijo del id, para los productos importados del mayorista (prod_mp_XXXX).
//   2. La FK mayorista_productos.producto_id, para los creados a mano y luego
//      vinculados a un producto del mayorista (id producto_XXXX).
require('dotenv').config({ path: '.env' })
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  const { data: pendientes, error } = await s
    .from('productos')
    .select('id, name')
    .is('codigo', null)
    .is('code', null)
  if (error) throw error
  console.log(`Sin codigo: ${pendientes.length}`)
  if (pendientes.length === 0) return

  // Codigos por FK desde mayorista_productos
  const { data: mayorista, error: eM } = await s
    .from('mayorista_productos')
    .select('codigo, producto_id')
    .in('producto_id', pendientes.map((p) => p.id))
  if (eM) throw eM
  const codigoPorProductoId = new Map(mayorista.map((m) => [m.producto_id, m.codigo]))

  let ok = 0
  const sinFuente = []
  for (const p of pendientes) {
    const codigo = p.id.startsWith('prod_mp_')
      ? p.id.slice('prod_mp_'.length)
      : codigoPorProductoId.get(p.id)
    if (!codigo) {
      sinFuente.push(p)
      continue
    }
    const { error: e } = await s.from('productos').update({ codigo, code: codigo }).eq('id', p.id)
    if (e) console.error(p.id, e.message)
    else { ok++; console.log(`${p.id} -> ${codigo} (${p.name})`) }
  }

  console.log(`Actualizados: ${ok}/${pendientes.length}`)
  if (sinFuente.length > 0) {
    console.log('Sin codigo recuperable (cargar a mano):')
    for (const p of sinFuente) console.log(`  ${p.id} (${p.name})`)
  }
})()
