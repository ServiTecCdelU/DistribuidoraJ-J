// Busca ventas duplicadas de SUPERMERCADO LARROQUE (caja muestra repetido, #N50-04-06-2026).
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = {};
fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
  const m = line.match(/^([^#=]+)=["']?([^"'\r]*)["']?/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

(async () => {
  const r = await fetch(`${URL}/rest/v1/ventas?or=(client_name.ilike.*larroque*,id.ilike.*larroque*)&select=id,sale_number,client_name,client_id,total,payment_type,created_at,remito_number&order=created_at.desc`, { headers: H });
  const vs = await r.json();
  console.log(`Ventas LARROQUE: ${vs.length}\n`);
  for (const v of vs) {
    console.log(`${v.id} | N${v.sale_number ?? '?'} | ${v.client_name} | total=${v.total} | pago=${v.payment_type} | remito=${v.remito_number||'—'} | ${v.created_at}`);
  }

  // Agrupar por sale_number para detectar repetidos
  const byNum = {};
  for (const v of vs) (byNum[v.sale_number] = byNum[v.sale_number] || []).push(v);
  console.log('\nNumeros de venta repetidos:');
  for (const [n, arr] of Object.entries(byNum)) if (arr.length > 1) console.log(`  N${n}: ${arr.length} veces -> ${arr.map(x=>x.id).join(', ')}`);
})();
