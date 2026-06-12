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
  // Ver columnas reales de un pedido JOANNAS
  let r = await fetch(`${URL}/rest/v1/pedidos?id=eq.pedido_joannasmariadelosangeles_1&select=*`, { headers: H });
  let arr = await r.json();
  console.log('=== COLUMNAS pedido_1 ===');
  if (arr[0]) {
    for (const k of Object.keys(arr[0])) {
      if (k === 'items' || k === 'remito_pdf_base64') continue;
      console.log(`  ${k} = ${JSON.stringify(arr[0][k])}`);
    }
  }

  // Buscar cualquier pedido cuyo numero contenga 260604
  r = await fetch(`${URL}/rest/v1/pedidos?or=(order_number.ilike.*260604*,numero.ilike.*260604*)&select=id,client_name,status,remito_number`, { headers: H });
  let txt = await r.text();
  console.log('\n=== BUSQUEDA 260604 ===');
  console.log(txt.slice(0, 1000));

  // Buscar cliente c-0175 / 0175
  r = await fetch(`${URL}/rest/v1/clientes?or=(numero.ilike.*0175*,codigo.ilike.*0175*,client_number.ilike.*0175*)&select=*`, { headers: H });
  txt = await r.text();
  console.log('\n=== BUSQUEDA CLIENTE 0175 ===');
  console.log(txt.slice(0, 1000));
}
main().catch(e => console.error(e));
