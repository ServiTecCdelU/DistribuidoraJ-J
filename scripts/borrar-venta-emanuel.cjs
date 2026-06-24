// Borra la venta N222-16-06-2026 y TODOS sus movimientos de cuenta corriente,
// estrictamente acotado al cliente Emanuel. Reajusta current_balance revirtiendo
// el impacto exacto de cada transacción (debt: +amount, payment: -amount).
//
// Uso:
//   node scripts/borrar-venta-emanuel.cjs           (dry-run, no borra)
//   node scripts/borrar-venta-emanuel.cjs --apply   (ejecuta el borrado)
const fs = require('fs');
const path = require('path');

const SALE_TAG = 'N222-16-06-2026';
const APPLY = process.argv.includes('--apply');

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(__dirname, '..', f);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  throw new Error('No se encontró .env.local ni .env');
}
const env = loadEnv();
const get = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const URL = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const money = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

async function rest(pathq, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${pathq}`, { headers: H, ...opts });
  const txt = await r.text();
  let body;
  try { body = txt ? JSON.parse(txt) : null; } catch { body = txt; }
  if (!r.ok) throw new Error(`${r.status} ${pathq} → ${txt}`);
  return body;
}

(async () => {
  console.log(`=== ${APPLY ? 'BORRADO REAL (--apply)' : 'DRY-RUN (no borra nada)'} ===\n`);

  // 1. Transacciones que mencionan esta venta
  const txns = await rest(
    `transacciones?description=ilike.*${encodeURIComponent(SALE_TAG)}*&select=id,client_id,type,amount,saldo,description,sale_id,date&order=date.asc`,
  );
  if (!txns.length) { console.log('No se encontraron transacciones para', SALE_TAG); return; }

  // 2. Resolver el cliente Emanuel entre los client_id presentes
  const clientIds = [...new Set(txns.map((t) => t.client_id))];
  console.log('client_id presentes en las txns:', clientIds, '\n');
  let clientId = null;
  for (const cid of clientIds.filter(Boolean)) {
    const [c] = await rest(`clientes?id=eq.${encodeURIComponent(cid)}&select=id,name`);
    if (c && /eman/i.test(c.name || '')) clientId = cid;
  }
  if (!clientId) { console.log('ABORTADO: no se encontró cliente Emanuel entre las txns.'); return; }

  // Separar lo de Emanuel de lo demás (que NO se toca)
  const otras = txns.filter((t) => t.client_id !== clientId);
  if (otras.length) {
    console.log(`Transacciones que NO son de Emanuel (NO se tocan) — ${otras.length}:`);
    for (const t of otras) {
      console.log(`   · client_id=${t.client_id ?? 'null'} [${t.type}] ${money(t.amount)} :: ${t.description}`);
    }
    console.log('');
  }
  const txnsEman = txns.filter((t) => t.client_id === clientId);

  const [client] = await rest(`clientes?id=eq.${encodeURIComponent(clientId)}&select=id,name,current_balance`);
  if (!client) { console.log('ABORTADO: cliente no encontrado', clientId); return; }

  // 4. sale_id de la venta
  const saleIds = [...new Set(txnsEman.map((t) => t.sale_id).filter(Boolean))];
  const saleId = saleIds[0];

  console.log(`Cliente: ${client.name} (${client.id})`);
  console.log(`Saldo actual: ${money(client.current_balance)}`);
  console.log(`sale_id: ${saleId || '(sin sale_id en txns)'}\n`);

  console.log(`Transacciones de Emanuel a borrar (${txnsEman.length}):`);
  let contribucion = 0; // impacto neto sobre current_balance
  for (const t of txnsEman) {
    const signo = t.type === 'debt' ? +1 : -1;
    contribucion += signo * Number(t.amount || 0);
    console.log(` - [${t.type}] ${money(t.amount)} saldo=${t.saldo ?? '—'} :: ${t.description}`);
  }
  console.log(`\nImpacto neto de estas txns sobre el saldo: ${money(contribucion)}`);
  const nuevoSaldo = Number(client.current_balance || 0) - contribucion;
  console.log(`Saldo resultante tras revertir: ${money(nuevoSaldo)}\n`);

  // 5. La venta en sí
  let venta = null;
  if (saleId) {
    const vs = await rest(`ventas?id=eq.${encodeURIComponent(saleId)}&select=id,sale_number,client_id,total,payment_type`);
    venta = vs[0] || null;
  }
  if (venta) {
    console.log(`Venta a borrar: id=${venta.id} #${venta.sale_number} total=${money(venta.total)} pago=${venta.payment_type}`);
    if (venta.client_id !== clientId) {
      console.log('ABORTADO: la venta pertenece a otro cliente. No se toca nada.');
      return;
    }
  } else {
    console.log('No se encontró fila en ventas (puede que ya no exista).');
  }

  if (!APPLY) {
    console.log('\nDRY-RUN: nada fue modificado. Ejecutá con --apply para borrar.');
    return;
  }

  // 6. BORRADO (acotado a client_id de Emanuel)
  console.log('\nBorrando transacciones...');
  for (const t of txnsEman) {
    await rest(`transacciones?id=eq.${encodeURIComponent(t.id)}&client_id=eq.${encodeURIComponent(clientId)}`, { method: 'DELETE' });
    console.log(`  borrada ${t.id}`);
  }

  if (venta) {
    console.log('Borrando venta...');
    await rest(`ventas?id=eq.${encodeURIComponent(venta.id)}&client_id=eq.${encodeURIComponent(clientId)}`, { method: 'DELETE' });
    console.log(`  borrada ${venta.id}`);
  }

  console.log('Reajustando saldo del cliente...');
  await rest(`clientes?id=eq.${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ current_balance: nuevoSaldo }),
  });
  console.log(`  saldo: ${money(client.current_balance)} → ${money(nuevoSaldo)}`);

  console.log('\n=== LISTO ===');
  console.log('Nota: no se revirtió stock ni comisión del vendedor (solo se tocó a Emanuel, como pediste).');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
