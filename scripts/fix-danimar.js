// Borra el pedido fantasma sin remito de danimar (deja solo el del remito R-2026-00072).
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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=minimal' };

(async () => {
  const id = 'pedido_despensadanimar_1';
  const r = await fetch(`${URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: H });
  console.log(`DELETE ${id} -> ${r.status}`);
})();
