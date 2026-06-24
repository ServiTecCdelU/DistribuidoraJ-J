// Solo lectura. Audita TODAS las ventas que vienen de pedido:
// extrae el total impreso en el PDF del remito (fuente firmada) y lo compara
// con ventas.total. Reporta discrepancias > $1.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const g = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const U = g('NEXT_PUBLIC_SUPABASE_URL'), K = g('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: K, Authorization: `Bearer ${K}` };

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const parseMonto = (s) => Number(s.replace(/\./g, '').replace(',', '.'));

async function totalDelPdf(base64) {
  const data = new Uint8Array(Buffer.from(base64, 'base64'));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true, isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const txt = tc.items.map((i) => i.str).join(' ');
  await doc.destroy();
  // "Total: $ 337.503,46"
  const m = txt.match(/Total:\s*\$?\s*([\d.]+,\d{2})/i);
  return m ? parseMonto(m[1]) : null;
}

async function getAll(pathBase) {
  let out = [], from = 0, step = 50;
  for (;;) {
    const r = await fetch(`${U}/rest/v1/${pathBase}`, { headers: { ...H, Range: `${from}-${from + step - 1}` } });
    const j = await r.json();
    out = out.concat(j);
    if (j.length < step) break;
    from += step;
  }
  return out;
}

// ventas indexadas por id
const ventas = await getAll('ventas?select=id,sale_number,total,seller_id,seller_name,source&order=created_at.asc');
const vById = new Map(ventas.map((v) => [v.id, v]));

// pedidos con remito pdf (paginados, traemos base64)
let from = 0, step = 20, procesados = 0, sinPdf = 0, sinTotal = 0;
const discrepancias = [];
for (;;) {
  const r = await fetch(`${U}/rest/v1/pedidos?remito_pdf_base64=not.is.null&sale_id=not.is.null&select=id,sale_id,remito_number,client_name,remito_pdf_base64&order=created_at.asc`, { headers: { ...H, Range: `${from}-${from + step - 1}` } });
  const lote = await r.json();
  if (!Array.isArray(lote) || lote.length === 0) break;
  for (const p of lote) {
    const v = vById.get(p.sale_id);
    if (!v) continue;
    let totalRemito;
    try { totalRemito = await totalDelPdf(p.remito_pdf_base64); }
    catch (e) { sinTotal++; continue; }
    if (totalRemito == null) { sinTotal++; continue; }
    procesados++;
    const diff = Math.round((Number(v.total) - totalRemito) * 100) / 100;
    if (Math.abs(diff) > 1) {
      discrepancias.push({ sale_number: v.sale_number, sale_id: v.sale_id, remito: p.remito_number, cliente: p.client_name, totalVenta: Number(v.total), totalRemito, diff, seller: v.seller_name, sellerId: v.seller_id });
    }
  }
  if (lote.length < step) break;
  from += step;
  process.stderr.write(`...${procesados} procesados\r`);
}

console.log(`\nPDFs comparados: ${procesados} | sin total legible: ${sinTotal}`);
console.log(`DISCREPANCIAS (>$1): ${discrepancias.length}\n`);
discrepancias.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
for (const d of discrepancias) {
  console.log(`${d.sale_number.padEnd(20)} ${String(d.remito).padEnd(14)} ${(d.cliente||'').slice(0,22).padEnd(23)} venta=${d.totalVenta.toFixed(2).padStart(12)} remito=${d.totalRemito.toFixed(2).padStart(12)} dif=${d.diff.toFixed(2).padStart(10)}  ${d.seller||''}`);
}
fs.writeFileSync(path.join(__dirname, '..', 'outputs', 'discrepancias-remito.json'), JSON.stringify(discrepancias, null, 2));
console.log('\nDetalle guardado en outputs/discrepancias-remito.json');
