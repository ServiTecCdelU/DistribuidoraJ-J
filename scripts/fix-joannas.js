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
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, Prefer: 'return=minimal' };

async function main() {
  const id = 'pedido_joannasmariadelosangeles_1';
  const r = await fetch(`${URL}/rest/v1/pedidos?id=eq.${id}`, { method: 'DELETE', headers: H });
  console.log('DELETE', id, '->', r.status);
}
main().catch(e => console.error(e));
