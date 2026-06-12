// Diagnóstico READ-ONLY del sistema de stock contra datos reales.
// Uso: node scripts/diagnostico-stock.js
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const env = {};
fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
  const m = line.match(/^([^#=]+)=["']?([^"'\r]*)["']?/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// Trae todas las filas de una tabla paginando de a 1000.
async function fetchAll(table, select, extra = '') {
  const out = [];
  let offset = 0;
  const PAGE = 1000;
  for (;;) {
    const url = `${URL}/rest/v1/${table}?select=${select}${extra}&limit=${PAGE}&offset=${offset}`;
    const r = await fetch(url, { headers: H });
    if (!r.ok) { console.error(`Error ${table}: HTTP ${r.status}`, await r.text()); break; }
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

const fmt = (n) => Number(n).toLocaleString('es-AR');

(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('  DIAGNÓSTICO DE STOCK — Distribuidora Patricia');
  console.log('═══════════════════════════════════════════════════\n');

  // ─── 1. productos ───────────────────────────────────────────────
  const productos = await fetchAll('productos', 'id,name,stock,codigo,category');
  const prodById = new Map(productos.map((p) => [p.id, p]));
  let conStock = 0, sinStock = 0, negativo = 0, nulo = 0, sumaUnidades = 0;
  for (const p of productos) {
    const s = p.stock;
    if (s == null) { nulo++; continue; }
    const n = Number(s);
    if (n < 0) negativo++;
    else if (n === 0) sinStock++;
    else { conStock++; sumaUnidades += n; }
  }
  console.log('1) TABLA productos');
  console.log(`   Total productos:        ${fmt(productos.length)}`);
  console.log(`   Con stock (>0):         ${fmt(conStock)}`);
  console.log(`   Sin stock (=0):         ${fmt(sinStock)}`);
  console.log(`   Stock NEGATIVO (<0):    ${fmt(negativo)}  ${negativo > 0 ? '⚠️' : '✓'}`);
  console.log(`   Stock NULL:             ${fmt(nulo)}  ${nulo > 0 ? '⚠️' : '✓'}`);
  console.log(`   Unidades totales:       ${fmt(sumaUnidades)}`);
  if (negativo > 0) {
    console.log('   → Productos con stock negativo:');
    productos.filter((p) => Number(p.stock) < 0).slice(0, 20).forEach((p) => console.log(`     ${p.id} | ${p.name} = ${p.stock}`));
  }

  // ─── 2. mayorista_productos ─────────────────────────────────────
  const mayorista = await fetchAll('mayorista_productos', 'id,producto_id,stock_local,descripcion');
  const mpById = new Map(mayorista.map((m) => [m.id, m]));
  console.log('\n2) TABLA mayorista_productos');
  console.log(`   Total mayorista:        ${fmt(mayorista.length)}`);

  // ─── 3. Divergencia productos.stock vs mayorista.stock_local ────
  // Vinculo: mp_X (mayorista.id) ↔ prod_mp_X (productos.id)
  let comparados = 0, divergentes = 0;
  const difs = [];
  for (const m of mayorista) {
    const prodId = `prod_${m.id}`; // mp_XXX -> prod_mp_XXX
    const p = prodById.get(prodId);
    if (!p) continue;
    if (m.stock_local == null || p.stock == null) continue;
    comparados++;
    const a = Number(p.stock), b = Number(m.stock_local);
    if (a !== b) { divergentes++; difs.push({ id: m.id, desc: m.descripcion, prod: a, mayo: b, dif: a - b }); }
  }
  console.log('\n3) SINCRONIZACIÓN productos.stock ↔ mayorista_productos.stock_local');
  console.log(`   Pares comparados:       ${fmt(comparados)}`);
  console.log(`   Divergentes:            ${fmt(divergentes)}  ${divergentes > 0 ? '⚠️' : '✓'}`);
  if (divergentes > 0) {
    console.log('   → Top 15 divergencias (prod vs mayorista):');
    difs.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 15)
      .forEach((d) => console.log(`     ${d.id} | ${String(d.desc).slice(0, 40).padEnd(40)} | prod=${d.prod} mayo=${d.mayo} (dif ${d.dif > 0 ? '+' : ''}${d.dif})`));
  }

  // ─── 4. stock_movimientos ───────────────────────────────────────
  const movs = await fetchAll('stock_movimientos', 'id,mayorista_producto_id,tipo,cantidad,stock_anterior,stock_posterior,motivo,created_at');
  const porTipo = {};
  for (const mv of movs) porTipo[mv.tipo] = (porTipo[mv.tipo] || 0) + 1;
  console.log('\n4) TABLA stock_movimientos');
  console.log(`   Total movimientos:      ${fmt(movs.length)}`);
  console.log(`   Por tipo:               ${JSON.stringify(porTipo)}`);

  // Huérfanos: mayorista_producto_id que no existe en mayorista_productos
  const huerfanos = movs.filter((mv) => mv.mayorista_producto_id && !mpById.has(mv.mayorista_producto_id));
  const huerfIds = [...new Set(huerfanos.map((h) => h.mayorista_producto_id))];
  console.log(`   Movimientos huérfanos:  ${fmt(huerfanos.length)} (${huerfIds.length} ids) ${huerfanos.length > 0 ? '⚠️' : '✓'}`);
  if (huerfIds.length > 0) console.log(`     ids: ${huerfIds.slice(0, 15).join(', ')}${huerfIds.length > 15 ? '…' : ''}`);

  // ─── 5. Integridad de la cadena de movimientos ──────────────────
  // Agrupar por producto, ordenar por fecha, verificar: stock_anterior[i] == stock_posterior[i-1]
  // y que el último stock_posterior == productos.stock actual.
  const porProd = {};
  for (const mv of movs) {
    const k = mv.mayorista_producto_id;
    if (!k) continue;
    (porProd[k] = porProd[k] || []).push(mv);
  }
  let cadenaRota = 0, finalDesalineado = 0;
  const rotos = [];
  const desalineados = [];
  for (const [mpId, lista] of Object.entries(porProd)) {
    lista.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 1; i < lista.length; i++) {
      const prev = lista[i - 1], cur = lista[i];
      if (prev.stock_posterior != null && cur.stock_anterior != null && Number(cur.stock_anterior) !== Number(prev.stock_posterior)) {
        cadenaRota++;
        if (rotos.length < 15) rotos.push(`${mpId}: mov previo dejó ${prev.stock_posterior}, siguiente arranca de ${cur.stock_anterior}`);
        break;
      }
    }
    const ultimo = lista[lista.length - 1];
    const p = prodById.get(`prod_${mpId}`) || prodById.get(mpId);
    if (p && p.stock != null && ultimo.stock_posterior != null && Number(p.stock) !== Number(ultimo.stock_posterior)) {
      finalDesalineado++;
      if (desalineados.length < 15) desalineados.push(`${mpId}: último mov dejó ${ultimo.stock_posterior}, productos.stock=${p.stock}`);
    }
  }
  console.log('\n5) INTEGRIDAD DE CADENA stock_movimientos');
  console.log(`   Productos con movs:     ${fmt(Object.keys(porProd).length)}`);
  console.log(`   Cadena rota (anterior≠posterior previo): ${fmt(cadenaRota)} ${cadenaRota > 0 ? '⚠️' : '✓'}`);
  rotos.forEach((r) => console.log(`     ${r}`));
  console.log(`   Final desalineado (último mov ≠ stock actual): ${fmt(finalDesalineado)} ${finalDesalineado > 0 ? '⚠️' : '✓'}`);
  desalineados.forEach((d) => console.log(`     ${d}`));

  // ─── 6. Ventas vs movimientos (stock realmente descontado) ──────
  const ventas = await fetchAll('ventas', 'id,sale_number,items,source,created_at,status');
  const motivosVenta = new Set(movs.filter((m) => m.tipo === 'venta' && m.motivo).map((m) => m.motivo));
  let ventasConItems = 0, ventasSinMov = 0, itemsSinProducto = 0, itemsTotales = 0;
  const ventasSinMovList = [];
  for (const v of ventas) {
    const items = Array.isArray(v.items) ? v.items : [];
    if (items.length === 0) continue;
    ventasConItems++;
    itemsTotales += items.length;
    // ¿Tiene al menos un movimiento de stock con motivo=venta.id?
    if (!motivosVenta.has(v.id)) {
      ventasSinMov++;
      if (ventasSinMovList.length < 20) ventasSinMovList.push(`${v.sale_number || v.id} (${v.source || '?'}, ${String(v.created_at).slice(0, 10)})`);
    }
    // Ítems cuyo producto no existe en productos (no se pudo descontar)
    for (const it of items) {
      const pid = it.productId;
      if (!pid) continue;
      const prodId = String(pid).startsWith('mp_') ? `prod_${pid}` : pid;
      if (!prodById.has(prodId) && !prodById.has(pid)) itemsSinProducto++;
    }
  }
  console.log('\n6) VENTAS vs DESCUENTO DE STOCK');
  console.log(`   Ventas totales:         ${fmt(ventas.length)}`);
  console.log(`   Ventas con ítems:       ${fmt(ventasConItems)}`);
  console.log(`   Ítems vendidos:         ${fmt(itemsTotales)}`);
  console.log(`   Ventas SIN ningún movimiento de stock: ${fmt(ventasSinMov)} ${ventasSinMov > 0 ? '⚠️' : '✓'}`);
  ventasSinMovList.forEach((s) => console.log(`     ${s}`));
  console.log(`   Ítems cuyo producto no existe en productos: ${fmt(itemsSinProducto)} ${itemsSinProducto > 0 ? '⚠️' : '✓'}`);

  // ─── 7. Roturas: movimientos vs transacciones ───────────────────
  const trans = await fetchAll('transacciones', 'id,description,amount,sale_id');
  const roturasMov = movs.filter((m) => m.tipo === 'rotura');
  const roturasTrans = trans.filter((t) => String(t.description || '').startsWith('[ROTURA]'));
  console.log('\n7) ROTURAS');
  console.log(`   Movimientos rotura:     ${fmt(roturasMov.length)}`);
  console.log(`   Transacciones [ROTURA]: ${fmt(roturasTrans.length)}`);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  FIN DEL DIAGNÓSTICO');
  console.log('═══════════════════════════════════════════════════');
})();
