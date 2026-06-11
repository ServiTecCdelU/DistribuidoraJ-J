// Descuenta el stock de los pedidos en reparto que YA tienen remito pero cuyo stock
// todavía no se descontó (remitos generados antes del cambio "descontar al generar remito").
// Marca cada pedido con stock_descontado=true para que el cobro no vuelva a descontar.
//
// Uso:
//   node scripts/fix-descontar-stock-remitos-reparto.js          (dry-run: solo lista)
//   node scripts/fix-descontar-stock-remitos-reparto.js --apply  (aplica)
//
// Requiere antes en Supabase:
//   ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS stock_descontado boolean NOT NULL DEFAULT false;

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

function normIds(productId) {
  const prodId = productId.startsWith('prod_') ? productId : `prod_${productId}`;
  const mpId = productId.startsWith('prod_') ? productId.slice('prod_'.length) : productId;
  return { prodId, mpId };
}

async function getStockActual(prodId, mpId) {
  // Fuente de verdad = productos.stock; cae a mayorista_productos.stock_local si no existe.
  const rp = await fetch(`${URL}/rest/v1/productos?id=eq.${encodeURIComponent(prodId)}&select=stock`, { headers: HGET });
  const dp = await rp.json();
  if (dp && dp.length && dp[0].stock != null) return { stock: Number(dp[0].stock), enProductos: true };
  const rm = await fetch(`${URL}/rest/v1/mayorista_productos?id=eq.${encodeURIComponent(mpId)}&select=stock_local`, { headers: HGET });
  const dm = await rm.json();
  if (dm && dm.length && dm[0].stock_local != null) return { stock: Number(dm[0].stock_local), enProductos: false };
  return null;
}

async function descontar(productId, cantidad, motivo) {
  const { prodId, mpId } = normIds(productId);
  const cur = await getStockActual(prodId, mpId);
  if (!cur) {
    console.log(`    ! sin stock registrado para ${productId} — se omite`);
    return;
  }
  const stockAnterior = cur.stock;
  const stockPosterior = Math.max(0, stockAnterior - cantidad);

  if (!APPLY) {
    console.log(`    [dry] ${productId}: ${stockAnterior} -> ${stockPosterior} (-${cantidad})`);
    return;
  }

  // 1. Insertar movimiento
  await fetch(`${URL}/rest/v1/stock_movimientos`, {
    method: 'POST', headers: HJSON,
    body: JSON.stringify({
      mayorista_producto_id: mpId, tipo: 'venta', cantidad: -cantidad,
      stock_anterior: stockAnterior, stock_posterior: stockPosterior, motivo,
    }),
  });
  // 2. Sincronizar ambas tablas
  await fetch(`${URL}/rest/v1/mayorista_productos?id=eq.${encodeURIComponent(mpId)}`, {
    method: 'PATCH', headers: HJSON, body: JSON.stringify({ stock_local: stockPosterior }),
  });
  await fetch(`${URL}/rest/v1/productos?id=eq.${encodeURIComponent(prodId)}`, {
    method: 'PATCH', headers: HJSON, body: JSON.stringify({ stock: stockPosterior }),
  });
  console.log(`    ${productId}: ${stockAnterior} -> ${stockPosterior} (-${cantidad})`);
}

async function main() {
  const r = await fetch(
    `${URL}/rest/v1/pedidos?status=eq.delivery&remito_number=not.is.null&stock_descontado=is.false&select=id,client_name,remito_number,items&order=client_name.asc`,
    { headers: HGET }
  );
  const pedidos = await r.json();
  if (!Array.isArray(pedidos)) { console.error('Respuesta inesperada:', pedidos); return; }

  console.log(`${APPLY ? '== APLICANDO ==' : '== DRY-RUN (sin --apply) =='}`);
  console.log(`Pedidos en reparto con remito y stock SIN descontar: ${pedidos.length}\n`);

  for (const p of pedidos) {
    const items = Array.isArray(p.items) ? p.items : [];
    console.log(`# ${p.client_name} | ${p.id} | Remito ${p.remito_number} | ${items.length} items`);
    for (const it of items) {
      if (!it.productId) continue;
      const cant = (Number(it.quantity) || 0) + (Number(it.regalo) || 0);
      if (cant <= 0) continue;
      await descontar(it.productId, cant, `Remito ${p.remito_number}`);
    }
    if (APPLY) {
      await fetch(`${URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(p.id)}`, {
        method: 'PATCH', headers: HJSON, body: JSON.stringify({ stock_descontado: true }),
      });
      console.log(`    -> stock_descontado = true`);
    }
    console.log('');
  }

  console.log(APPLY ? 'Listo. Stock descontado y pedidos marcados.' : 'Dry-run. Revisá y volvé a correr con --apply.');
}
main().catch((e) => console.error(e));
