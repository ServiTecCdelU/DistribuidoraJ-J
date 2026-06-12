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
  // Todos los pedidos en reparto
  let r = await fetch(`${URL}/rest/v1/pedidos?status=eq.delivery&select=id,client_name,client_id,remito_number,status&order=client_name.asc`, { headers: H });
  const reparto = await r.json();
  console.log('=== PEDIDOS EN REPARTO ===');
  for (const p of reparto) {
    console.log(`${p.remito_number ? 'R:' + p.remito_number : 'SIN REMITO'} | name="${p.client_name}" | client_id=${p.client_id} | id=${p.id}`);
  }

  // Buscar JOANNAS en cualquier estado
  r = await fetch(`${URL}/rest/v1/pedidos?or=(client_name.ilike.*joanna*,client_name.ilike.*angeles*)&select=id,client_name,client_id,remito_number,status,remito_pdf_base64`, { headers: H });
  const joa = await r.json();
  console.log('\n=== PEDIDOS JOANNAS / ANGELES (cualquier estado) ===');
  for (const p of joa) {
    console.log(`status=${p.status} | remito=${p.remito_number || 'NULL'} | pdf=${p.remito_pdf_base64 ? 'SI(' + p.remito_pdf_base64.length + ')' : 'NULL'} | name="${p.client_name}" | client_id=${p.client_id} | id=${p.id}`);
  }

  // Buscar cliente en tabla clientes
  r = await fetch(`${URL}/rest/v1/clientes?or=(name.ilike.*joanna*,name.ilike.*angeles*)&select=id,name`, { headers: H });
  const cli = await r.json();
  console.log('\n=== CLIENTES JOANNAS / ANGELES ===');
  console.log(JSON.stringify(cli, null, 2));
}
main().catch(e => console.error(e));
