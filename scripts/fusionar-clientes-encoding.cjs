// Fusiona los clientes duplicados por encoding (la "ñ" quedó como "�").
// Reapunta ventas, pedidos y transacciones del CORRUPTO al cliente REGENERADO
// (con "ñ" correcta), suma el balance y borra ÚNICAMENTE el cliente corrupto.
// El suelto DOÑA ELBA NUEVO no tiene duplicado: solo se le corrige el nombre.
//
// Borra SOLO los clientes corruptos listados acá. Nada más.
//
// Uso:
//   node scripts/fusionar-clientes-encoding.cjs           (dry-run, no modifica)
//   node scripts/fusionar-clientes-encoding.cjs --apply   (ejecuta)
const fs = require('fs');
const path = require('path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const g = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const URL = g('NEXT_PUBLIC_SUPABASE_URL'), KEY = g('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const APPLY = process.argv.includes('--apply');
const money = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

// corrupto -> destino (cliente regenerado con "ñ"). Para fusionar.
const PARES = [
  { corrupto: 'cliente_cabaadiana_1', destino: 'cliente_cabanadiana_44' },
  { corrupto: 'cliente_montaanaaldo_1', destino: 'cliente_montananaaldo_85' },
  { corrupto: 'cliente_doachola_1', destino: 'cliente_donachola_62' },
  { corrupto: 'cliente_granjadoachola2_1', destino: 'cliente_granjadonachola2_64' },
  { corrupto: 'cliente_mioyolanda_1', destino: 'cliente_minoyolanda_24' },
];
// corrupto sin duplicado -> solo renombrar
const RENAMES = [
  { id: 'cliente_doaelbanuevo_1', nombre: 'DOÑA ELBA NUEVO' },
];

async function rest(pathq, opts = {}) {
  const { headers: oh, ...rest } = opts;
  const r = await fetch(`${URL}/rest/v1/${pathq}`, { ...rest, headers: { ...H, ...(oh || {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${pathq} → ${txt}`);
  return txt ? JSON.parse(txt) : null;
}
async function getOne(table, id, sel) {
  const [row] = await rest(`${table}?id=eq.${encodeURIComponent(id)}&select=${sel}`);
  return row || null;
}

(async () => {
  console.log(`=== ${APPLY ? 'FUSIÓN REAL (--apply)' : 'DRY-RUN (no modifica nada)'} ===\n`);

  for (const { corrupto, destino } of PARES) {
    const cC = await getOne('clientes', corrupto, 'id,name,current_balance');
    const cD = await getOne('clientes', destino, 'id,name,current_balance');
    if (!cC) { console.log(`SALTEADO: corrupto ${corrupto} no existe (¿ya fusionado?)\n`); continue; }
    if (!cD) { console.log(`ABORTADO par: destino ${destino} no existe.\n`); continue; }

    const nuevoBalance = Number(cD.current_balance || 0) + Number(cC.current_balance || 0);
    console.log(`▸ "${cC.name}" (${corrupto})  →  "${cD.name}" (${destino})`);
    console.log(`   balance: ${money(cD.current_balance)} + ${money(cC.current_balance)} = ${money(nuevoBalance)}`);

    for (const t of ['ventas', 'pedidos', 'transacciones']) {
      const filas = await rest(`${t}?client_id=eq.${encodeURIComponent(corrupto)}&select=id`);
      if (!filas.length) { console.log(`   ${t}: 0 filas`); continue; }
      console.log(`   ${t}: ${filas.length} fila(s) → reapuntar a ${destino}`);
      if (APPLY) {
        const body = t === 'transacciones'
          ? { client_id: destino }
          : { client_id: destino, client_name: cD.name };
        await rest(`${t}?client_id=eq.${encodeURIComponent(corrupto)}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
    }

    if (APPLY) {
      await rest(`clientes?id=eq.${encodeURIComponent(destino)}`, {
        method: 'PATCH', body: JSON.stringify({ current_balance: nuevoBalance }),
      });
      await rest(`clientes?id=eq.${encodeURIComponent(corrupto)}`, { method: 'DELETE' });
      console.log(`   ✔ balance actualizado y cliente corrupto borrado`);
    }
    console.log('');
  }

  for (const { id, nombre } of RENAMES) {
    const c = await getOne('clientes', id, 'id,name');
    if (!c) { console.log(`RENAME SALTEADO: ${id} no existe\n`); continue; }
    console.log(`▸ rename "${c.name}" (${id}) → "${nombre}"`);
    if (APPLY) {
      await rest(`clientes?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name: nombre }) });
      console.log(`   ✔ nombre corregido`);
    }
    console.log('');
  }

  if (!APPLY) console.log('DRY-RUN: nada fue modificado. Ejecutá con --apply.');
  else console.log('=== LISTO ===\nNota: el campo "saldo" histórico por transacción no se recalcula; current_balance (deuda total) sí queda sumado.');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
