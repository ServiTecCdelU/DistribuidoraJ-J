// Lista transacciones [ROTURA]/[FALTANTE] recientes y la caja activa.
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

(async () => {
  // Caja activa (hoy o última abierta)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let r = await fetch(`${URL}/rest/v1/caja?opened_at=gte.${today.toISOString()}&order=opened_at.desc&limit=1`, { headers: H });
  let cajas = await r.json();
  if (!cajas.length) {
    r = await fetch(`${URL}/rest/v1/caja?status=eq.open&order=opened_at.desc&limit=1`, { headers: H });
    cajas = await r.json();
  }
  const caja = cajas[0];
  const cajaDate = caja ? new Date(caja.opened_at) : today;
  cajaDate.setHours(0, 0, 0, 0);
  console.log('Caja activa:', caja ? `${caja.id} abierta ${caja.opened_at} (status ${caja.status})` : 'ninguna');
  console.log('cajaDate (corte):', cajaDate.toISOString(), '\n');

  // Transacciones de pérdida
  const t = await fetch(`${URL}/rest/v1/transacciones?or=(description.like.[ROTURA]*,description.like.[FALTANTE]*,description.like.[NO_QUIERE]*)&order=date.desc&limit=50`, { headers: H });
  const trans = await t.json();
  console.log(`Transacciones de incidencia (${trans.length}):`);
  trans.forEach((x) => {
    const enCaja = new Date(x.date) >= cajaDate ? '  ← APARECE EN CAJA HOY' : '';
    console.log(`  ${x.date} | $${x.amount} | ${x.description}${enCaja}`);
    console.log(`     id=${x.id}`);
  });
})();
