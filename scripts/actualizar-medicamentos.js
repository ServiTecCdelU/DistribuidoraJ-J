// Actualiza precio base + 40% ganancia + stock=5 para una lista de medicamentos.
// Identifica por `codigo`. Precio dado = base (costo); precio final = base * 1.40.
// Uso:
//   node scripts/actualizar-medicamentos.js          -> SOLO LECTURA (muestra qué haría)
//   node scripts/actualizar-medicamentos.js --apply  -> aplica los cambios

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

const APPLY = process.argv.includes('--apply');
const GANANCIA = 40;
const STOCK = 5;

// codigo -> precio base (costo)
const LISTA = [
  { codigo: '0109884', base: 790 },
  { codigo: '109885', base: 10270.4 },
  { codigo: '0213861', base: 1747.2 },
  { codigo: '0213862', base: 663.85 },
];

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const calcFinal = (base) => Math.round(base * (1 + GANANCIA / 100) * 100) / 100;

// Variantes de codigo a probar (con y sin ceros a la izquierda)
function codigoVariants(codigo) {
  const v = new Set([codigo]);
  v.add(codigo.replace(/^0+/, ''));
  v.add('0' + codigo);
  return [...v];
}

async function findProducto(codigo) {
  for (const cand of codigoVariants(codigo)) {
    const url = `${SUPABASE_URL}/rest/v1/productos?select=id,codigo,name,price,precio_base,ganancia_global,ganancia_individual,stock&codigo=eq.${encodeURIComponent(cand)}`;
    const res = await fetch(url, { headers });
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0) return rows;
  }
  return [];
}

async function patch(table, filter, body) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function updateProducto(id, base) {
  const final = calcFinal(base);
  // 1) productos: precio final, base, ganancia individual y stock
  await patch('productos', `id=eq.${encodeURIComponent(id)}`, {
    price: final,
    precio_venta: final,
    precio_base: base,
    ganancia_global: GANANCIA,
    ganancia_individual: 1,
    stock: STOCK,
  });
  // 2) mayorista_productos: costo real (precio_lista) y stock_local en sync
  await patch('mayorista_productos', `producto_id=eq.${encodeURIComponent(id)}`, {
    precio_lista: base,
    stock_local: STOCK,
  });
}

(async () => {
  console.log(APPLY ? '== APLICANDO CAMBIOS ==' : '== SOLO LECTURA (dry-run) ==');
  console.log('Ganancia: 40%  |  Stock: 5  |  Precio dado = base\n');

  let ok = 0;
  const noEncontrados = [];
  const multiples = [];

  for (const item of LISTA) {
    const rows = await findProducto(item.codigo);
    if (rows.length === 0) {
      noEncontrados.push(item.codigo);
      console.log(`✗ ${item.codigo} -> NO ENCONTRADO`);
      continue;
    }
    if (rows.length > 1) {
      multiples.push({ codigo: item.codigo, ids: rows.map((r) => r.id) });
    }
    const p = rows[0];
    const final = calcFinal(item.base);
    console.log(
      `${rows.length > 1 ? '⚠' : '·'} ${item.codigo} [${p.id}] ${(p.name || '').slice(0, 35)}` +
        `\n    base ${item.base} +40% = ${final}  |  stock ${p.stock} -> ${STOCK}  (precio actual ${p.price})`
    );

    if (APPLY) {
      try {
        await updateProducto(p.id, item.base);
        ok++;
      } catch (e) {
        console.log(`    ERROR al actualizar: ${e.message}`);
      }
    }
  }

  console.log('\n----------------------------------------');
  console.log(`Total en lista: ${LISTA.length}`);
  if (noEncontrados.length) console.log(`No encontrados: ${noEncontrados.join(', ')}`);
  if (multiples.length) {
    console.log('Códigos con MÁS de un producto (revisar):');
    multiples.forEach((m) => console.log(`  ${m.codigo}: ${m.ids.join(', ')}`));
  }
  if (APPLY) console.log(`Actualizados OK: ${ok}`);
  else console.log('Dry-run. Para aplicar: node scripts/actualizar-medicamentos.js --apply');
})();
