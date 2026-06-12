// Lista los rubros distintos en mayorista_productos y productos.category.
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

async function fetchAll(table, select, extra = '') {
  const out = []; let off = 0;
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${table}?select=${select}${extra}&limit=1000&offset=${off}`, { headers: H });
    const rows = await r.json(); out.push(...rows);
    if (rows.length < 1000) break; off += 1000;
  }
  return out;
}

(async () => {
  const may = await fetchAll('mayorista_productos', 'rubro,subrubro');
  const rubros = {};
  for (const m of may) { const k = (m.rubro || '(sin rubro)'); rubros[k] = (rubros[k] || 0) + 1; }
  console.log('RUBROS en mayorista_productos:');
  Object.entries(rubros).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));

  const sub = {};
  for (const m of may) { const k = (m.subrubro || '(sin subrubro)'); sub[k] = (sub[k] || 0) + 1; }
  console.log('\nSUBRUBROS (top 40):');
  Object.entries(sub).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));

  const prod = await fetchAll('productos', 'category');
  const cats = {};
  for (const p of prod) { const k = (p.category || '(sin category)'); cats[k] = (cats[k] || 0) + 1; }
  console.log('\nproductos.category (top 40):');
  Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
})();
