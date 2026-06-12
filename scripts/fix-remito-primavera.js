// Borra el remito (numero + PDF) del/los pedido(s) de Primavera para regenerar con el formato nuevo.
// READ por defecto; --apply para borrar.
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
const APPLY = process.argv.includes('--apply');

(async () => {
  const r = await fetch(`${URL}/rest/v1/pedidos?client_name=ilike.*primavera*&select=id,client_name,status,remito_number,items`, { headers: H });
  const rows = await r.json();
  console.log(`Pedidos Primavera (${rows.length}):`);
  rows.forEach((p) => console.log(`  ${p.id} | ${p.client_name} | status=${p.status} | remito=${p.remito_number || '—'} | items=${(p.items || []).length}`));

  const conRemito = rows.filter((p) => p.remito_number);
  if (conRemito.length === 0) { console.log('\nNinguno tiene remito.'); return; }

  if (!APPLY) {
    console.log('\nMODO LECTURA. Para borrar el remito: node scripts/fix-remito-primavera.js --apply');
    return;
  }

  for (const p of conRemito) {
    const d = await fetch(`${URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(p.id)}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ remito_number: null, remito_pdf_base64: null }),
    });
    console.log(`  ${p.id}: ${d.ok ? '✓ remito borrado' : 'ERROR ' + d.status}`);
  }
})();
