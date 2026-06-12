// Protege los medicamentos sin precio_base / no individuales:
// setea precio_base = precio_lista (costo del mayorista) y ganancia_individual = 1.
// NO toca price ni ganancia_global (el precio de venta queda igual).
// Uso:
//   node scripts/fix-medicamentos-individual.js          -> dry-run
//   node scripts/fix-medicamentos-individual.js --apply  -> aplica
const fs = require('fs');
const path = require('path');
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const env = {};
envContent.split('\n').forEach((l) => { const m = l.match(/^([^#=]+)=["']?([^"'\r]*)["']?/); if (m) env[m[1].trim()] = m[2].trim(); });
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL, SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');
const round2 = (n) => Math.round(n * 100) / 100;

async function get(table, qs) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { headers });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}
async function patch(table, qs, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

(async () => {
  console.log(APPLY ? '== APLICANDO ==' : '== DRY-RUN ==', '\n');
  // medicamentos no protegidos: sin precio_base o ganancia_individual != 1
  const meds = await get('productos',
    'select=id,codigo,name,price,precio_base,ganancia_global,ganancia_individual&category=ilike.*medicamento*&or=(precio_base.is.null,ganancia_individual.neq.1)');

  let ok = 0;
  for (const p of meds) {
    const mp = await get('mayorista_productos', `select=precio_lista&producto_id=eq.${encodeURIComponent(p.id)}`);
    const lista = mp[0]?.precio_lista != null ? Number(mp[0].precio_lista) : null;
    const gan = Number(p.ganancia_global) || 0;
    // base = precio_lista si existe; si no, derivar del price
    let base = p.precio_base != null ? Number(p.precio_base) : lista;
    if (base == null && gan > 0) base = round2(Number(p.price) / (1 + gan / 100));
    if (base == null) { console.log(`✗ [${p.codigo}] ${p.name} -> sin costo, omitido`); continue; }

    console.log(`· [${p.codigo}] ${(p.name || '').slice(0, 38)}  base ${p.precio_base ?? '-'}->${base}  ind ${p.ganancia_individual}->1  (price ${p.price} sin cambios)`);
    if (APPLY) {
      await patch('productos', `id=eq.${encodeURIComponent(p.id)}`, { precio_base: base, ganancia_individual: 1 });
      ok++;
    }
  }
  console.log('\n----------------------------------------');
  console.log(`Total a proteger: ${meds.length}`);
  if (APPLY) console.log(`Actualizados: ${ok}`);
  else console.log('Dry-run. Para aplicar: node scripts/fix-medicamentos-individual.js --apply');
})();
