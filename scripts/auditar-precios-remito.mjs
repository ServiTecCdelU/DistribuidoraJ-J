// Solo lectura. Para cada venta originada en pedido, compara el precio unitario
// de cada producto entre el PDF del remito (firmado) y ventas.items.
// Clasifica:
//   BUG_PRECIO  -> mismo codigo y misma cantidad, pero precio unitario distinto
//   PARCIAL     -> el set de productos/cantidades difiere (entrega parcial: no es bug)
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
const codeOf = (productId) => (productId || '').replace(/^prod_/, '').replace(/^mp_/, ''); // mp_0101573 -> 0101573

async function textoPdf(base64) {
  const data = new Uint8Array(Buffer.from(base64, 'base64'));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true, isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const txt = tc.items.map((i) => i.str).join(' ');
  await doc.destroy();
  return txt;
}

// Del texto del remito saca por codigo: { cant, pUnitario } (primer monto X,XX tras la cantidad)
function parseLineas(txt) {
  const map = new Map();
  const re = /\b(\d{6,8})\b\s+(\d+)\s+([\s\S]*?)\$\s*([\d.]+,\d{2})/g;
  let m;
  while ((m = re.exec(txt))) {
    const cod = m[1], cant = Number(m[2]), pUnit = num(m[4]);
    if (!map.has(cod)) map.set(cod, { cant, pUnit });
  }
  return map;
}

async function getAll(p) {
  let out = [], from = 0, step = 100;
  for (;;) {
    const r = await fetch(`${U}/rest/v1/${p}`, { headers: { ...H, Range: `${from}-${from + step - 1}` } });
    const j = await r.json();
    out = out.concat(j);
    if (j.length < step) break;
    from += step;
  }
  return out;
}

const ventas = await getAll('ventas?select=id,sale_number,total,seller_name&order=created_at.asc');
const vById = new Map(ventas.map((v) => [v.id, v]));
const ventaItems = new Map();
for (const v of await getAll('ventas?select=id,items&order=created_at.asc')) ventaItems.set(v.id, v.items || []);

const bugs = [];
let from = 0, step = 15, proc = 0;
for (;;) {
  const r = await fetch(`${U}/rest/v1/pedidos?remito_pdf_base64=not.is.null&sale_id=not.is.null&select=id,sale_id,remito_number,client_name,remito_pdf_base64&order=created_at.asc`, { headers: { ...H, Range: `${from}-${from + step - 1}` } });
  const lote = await r.json();
  if (!Array.isArray(lote) || lote.length === 0) break;
  for (const p of lote) {
    const v = vById.get(p.sale_id);
    const items = ventaItems.get(p.sale_id);
    if (!v || !items) continue;
    let txt;
    try { txt = await textoPdf(p.remito_pdf_base64); } catch { continue; }
    const remMap = parseLineas(txt);
    proc++;
    const diffs = [];
    let deltaTotal = 0;
    for (const it of items) {
      const cod = codeOf(it.productId);
      const rem = remMap.get(cod) || remMap.get(cod.replace(/^0+/, '')) ;
      if (!rem) continue;                          // producto no esta en el remito -> parcial, ignorar
      if (rem.cant !== it.quantity) continue;      // cantidad distinta -> ajuste de entrega, ignorar
      const pv = Number(it.price);
      if (Math.abs(pv - rem.pUnit) > 0.01) {
        const dto = (it.itemDiscount || 0) / 100;
        const d = (pv - rem.pUnit) * it.quantity * (1 - dto);
        deltaTotal += d;
        diffs.push({ name: it.name, cod, cant: it.quantity, precioVenta: pv, precioRemito: rem.pUnit, deltaLinea: Math.round(d * 100) / 100 });
      }
    }
    if (diffs.length) {
      bugs.push({ sale_number: v.sale_number, sale_id: p.sale_id, remito: p.remito_number, cliente: p.client_name, seller: v.seller_name, totalVenta: Number(v.total), deltaTotal: Math.round(deltaTotal * 100) / 100, items: diffs });
    }
  }
  if (lote.length < step) break;
  from += step;
  process.stderr.write(`...${proc}\r`);
}

bugs.sort((a, b) => Math.abs(b.deltaTotal) - Math.abs(a.deltaTotal));
console.log(`\nPedidos analizados: ${proc}`);
console.log(`VENTAS CON PRECIO PISADO (mismo producto+cantidad, precio distinto): ${bugs.length}\n`);
for (const b of bugs) {
  console.log(`${b.sale_number.padEnd(18)} ${String(b.remito).padEnd(14)} ${(b.cliente||'').slice(0,20).padEnd(21)} dTotal=${b.deltaTotal.toFixed(2).padStart(10)}  ${b.seller||''}`);
  for (const d of b.items) console.log(`     ${d.name.slice(0,34).padEnd(35)} x${String(d.cant).padEnd(4)} venta $${d.precioVenta.toFixed(2)}  remito $${d.precioRemito.toFixed(2)}  (${d.deltaLinea>0?'+':''}${d.deltaLinea})`);
}
const suma = bugs.reduce((a, b) => a + b.deltaTotal, 0);
console.log(`\nImpacto total (sobre/sub-cobrado): ${suma.toFixed(2)}`);
fs.writeFileSync(path.join(__dirname, '..', 'outputs', 'precio-pisado.json'), JSON.stringify(bugs, null, 2));
console.log('Detalle -> outputs/precio-pisado.json');
