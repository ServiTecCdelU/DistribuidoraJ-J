// Diagnóstico: pedidos del cliente 0062 y sus remitos en el listado de carga.
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

const total = (items) => (items || []).reduce((a, it) => {
  const base = (it.quantity || 0) * (it.price || 0);
  const d = it.itemDiscount ? base * it.itemDiscount / 100 : 0;
  return a + base - d;
}, 0);

(async () => {
  // Cliente por codigo 0062
  let r = await fetch(`${URL}/rest/v1/clientes?select=id,name,codigo&codigo=eq.0062`, { headers: H });
  let cli = await r.json();
  if (!cli.length) {
    r = await fetch(`${URL}/rest/v1/clientes?select=id,name,codigo&codigo=ilike.*62*`, { headers: H });
    cli = await r.json();
  }
  console.log('CLIENTES match 0062:', JSON.stringify(cli, null, 2));

  for (const c of cli) {
    const rr = await fetch(`${URL}/rest/v1/pedidos?select=id,status,remito_number,created_at,items&client_id=eq.${c.id}`, { headers: H });
    const peds = await rr.json();
    console.log(`\n=== Cliente ${c.name} (${c.codigo}) id=${c.id} — ${peds.length} pedidos ===`);
    for (const p of peds) {
      console.log(`  pedido ${p.id} | status=${p.status} | remito=${p.remito_number || '—'} | items=${(p.items||[]).length} | total=${total(p.items).toFixed(2)} | ${p.created_at}`);
    }
    const activos = peds.filter((p) => p.status !== 'completed');
    console.log(`  -> Importe listado (no completados) = ${activos.reduce((a, p) => a + total(p.items), 0).toFixed(2)}`);
    console.log(`  -> Remitos mostrados = ${activos.map((p) => p.remito_number).filter(Boolean).join(', ') || '—'}`);
  }

  // Buscar quién tiene remito 32 y 21
  for (const n of ['R-2026-00032', 'R-2026-00021']) {
    const rr = await fetch(`${URL}/rest/v1/pedidos?select=id,status,remito_number,client_id&remito_number=eq.${n}`, { headers: H });
    console.log(`\nPedidos con remito ${n}:`, JSON.stringify(await rr.json()));
  }
})();
