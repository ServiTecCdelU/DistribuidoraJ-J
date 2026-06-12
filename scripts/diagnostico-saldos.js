// Diagnóstico (SOLO LECTURA) de saldos de cuenta corriente.
// Recalcula la deuda real de cada cliente desde la tabla `transacciones`
// (debt - payment) y la compara con current_balance actual.
// Uso: node scripts/diagnostico-saldos.js

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

async function getAll(table, select, extra = '') {
  let from = 0;
  const pageSize = 1000;
  const out = [];
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${extra}`;
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${from}-${from + pageSize - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

(async () => {
  const clientes = await getAll('clientes', 'id,name,current_balance');
  const txs = await getAll('transacciones', 'client_id,type,amount');

  // Saldo real por cliente segun transacciones
  const real = {};
  for (const t of txs) {
    if (!t.client_id) continue;
    const amt = Number(t.amount) || 0;
    if (!(t.client_id in real)) real[t.client_id] = 0;
    real[t.client_id] += t.type === 'debt' ? amt : -amt;
  }

  const round2 = (n) => Math.round(n * 100) / 100;

  // Clientes que figuran "Cancelada" (current_balance <= 0) pero
  // segun transacciones deberian tener deuda > 0
  const afectados = [];
  for (const c of clientes) {
    const actual = round2(Number(c.current_balance) || 0);
    const calculado = round2(real[c.id] || 0);
    if (actual <= 0 && calculado > 0) {
      afectados.push({ id: c.id, name: c.name, actual, calculado });
    }
  }

  afectados.sort((a, b) => b.calculado - a.calculado);

  console.log('=== CLIENTES EN $0 QUE DEBERIAN TENER DEUDA (segun transacciones) ===\n');
  console.log(`Total clientes: ${clientes.length}`);
  console.log(`Total transacciones: ${txs.length}`);
  console.log(`Afectados: ${afectados.length}\n`);

  let suma = 0;
  for (const a of afectados) {
    suma += a.calculado;
    console.log(`${a.name.padEnd(40)} actual=${a.actual}  ->  real=${a.calculado}   (${a.id})`);
  }
  console.log(`\nDeuda total a restaurar: $${round2(suma)}`);

  // Volcar a JSON para el paso de aplicacion
  fs.writeFileSync(
    path.join(__dirname, 'saldos-a-restaurar.json'),
    JSON.stringify(afectados, null, 2)
  );
  console.log('\nDetalle guardado en scripts/saldos-a-restaurar.json');
})();
