// Diagnóstico (solo lectura) de clientes con nombres corruptos por encoding
// (ej. la "ñ" quedó como el carácter de reemplazo U+FFFD "�") y detección de
// duplicados: la versión corrupta vs la versión regenerada con "ñ".
//
// Para cada cliente involucrado muestra: balance, cantidad de transacciones
// (cuenta corriente) y cantidad de ventas, para decidir cuál conservar.
//
// Uso: node scripts/diag-clientes-encoding.cjs
const fs = require('fs');
const path = require('path');

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
const REPL = '�'; // carácter de reemplazo "�"

async function rest(pathq, opts = {}) {
  const { headers: oh, ...restOpts } = opts;
  const r = await fetch(`${URL}/rest/v1/${pathq}`, { ...restOpts, headers: { ...H, ...(oh || {}) } });
  const txt = await r.text();
  let body;
  try { body = txt ? JSON.parse(txt) : null; } catch { body = txt; }
  if (!r.ok) throw new Error(`${r.status} ${pathq} → ${txt}`);
  return { body, headers: r.headers };
}

// count exacto sin traer filas
async function count(table, filter) {
  const { headers } = await rest(`${table}?${filter}&select=id`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' },
  });
  const cr = headers.get('content-range') || '*/0';
  return Number((cr.split('/')[1] || '0')) || 0;
}

// clave normalizada: mayúsculas, cualquier carácter no [A-Z0-9 ] -> '?'
// así "CABAÑA DIANA" y "CABA�A DIANA" colapsan a "CABA?A DIANA"
function key(name) {
  return (name || '')
    .toUpperCase()
    .normalize('NFC')
    .replace(/[^A-Z0-9 ]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

async function allClients() {
  const out = [];
  let from = 0;
  const step = 1000;
  for (;;) {
    const { body } = await rest('clientes?select=id,name,current_balance&order=name.asc', {
      headers: { Range: `${from}-${from + step - 1}`, 'Range-Unit': 'items' },
    });
    out.push(...body);
    if (body.length < step) break;
    from += step;
  }
  return out;
}

(async () => {
  const clients = await allClients();
  console.log(`Total clientes: ${clients.length}\n`);

  const corruptos = clients.filter((c) => (c.name || '').includes(REPL));
  console.log(`Clientes con carácter corrupto "�": ${corruptos.length}`);

  // Agrupar TODOS por clave normalizada para detectar duplicados
  const groups = new Map();
  for (const c of clients) {
    const k = key(c.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }

  // Grupos relevantes: tienen >1 miembro Y al menos uno con carácter corrupto
  const dupCorruptos = [];
  for (const [k, arr] of groups) {
    if (arr.length > 1 && arr.some((c) => (c.name || '').includes(REPL))) {
      dupCorruptos.push([k, arr]);
    }
  }

  console.log(`\n=== DUPLICADOS por encoding (corrupto vs regenerado) — ${dupCorruptos.length} grupos ===\n`);
  for (const [k, arr] of dupCorruptos) {
    console.log(`▸ clave "${k}"`);
    for (const c of arr) {
      const tx = await count('transacciones', `client_id=eq.${encodeURIComponent(c.id)}`);
      const ve = await count('ventas', `client_id=eq.${encodeURIComponent(c.id)}`);
      const flag = (c.name || '').includes(REPL) ? ' ⚠ CORRUPTO' : '';
      console.log(`   · "${c.name}" id=${c.id}${flag}`);
      console.log(`       balance=${money(c.current_balance)}  transacciones=${tx}  ventas=${ve}`);
    }
    console.log('');
  }

  // Corruptos SIN par limpio (quedaron solos)
  const corruptosSolos = corruptos.filter((c) => groups.get(key(c.name)).length === 1);
  console.log(`=== CORRUPTOS sin duplicado (solo hay que renombrar la "ñ") — ${corruptosSolos.length} ===\n`);
  for (const c of corruptosSolos) {
    const tx = await count('transacciones', `client_id=eq.${encodeURIComponent(c.id)}`);
    const ve = await count('ventas', `client_id=eq.${encodeURIComponent(c.id)}`);
    console.log(`   · "${c.name}" id=${c.id}  balance=${money(c.current_balance)}  transacciones=${tx}  ventas=${ve}`);
  }
  console.log('');
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
