// Verifica columnas saldo/debt_id y consistencia del backfill FIFO
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const get = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const URL = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

(async () => {
  // 1. Columnas presentes
  const r = await fetch(`${URL}/rest/v1/transacciones?select=id,type,amount,saldo,debt_id,client_id,cuenta&limit=3&order=date.desc`, { headers: H });
  const rows = await r.json();
  if (rows.message) { console.log('ERROR:', rows.message); return; }
  console.log('Columnas OK. Últimas filas:');
  rows.forEach((x) => console.log(` ${x.type} ${x.amount} saldo=${x.saldo} (${x.id})`));

  // 2. Deudas sin saldo (no backfilleadas)
  const r2 = await fetch(`${URL}/rest/v1/transacciones?type=eq.debt&saldo=is.null&select=id&limit=1000`, { headers: H });
  console.log(`Deudas con saldo NULL: ${(await r2.json()).length}`);

  // 3. Consistencia: suma de saldos vs current_balance por cliente (minorista, top 5 deudores)
  const r3 = await fetch(`${URL}/rest/v1/clientes?current_balance=gt.0&select=id,name,current_balance&order=current_balance.desc&limit=5`, { headers: H });
  for (const c of await r3.json()) {
    const r4 = await fetch(`${URL}/rest/v1/transacciones?client_id=eq.${encodeURIComponent(c.id)}&type=eq.debt&or=(cuenta.eq.minorista,cuenta.is.null)&select=saldo`, { headers: H });
    const saldos = (await r4.json()).reduce((a, x) => a + (Number(x.saldo) || 0), 0);
    const dif = Math.abs(saldos - Number(c.current_balance));
    console.log(`${dif < 1 ? 'OK ' : 'DIF'} ${c.name}: balance=${c.current_balance} sumaSaldos=${saldos.toFixed(2)}`);
  }
})();
