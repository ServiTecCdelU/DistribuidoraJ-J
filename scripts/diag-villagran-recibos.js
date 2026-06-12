// Diagnóstico: busca al cliente VILLAGRAN MAXIMILIANO y sus pagos de prueba ($1) en cuenta corriente.
// Solo lista (no borra). Para eliminar: scripts/fix-villagran-recibos.js --apply

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

async function main() {
  // Buscar cliente por nombre (case-insensitive, contiene VILLAGRAN)
  const rc = await fetch(
    `${URL}/rest/v1/clientes?name=ilike.*villagran*&select=id,name,current_balance,current_balance_mayorista`,
    { headers: HGET }
  );
  const clientes = await rc.json();
  console.log('Clientes que matchean "villagran":', JSON.stringify(clientes, null, 2));
  if (!Array.isArray(clientes) || clientes.length === 0) return;

  for (const c of clientes) {
    const rt = await fetch(
      `${URL}/rest/v1/transacciones?client_id=eq.${encodeURIComponent(c.id)}&select=id,type,amount,description,date,sale_id,cuenta&order=date.desc`,
      { headers: HGET }
    );
    const txs = await rt.json();
    console.log(`\n== ${c.name} (${c.id}) | saldo min: ${c.current_balance} | saldo may: ${c.current_balance_mayorista ?? 0} ==`);
    for (const t of (Array.isArray(txs) ? txs : [])) {
      const flag = t.type === 'payment' && Math.abs(Number(t.amount)) <= 1 ? '  <-- pago $1 (candidato)' : '';
      console.log(`  ${t.date} | ${t.type} | $${t.amount} | ${t.cuenta ?? '-'} | ${t.description ?? ''} | ${t.id}${flag}`);
    }
  }
}
main().catch((e) => console.error(e));
