// Elimina los 2 pagos de prueba ($1) de VILLAGRAN MAXIMILIANO en cuenta corriente y
// revierte el saldo (un pago resta del current_balance; al borrarlo se vuelve a sumar).
//
// Uso:  node scripts/fix-villagran-recibos.js          (dry-run)
//       node scripts/fix-villagran-recibos.js --apply  (aplica)

const fs = require('fs');
const path = require('path');
const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([^=#]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const HGET = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const HJSON = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
const APPLY = process.argv.includes('--apply');

const CLIENT_ID = 'cliente_villagranmaximiliano_60';
const TX_IDS = ['transaccion_villagranmaximiliano_2', 'transaccion_villagranmaximiliano_3'];

async function main() {
  // Releer las transacciones para validar antes de tocar nada
  const rt = await fetch(
    `${URL}/rest/v1/transacciones?id=in.(${TX_IDS.map(encodeURIComponent).join(',')})&select=id,type,amount,cuenta,description`,
    { headers: HGET }
  );
  const txs = await rt.json();
  if (!Array.isArray(txs) || txs.length === 0) { console.log('No se encontraron las transacciones (¿ya borradas?).'); return; }

  let revertirMin = 0;
  for (const t of txs) {
    if (t.type !== 'payment' || Math.abs(Number(t.amount)) > 1 || (t.cuenta && t.cuenta !== 'minorista')) {
      console.error('ABORTA: transacción inesperada, no se borra:', JSON.stringify(t));
      return;
    }
    revertirMin += Number(t.amount); // sumar de vuelta al saldo
    console.log(`  borrar ${t.id} | ${t.type} $${t.amount} | ${t.description}`);
  }

  const rc = await fetch(`${URL}/rest/v1/clientes?id=eq.${CLIENT_ID}&select=current_balance`, { headers: HGET });
  const [cli] = await rc.json();
  const saldoActual = Number(cli.current_balance) || 0;
  const saldoNuevo = saldoActual + revertirMin;
  console.log(`\n  saldo minorista: ${saldoActual} -> ${saldoNuevo} (+${revertirMin})`);

  if (!APPLY) { console.log('\nDry-run. Volvé a correr con --apply.'); return; }

  // 1. Revertir saldo
  await fetch(`${URL}/rest/v1/clientes?id=eq.${CLIENT_ID}`, {
    method: 'PATCH', headers: HJSON, body: JSON.stringify({ current_balance: saldoNuevo }),
  });
  // 2. Borrar las transacciones
  await fetch(`${URL}/rest/v1/transacciones?id=in.(${TX_IDS.map(encodeURIComponent).join(',')})`, {
    method: 'DELETE', headers: HJSON,
  });
  console.log('\nListo: 2 pagos de prueba eliminados y saldo revertido.');
}
main().catch((e) => console.error(e));
