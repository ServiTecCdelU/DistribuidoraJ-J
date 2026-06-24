// Solo lectura. Auditoria definitiva venta vs remito (PDF, todas las paginas).
// Regla: la venta debe coincidir con el remito, salvo lo cubierto por incidencias
// registradas ([FALTANTE]/[ROTURA]/[NO_QUIERE]).
// Clasifica cada venta:
//   PRECIO   -> mismo producto, precio unitario distinto (error de aumento pisado)
//   EXTRA    -> la venta cobra un producto/cantidad que NO esta en el remito
//   FALTA    -> el remito tiene producto/cantidad que la venta no cobro Y NO hay incidencia que lo cubra
//   OK       -> coincide, o la diferencia esta cubierta por incidencias
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const g = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const U = g('NEXT_PUBLIC_SUPABASE_URL'), K = g('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: K, Authorization: `Bearer ${K}` };
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const num = (s) => Number(s.replace(/\./g, '').replace(',', '.'));
const r2 = (x) => Math.round(x * 100) / 100;
const codeOf = (pid) => (pid || '').replace(/^prod_/, '').replace(/^mp_/, '').replace(/^0+/, '');

function lineasOrdenadas(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) { row = { y, cells: [] }; rows.push(row); }
    row.cells.push({ x, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => r.cells.sort((a, b) => a.x - b.x).map((c) => c.s).join(' '));
}

async function remitoMap(base64) {
  const data = new Uint8Array(Buffer.from(base64, 'base64'));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true, isEvalSupported: false }).promise;
  const lineas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    lineas.push(...lineasOrdenadas(tc.items));
  }
  await doc.destroy();
  const map = new Map();
  for (const ln of lineas) {
    const m = ln.match(/^\s*(\d{6,8})\s+(\d+)\s+(.*?)\$\s*([\d.]+,\d{2})\s+(?:(\d+)\s*%|-)/);
    if (m) {
      const cod = m[1].replace(/^0+/, '');
      if (!map.has(cod)) map.set(cod, { cant: Number(m[2]), pUnit: num(m[4]), dto: Number(m[5] || 0) });
    }
  }
  return map;
}

async function getAll(p) {
  let out = [], from = 0, step = 100;
  for (;;) {
    const r = await fetch(`${U}/rest/v1/${p}`, { headers: { ...H, Range: `${from}-${from + step - 1}` } });
    const j = await r.json();
    out = out.concat(j); if (j.length < step) break; from += step;
  }
  return out;
}

const ventas = await getAll('ventas?select=id,sale_number,total,items,payment_type,seller_name&order=created_at.asc');
const vById = new Map(ventas.map((v) => [v.id, v]));
// incidencias por venta
const incRows = await getAll('transacciones?select=sale_id,description&or=(description.ilike.*[FALTANTE]*,description.ilike.*[ROTURA]*,description.ilike.*[NO_QUIERE]*)');
const incBySale = new Map();
for (const t of incRows) if (t.sale_id) incBySale.set(t.sale_id, (incBySale.get(t.sale_id) || '') + ' ' + (t.description || ''));

const out = { PRECIO: [], EXTRA: [], FALTA: [] };
let proc = 0, from = 0, step = 15;
for (;;) {
  const r = await fetch(`${U}/rest/v1/pedidos?remito_pdf_base64=not.is.null&sale_id=not.is.null&select=id,sale_id,remito_number,client_name,remito_pdf_base64&order=created_at.asc`, { headers: { ...H, Range: `${from}-${from + step - 1}` } });
  const lote = await r.json();
  if (!Array.isArray(lote) || lote.length === 0) break;
  for (const p of lote) {
    const v = vById.get(p.sale_id); if (!v) continue;
    let rem; try { rem = await remitoMap(p.remito_pdf_base64); } catch { continue; }
    if (rem.size === 0) continue;
    proc++;
    const hayIncidencia = incBySale.has(p.sale_id);
    const errPrecio = [], extra = [], falta = [];
    const vistos = new Set();
    for (const it of v.items) {
      const c = codeOf(it.productId); vistos.add(c);
      const rr = rem.get(c);
      const pv = Number(it.price);
      if (!rr) { extra.push(`${it.name.slice(0,28)} x${it.quantity}`); continue; }
      if (Math.abs(pv - rr.pUnit) > 0.01) errPrecio.push(`${it.name.slice(0,26)} v$${pv.toFixed(2)}/r$${rr.pUnit.toFixed(2)}`);
      if (rr.cant > it.quantity) falta.push(`${it.name.slice(0,24)} cobro ${it.quantity}/rem ${rr.cant}`);
      if (it.quantity > rr.cant) extra.push(`${it.name.slice(0,24)} cobro ${it.quantity}/rem ${rr.cant}`);
    }
    for (const [c, rr] of rem) if (!vistos.has(c)) falta.push(`(no cobrado) cod ${c} x${rr.cant} $${rr.pUnit.toFixed(2)}`);

    const base = { sale_number: v.sale_number, sale_id: p.sale_id, remito: p.remito_number, cliente: p.client_name, seller: v.seller_name, pay: v.payment_type, hayIncidencia };
    if (errPrecio.length) out.PRECIO.push({ ...base, det: errPrecio });
    if (extra.length) out.EXTRA.push({ ...base, det: extra });
    if (falta.length && !hayIncidencia) out.FALTA.push({ ...base, det: falta });
  }
  if (lote.length < step) break; from += step; process.stderr.write(`...${proc}\r`);
}

const pr = (title, arr) => {
  console.log(`\n===== ${title}: ${arr.length} =====`);
  for (const x of arr) {
    console.log(`${x.sale_number.padEnd(17)} ${String(x.remito).padEnd(14)} ${(x.cliente||'').slice(0,20).padEnd(21)} ${x.pay.padEnd(6)} inc=${x.hayIncidencia?'si':'no'}  ${x.seller||''}`);
    for (const d of x.det) console.log(`     - ${d}`);
  }
};
console.log(`\nVentas con remito analizadas: ${proc}`);
pr('PRECIO PISADO (error)', out.PRECIO);
pr('EXTRA: cobrado de mas vs remito (error)', out.EXTRA);
pr('FALTA sin incidencia: cobrado de menos (revisar)', out.FALTA);
fs.writeFileSync(path.join(__dirname, '..', 'outputs', 'auditoria-final.json'), JSON.stringify(out, null, 2));
console.log('\nDetalle -> outputs/auditoria-final.json');
