// SOLO LECTURA: cruza los medicamentos SIN precio_base contra mayorista_productos
// para ver su precio_lista (costo real) y si su ganancia es consistente.
const fs = require('fs');
const path = require('path');
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const env = {};
envContent.split('\n').forEach((l) => { const m = l.match(/^([^#=]+)=["']?([^"'\r]*)["']?/); if (m) env[m[1].trim()] = m[2].trim(); });
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL, SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const round2 = (n) => Math.round(n * 100) / 100;

async function get(table, qs) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { headers });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

(async () => {
  const meds = await get('productos',
    'select=id,codigo,name,price,ganancia_global,ganancia_individual&category=ilike.*medicamento*&precio_base=is.null');
  console.log('=== MEDICAMENTOS sin precio_base vs mayorista ===\n');
  for (const p of meds) {
    const mp = await get('mayorista_productos', `select=precio_lista,habilitado&producto_id=eq.${encodeURIComponent(p.id)}`);
    const lista = mp[0]?.precio_lista != null ? Number(mp[0].precio_lista) : null;
    const gan = Number(p.ganancia_global) || 0;
    const baseImplicita = gan > 0 ? round2(Number(p.price) / (1 + gan / 100)) : null;
    const recalcDesdeLista = lista != null ? round2(lista * (1 + gan / 100)) : null;
    console.log(`[${p.codigo}] ${(p.name || '').slice(0, 38)}`);
    console.log(`   price=${p.price}  gan=${gan}%  ind=${p.ganancia_individual}  hab=${mp[0]?.habilitado}`);
    console.log(`   costo implícito (price/1+gan)=${baseImplicita}   precio_lista mayorista=${lista}`);
    if (lista != null && baseImplicita != null) {
      console.log(`   -> si se recalcula desde precio_lista con ${gan}%: ${recalcDesdeLista} (dif ${round2(recalcDesdeLista - Number(p.price))})`);
    }
    console.log('');
  }
})();
