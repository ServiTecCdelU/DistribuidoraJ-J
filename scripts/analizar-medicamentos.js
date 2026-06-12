// Diagnóstico (SOLO LECTURA) de productos con rubro "medicamento".
// En medicamentos la ganancia es individual: precio = precio_base * (1 + ganancia_global/100)
// y ganancia_individual debe ser 1 (para que "aplicar % a todos" no los pise).
// Detecta: sin precio_base, sin ganancia, ganancia no marcada como individual,
// y precio desincronizado (price != base*(1+gan/100)).
// Uso: node scripts/analizar-medicamentos.js

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

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

const round2 = (n) => Math.round(n * 100) / 100;
const calcFinal = (base, gan) => round2(base * (1 + gan / 100));

async function getAll(table, select, extra = '') {
  let from = 0;
  const pageSize = 1000;
  const out = [];
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${extra}`;
    const res = await fetch(url, {
      headers: { ...headers, Range: `${from}-${from + pageSize - 1}`, 'Range-Unit': 'items' },
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
  const meds = await getAll(
    'productos',
    'id,codigo,name,price,precio_venta,precio_base,ganancia_global,ganancia_individual,stock,category,disabled',
    '&category=ilike.*medicamento*'
  );

  console.log('=== ANÁLISIS DE MEDICAMENTOS (solo lectura) ===\n');
  console.log(`Total con rubro medicamento: ${meds.length}\n`);

  const sinBase = [];
  const sinGanancia = [];
  const noIndividual = [];
  const precioDesync = [];
  const precioCero = [];
  const okList = [];

  for (const p of meds) {
    const base = p.precio_base != null ? Number(p.precio_base) : null;
    const gan = p.ganancia_global != null ? Number(p.ganancia_global) : null;
    const price = Number(p.price) || 0;
    const ind = p.ganancia_individual;

    if (price <= 0) precioCero.push(p);

    if (base == null || base <= 0) {
      sinBase.push(p);
      continue; // sin base no se puede validar el resto
    }
    if (gan == null || gan <= 0) sinGanancia.push(p);
    if (ind !== 1) noIndividual.push(p);

    const esperado = calcFinal(base, gan || 0);
    if (Math.abs(esperado - price) > 0.5) {
      precioDesync.push({ ...p, esperado });
    } else if ((gan || 0) > 0 && ind === 1) {
      okList.push(p);
    }
  }

  const fmt = (p) =>
    `  [${p.codigo || '-'}] ${(p.name || '').slice(0, 40).padEnd(40)} ` +
    `base=${p.precio_base ?? '-'} gan=${p.ganancia_global ?? '-'} ind=${p.ganancia_individual ?? '-'} price=${p.price} stock=${p.stock}`;

  console.log(`>> SIN precio_base (${sinBase.length}) — no se puede recalcular precio:`);
  sinBase.forEach((p) => console.log(fmt(p)));

  console.log(`\n>> precio EN $0 (${precioCero.length}) — sin precio de venta:`);
  precioCero.forEach((p) => console.log(fmt(p)));

  console.log(`\n>> SIN ganancia (gan 0/null) (${sinGanancia.length}) — vendiendo a costo:`);
  sinGanancia.forEach((p) => console.log(fmt(p)));

  console.log(`\n>> NO marcados individual (ind != 1) (${noIndividual.length}) — "aplicar % a todos" los pisaría:`);
  noIndividual.forEach((p) => console.log(fmt(p)));

  console.log(`\n>> precio DESINCRONIZADO (${precioDesync.length}) — price != base*(1+gan/100):`);
  precioDesync.forEach((p) =>
    console.log(`${fmt(p)}  -> esperado=${p.esperado}  (dif=${round2(p.esperado - Number(p.price))})`)
  );

  console.log('\n----------------------------------------');
  console.log(`OK (base+ganancia+individual y precio coincide): ${okList.length}`);
  console.log(`Sin base: ${sinBase.length}  |  Precio $0: ${precioCero.length}  |  Sin ganancia: ${sinGanancia.length}`);
  console.log(`No individual: ${noIndividual.length}  |  Desincronizados: ${precioDesync.length}`);
})();
