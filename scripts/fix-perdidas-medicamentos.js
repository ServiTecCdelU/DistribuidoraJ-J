// Borra las transacciones [ROTURA] de HOY que son ajustes de stock (no pérdidas reales).
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
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const desde = today.toISOString();
  // [ROTURA] de hoy en adelante
  const sel = `${URL}/rest/v1/transacciones?date=gte.${desde}&description=like.%5BROTURA%5D*&select=id,date,amount,description&order=date.desc`;
  const r = await fetch(sel, { headers: H });
  const rows = await r.json();
  const total = rows.reduce((s, x) => s + Math.abs(Number(x.amount) || 0), 0);
  console.log(`Transacciones [ROTURA] de hoy (${rows.length}) — total $${total.toLocaleString('es-AR')}:`);
  rows.forEach((x) => console.log(`  ${x.date} | $${x.amount} | ${x.description}`));

  if (!APPLY) {
    console.log('\nMODO LECTURA. Para borrar: node scripts/fix-perdidas-medicamentos.js --apply');
    return;
  }

  const del = await fetch(`${URL}/rest/v1/transacciones?date=gte.${desde}&description=like.%5BROTURA%5D*`, {
    method: 'DELETE',
    headers: { ...H, Prefer: 'return=representation' },
  });
  const deleted = await del.json();
  console.log(`\n✓ Borradas ${Array.isArray(deleted) ? deleted.length : 0} transacciones.`);
})();
