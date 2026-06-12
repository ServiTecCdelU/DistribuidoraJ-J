// Diagnostica pedidos de Sandra Barral y el item fernet (no aparece en descargar pedido).
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

const toDay = (v) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

(async () => {
  const r = await fetch(`${URL}/rest/v1/pedidos?status=neq.completed&or=(client_name.ilike.*sandra*,client_name.ilike.*barral*,id.ilike.*sandra*,id.ilike.*barral*)&select=id,client_id,client_name,status,remito_number,created_at,items`, { headers: H });
  const peds = await r.json();
  console.log(`Pedidos no completados de Sandra/Barral: ${peds.length}\n`);
  for (const p of peds) {
    console.log(`${p.id} | ${p.status} | remito=${p.remito_number||'—'} | dia=${toDay(p.created_at)} | created_at=${p.created_at}`);
    for (const it of (p.items || [])) {
      const fer = /fernet/i.test(it.name || '') ? '  <<< FERNET' : '';
      console.log(`     ${it.quantity} x [${it.codigo||'sin-cod'}] ${it.name} @ ${it.price}${fer}`);
    }
    console.log('');
  }

  // Buscar fernet en mayorista_productos por descripcion exacta de cada item fernet
  const fernetNames = new Set();
  for (const p of peds) for (const it of (p.items||[])) if (/fernet/i.test(it.name||'')) fernetNames.add(it.name);
  for (const nombre of fernetNames) {
    const q = await fetch(`${URL}/rest/v1/mayorista_productos?descripcion=eq.${encodeURIComponent(nombre)}&select=codigo,descripcion,producto_id,rubro,subrubro`, { headers: H });
    const d = await q.json();
    console.log(`mayorista_productos "${nombre}" -> ${JSON.stringify(d)}`);
  }
})();
