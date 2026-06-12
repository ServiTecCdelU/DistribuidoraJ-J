// Verifica/actualiza stock de los productos de la factura LEON NRO 3633.
// Busca cada item por codigo (variantes) y, si no aparece, por palabras clave del nombre.
// Uso:
//   node scripts/verificar-stock-leon.js          -> SOLO LECTURA (reporte)
//   node scripts/verificar-stock-leon.js --apply  -> setea stock = cantidad comprada

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

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// codigo, cantidad comprada, descripcion factura
const ITEMS = [
  { codigo: '0103585', cant: 30, desc: 'HARINA DE MAIZ X 490G PRESTOPRONTA' },
  { codigo: '0104908', cant: 15, desc: 'ACEITE X 900CC LEIRA GIRASOL' },
  { codigo: '0102075', cant: 20, desc: 'YERBA X 500G MAÑANITA' },
  { codigo: '0105566', cant: 10, desc: 'YERBA X 500G PLAYADITO' },
  { codigo: '0101679', cant: 12, desc: 'YERBA X 500G NUÑEZ' },
  { codigo: '0213941', cant: 5, desc: 'PAN SALVADO X550G NEVARES' },
  { codigo: '0214910', cant: 10, desc: 'HARINA LEUDANTE X 1KG REINHARINA' },
  { codigo: '0101920', cant: 10, desc: 'HARINA PIZZA X 1KG PUREZA' },
  { codigo: '0102045', cant: 10, desc: 'HARINA 000 X 1KG CAÑUELAS' },
  { codigo: '0103107', cant: 24, desc: 'POROTOS INALPA X 300G' },
  { codigo: '0102171', cant: 12, desc: 'TERMA SERRANO 1.35L' },
  { codigo: '0200995', cant: 24, desc: 'PATE DE FOIE SWIFT X 90 G' },
  { codigo: '0102724', cant: 20, desc: 'SAL FINA X 500G TRESAL' },
  { codigo: '0101906', cant: 1, desc: 'ALIMENTO X 8KG NUTRIBON GATOS' },
  { codigo: '0104559', cant: 1, desc: 'ALIMENTO X 8KG NUTRIBON PERRO ADULTO' },
  { codigo: '0101908', cant: 1, desc: 'ALIMENTO X 15KG NUTRIBON PERRO ADULTO' },
  { codigo: '0102721', cant: 20, desc: 'SAL GRUESA X 1KG TRESAL' },
  { codigo: '0214289', cant: 12, desc: 'SODA SIFON X 2L IVESS' },
  { codigo: '0007900', cant: 6, desc: 'AGUA X 2LT SIERRA PADRES MINERAL' },
  { codigo: '0210268', cant: 6, desc: 'GASEOSA X 2.25L CUNNINGTON POMELO SUAVE' },
  { codigo: '0212905', cant: 40, desc: 'AZUCAR X 1KG MELGAR' },
  { codigo: '0104132', cant: 1, desc: 'MAYONESA 20 X 125G NATURA' },
  { codigo: '0102954', cant: 12, desc: 'GRASA X 1KG BOVINA INSUGA' },
  { codigo: '0105834', cant: 10, desc: 'AZUCAR X 1KG AZUCOR' },
  { codigo: '0012525', cant: 1, desc: 'SAL X 25KG TRESAL ENTREFINA' },
  { codigo: '0105347', cant: 18, desc: 'PAPAS FRITAS X90G QUENTO CHEDDAR' },
  { codigo: '0104849', cant: 18, desc: 'PAPAS FRITAS X90G QUENTO SALAME' },
  { codigo: '0105245', cant: 18, desc: 'PAPAS FRITAS X90G QUENTO QUESO/CIBOULET' },
  { codigo: '0113426', cant: 15, desc: 'FIDEO X 500G SOL PAMPEANO TIRABUZON' },
  { codigo: '0113430', cant: 15, desc: 'FIDEO X 500G SOL PAMPEANO MOÑO' },
  { codigo: '0103584', cant: 22, desc: 'GALLETITA BAGLEY CRIOLLITAS 3U X300G' },
  { codigo: '0102307', cant: 14, desc: 'GALLETITA PASEO X300GR CRACKER' },
  { codigo: '0012056', cant: 20, desc: 'ARROZ X 500G 00000 EL JAPONES' },
  { codigo: '0106694', cant: 10, desc: 'ARROZ X 500G 00000 DOS HERMANOS' },
  { codigo: '0211673', cant: 10, desc: 'ARROZ X 1KG 00000 EL JAPONES' },
  { codigo: '0102256', cant: 1, desc: 'ALFAJOR GUAYMALLEN SIMPLE X40U BLANCO' },
  { codigo: '0100625', cant: 2, desc: 'ALFAJOR GUAYMALLEN SIMPLE X40U NEGRO' },
  { codigo: '0106693', cant: 20, desc: 'ARROZ X 1KG 00000 DOS HERMANOS' },
  { codigo: '0103565', cant: 13, desc: 'CINTITAS TOSTEX X125G PIZZA' },
  { codigo: '0112926', cant: 1, desc: 'ALFAJOR MARADONA 24U X60G NEGRO' },
  { codigo: '0201508', cant: 12, desc: 'DESINFEC LYSOFORM X360 AER ORIGINAL' },
  { codigo: '0012389', cant: 72, desc: 'JABON TOC REXONA X120G FUT FANAT' },
  { codigo: '0103146', cant: 12, desc: 'TINTURA NANTYR Nº 3.0 CASTAÑO OSCURO' },
  { codigo: '0211910', cant: 6, desc: 'VINO PROFUGO X750CC MALBEC' },
  { codigo: '0113736', cant: 1, desc: 'ALIMENTO X 15KG TUTE GATO ADULTO' },
  { codigo: '0113431', cant: 20, desc: 'FIDEO X 500G SOL PAMPEANO TALLARIN' },
  { codigo: '0102049', cant: 48, desc: 'HIGIENICO 4X30MT FELPITA' },
  { codigo: '0113428', cant: 15, desc: 'FIDEO X 500G SOL PAMPEANO CELLENTANO' },
  { codigo: '0108599', cant: 8, desc: 'ROLLO COCINA 3X40P CAUTIVA' },
];

function codigoVariants(codigo) {
  const v = new Set([codigo]);
  v.add(codigo.replace(/^0+/, ''));
  v.add('0' + codigo);
  return [...v];
}

async function findByCodigo(codigo) {
  for (const cand of codigoVariants(codigo)) {
    const url = `${SUPABASE_URL}/rest/v1/productos?select=id,codigo,name,stock&codigo=eq.${encodeURIComponent(cand)}`;
    const res = await fetch(url, { headers });
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0) return rows;
  }
  return [];
}

// Palabras clave significativas para fallback por nombre (saca medidas y stopwords)
function keywords(desc) {
  const stop = new Set(['X', 'DE', 'EL', 'LA', 'AER', 'SIMPLE', 'ORIGINAL']);
  return desc
    .toUpperCase()
    .replace(/[.,/]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^\d/.test(w) && !/^X\d/.test(w) && !stop.has(w))
    .slice(0, 3);
}

const norm = (s) => (s || '').toUpperCase().replace(/\s+/g, ' ').replace(/[.]/g, '').trim();

async function findByName(desc) {
  const kws = keywords(desc);
  if (kws.length === 0) return [];
  const url = `${SUPABASE_URL}/rest/v1/productos?select=id,codigo,name,stock&and=(${kws
    .map((k) => `name.ilike.*${encodeURIComponent(k)}*`)
    .join(',')})&limit=5`;
  const res = await fetch(url, { headers });
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  // Si hay match exacto de nombre normalizado, devolver solo ese
  const exact = rows.find((r) => norm(r.name) === norm(desc));
  return exact ? [exact] : rows;
}

async function patchStock(id, stock) {
  const url = `${SUPABASE_URL}/rest/v1/productos?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ stock }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  // sync stock_local mayorista si existe
  await fetch(`${SUPABASE_URL}/rest/v1/mayorista_productos?producto_id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ stock_local: stock }),
  });
  return res.json();
}

(async () => {
  console.log(APPLY ? '== APLICANDO (stock = actual + cantidad factura) ==' : '== SOLO LECTURA ==');
  console.log('Factura LEON 2007-00093633  |  49 items\n');

  const ambiguos = [];
  const noEncontrados = [];
  const yaIguales = []; // stock actual == cantidad comprada (posible doble carga)
  let actualizados = 0;

  for (const it of ITEMS) {
    let rows = await findByCodigo(it.codigo);
    if (rows.length === 0) rows = await findByName(it.desc);

    if (rows.length === 0) {
      noEncontrados.push(it);
      console.log(`✗ ${it.codigo}  ${it.desc}  -> NO ENCONTRADO  (comprado ${it.cant})`);
      continue;
    }
    if (rows.length > 1) {
      ambiguos.push({ it, rows });
      console.log(`? ${it.codigo}  ${it.desc}  -> AMBIGUO (${rows.length} matches), NO se toca:`);
      rows.forEach((r) => console.log(`     [${r.id}] stock=${r.stock} :: ${r.name}`));
      continue;
    }

    const p = rows[0];
    const nuevo = (p.stock || 0) + it.cant;
    const flag = p.stock === it.cant ? ' (ya == comprado: posible doble carga)' : '';
    if (p.stock === it.cant) yaIguales.push(it);
    console.log(
      `+ ${it.codigo}  ${p.stock} + ${it.cant} = ${nuevo}  ::  ${(p.name || '').slice(0, 40)}${flag}`
    );

    if (APPLY) {
      try {
        await patchStock(p.id, nuevo);
        actualizados++;
      } catch (e) {
        console.log(`     ERROR: ${e.message}`);
      }
    }
  }

  console.log('\n----------------------------------------');
  console.log(`Items factura: ${ITEMS.length}`);
  if (APPLY) console.log(`Stock sumado OK: ${actualizados}`);
  console.log(`Ambiguos (no tocados): ${ambiguos.length}`);
  console.log(`No encontrados: ${noEncontrados.length}`);
  if (yaIguales.length) {
    console.log(`\nOJO - ${yaIguales.length} ya tenían stock == comprado (si ya los cargaste, quedaron duplicados):`);
    console.log('  ' + yaIguales.map((x) => `${x.codigo} ${x.desc} (x${x.cant})`).join('\n  '));
  }
  if (!APPLY) console.log('\nDry-run. Aplicar: node scripts/verificar-stock-leon.js --apply');
})();
