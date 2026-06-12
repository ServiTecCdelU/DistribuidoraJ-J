// Backfill FIFO de saldo por deuda (remito/venta) — equivalente al UPDATE de
// scripts/sql/saldo-por-remito.sql, hecho vía REST. Solo toca deudas con saldo NULL.
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const get = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const URL = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

(async () => {
  const r = await fetch(`${URL}/rest/v1/transacciones?select=id,client_id,type,amount,saldo,cuenta,date,created_at&client_id=not.is.null&order=date.asc,created_at.asc&limit=10000`, { headers: H });
  const txs = await r.json();
  if (txs.message) { console.log('ERROR:', txs.message); return; }

  // Agrupar por cliente + cuenta
  const grupos = new Map();
  for (const t of txs) {
    const key = `${t.client_id}|${t.cuenta || 'minorista'}`;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(t);
  }

  let updates = 0;
  for (const [key, lista] of grupos) {
    const deudas = lista.filter((t) => t.type === 'debt');
    if (!deudas.some((d) => d.saldo == null)) continue; // nada que backfillear
    const pagado = lista.filter((t) => t.type === 'payment').reduce((a, t) => a + Number(t.amount || 0), 0);

    let cum = 0;
    for (const d of deudas) {
      const amount = Number(d.amount) || 0;
      cum += amount;
      const saldo = Math.max(0, Math.min(amount, cum - pagado));
      if (d.saldo != null) continue; // ya tiene saldo (trigger o pago nuevo)
      const res = await fetch(`${URL}/rest/v1/transacciones?id=eq.${encodeURIComponent(d.id)}`, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ saldo: Math.round(saldo * 100) / 100 }),
      });
      if (!res.ok) { console.log('FALLO', d.id, await res.text()); return; }
      updates++;
    }
  }
  console.log(`Backfill listo: ${updates} deudas actualizadas.`);
})();
