// Backfill: productos provenientes del mayorista (id prod_mp_XXXX) que quedaron
// con codigo/code en NULL. Sin codigo no aparecen al buscar en "Nueva venta".
require('dotenv').config({ path: '.env' })
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  const { data, error } = await s
    .from('productos')
    .select('id, name')
    .is('codigo', null)
    .is('code', null)
    .like('id', 'prod_mp_%')
  if (error) throw error
  console.log(`A corregir: ${data.length}`)

  let ok = 0
  for (const p of data) {
    const codigo = p.id.slice('prod_mp_'.length)
    const { error: e } = await s.from('productos').update({ codigo, code: codigo }).eq('id', p.id)
    if (e) console.error(p.id, e.message)
    else { ok++; console.log(`${p.id} -> ${codigo} (${p.name})`) }
  }
  console.log(`Actualizados: ${ok}/${data.length}`)
})()
