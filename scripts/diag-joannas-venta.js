const fs = require('fs');
const path = require('path');
const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([^=#]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

async function main() {
  // pedido_2 completo
  let r = await fetch(`${URL}/rest/v1/pedidos?id=eq.pedido_joannasmariadelosangeles_2&select=id,status,remito_number,sale_id,invoice_number,total,updated_at`, { headers: H });
  console.log('=== pedido_2 ===');
  console.log(await r.text());

  // Buscar venta de JOANNAS en tabla ventas
  r = await fetch(`${URL}/rest/v1/ventas?client_name=ilike.*joanna*&select=id,client_name,total,created_at,remito_number,order_id&order=created_at.desc`, { headers: H });
  let txt = await r.text();
  console.log('\n=== VENTAS JOANNAS (intento client_name) ===');
  console.log(txt.slice(0, 1500));
}
main().catch(e => console.error(e));
