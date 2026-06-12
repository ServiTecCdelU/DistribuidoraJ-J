// Busca el pedido de "la lecha yatasto" (nro 260529 = 2026-05-29),
// le pone itemDiscount=5% a cada item y borra el remito para poder regenerarlo.
// Uso:
//   node scripts/fix-remito-lecha.js          -> SOLO LECTURA
//   node scripts/fix-remito-lecha.js --apply  -> aplica descuento 5% y borra remito

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^([^#=]+)=["']?([^"'\r]*)["']?/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

(async () => {
  const url = `${SUPABASE_URL}/rest/v1/pedidos?select=id,client_name,status,remito_number,created_at,items&client_name=ilike.*lecha*&order=created_at.desc`;
  const res = await fetch(url, { headers });
  const rows = await res.json();

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No se encontraron pedidos con "lecha" en el nombre.');
    return;
  }

  console.log(`${APPLY ? '== APLICANDO ==' : '== SOLO LECTURA =='}\n`);
  for (const o of rows) {
    const items = Array.isArray(o.items) ? o.items : [];
    console.log(`[${o.id}]  ${o.client_name}  ${o.status}  remito=${o.remito_number || '—'}  ${o.created_at}`);
    items.forEach((it) => console.log(`    ${it.quantity}x ${it.name}  $${it.price}  dto=${it.itemDiscount ?? '—'}`));

    if (APPLY) {
      const nuevosItems = items.map((it) => ({ ...it, itemDiscount: 5 }));
      const patch = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(o.id)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ items: nuevosItems, remito_number: null, remito_pdf_base64: null }),
      });
      if (!patch.ok) console.log(`    ERROR: ${patch.status} ${await patch.text()}`);
      else console.log('    -> 5% aplicado y remito borrado');
    }
    console.log('');
  }

  if (!APPLY) console.log('Dry-run. Aplicar: node scripts/fix-remito-lecha.js --apply');
})();
