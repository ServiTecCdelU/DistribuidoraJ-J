// Consolida kiosko yeni: junta los items de los 2 pedidos en el que tiene remito R-2026-00079,
// borra el sin remito y limpia el PDF viejo (conserva el numero) para reimprimirlo completo.
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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const REMITO_ID = 'pedido_kioscoyeni_2'; // tiene R-2026-00079
const OTRO_ID = 'pedido_kioscoyeni_1';   // sin remito

(async () => {
  const get = async (id) => {
    const r = await fetch(`${URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}&select=id,items,remito_number`, { headers: H });
    return (await r.json())[0];
  };
  const a = await get(REMITO_ID);
  const b = await get(OTRO_ID);
  if (!a || !b) { console.log('No se encontraron ambos pedidos'); return; }

  // Merge por productId||name sumando cantidades
  const map = new Map();
  for (const it of [...(a.items || []), ...(b.items || [])]) {
    const key = it.productId || it.name;
    const ex = map.get(key);
    if (ex) map.set(key, { ...ex, quantity: (ex.quantity || 0) + (it.quantity || 0) });
    else map.set(key, { ...it });
  }
  const merged = Array.from(map.values());

  // Persistir merge en el pedido con remito + limpiar PDF (conservar numero)
  const up = await fetch(`${URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(REMITO_ID)}`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ items: merged, remito_pdf_base64: null }),
  });
  console.log(`PATCH ${REMITO_ID} (items=${merged.length}, pdf=null, remito=${a.remito_number}) -> ${up.status}`);

  // Borrar el pedido sin remito
  const del = await fetch(`${URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(OTRO_ID)}`, {
    method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' },
  });
  console.log(`DELETE ${OTRO_ID} -> ${del.status}`);
})();
