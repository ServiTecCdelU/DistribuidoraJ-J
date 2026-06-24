// Solo lectura. Compara venta vs remito (PDF) item por item, alineado por codigo,
// mostrando diferencias de PRECIO y CANTIDAD e items faltantes/extra.
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
const codeOf = (pid) => (pid || '').replace(/^prod_/, '').replace(/^mp_/, '');
const get = async (p) => (await fetch(`${U}/rest/v1/${p}`, { headers: H })).json();

async function remitoData(base64) {
  const data = new Uint8Array(Buffer.from(base64, 'base64'));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true, isEvalSupported: false }).promise;
  let txt = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    txt += ' ' + tc.items.map((it) => it.str).join(' ');
  }
  await doc.destroy();
  const map = new Map();
  const re = /\b(\d{6,8})\b\s+(\d+)\s+([\s\S]*?)\$\s*([\d.]+,\d{2})/g;
  let m;
  while ((m = re.exec(txt))) if (!map.has(m[1])) map.set(m[1], { cant: Number(m[2]), pUnit: num(m[4]) });
  const tm = txt.match(/Total:\s*\$?\s*([\d.]+,\d{2})/i);
  return { map, total: tm ? num(tm[1]) : null };
}

const targets = process.argv.slice(2); // sale_numbers
for (const sn of targets) {
  const [v] = await get(`ventas?sale_number=eq.${sn}&select=id,sale_number,total,items,payment_type,order_id`);
  if (!v) { console.log(`\n### ${sn}: venta no encontrada`); continue; }
  const peds = await get(`pedidos?sale_id=eq.${v.id}&select=id,remito_number,remito_pdf_base64`);
  const ped = peds[0];
  const inc = await get(`transacciones?sale_id=eq.${v.id}&select=description`);
  const incidencias = inc.filter((t) => /\[(FALTANTE|ROTURA|NO_QUIERE)\]/.test(t.description || '')).map((t) => t.description);
  console.log(`\n### ${v.sale_number}  total venta=$${Number(v.total).toFixed(2)}  pay=${v.payment_type}  remito=${ped?.remito_number || '(sin remito)'}`);
  if (incidencias.length) incidencias.forEach((d) => console.log(`   INCIDENCIA: ${d}`));
  else console.log('   INCIDENCIA: ninguna');
  if (!ped?.remito_pdf_base64) { console.log('   (sin PDF de remito para comparar)'); continue; }
  const { map: rem, total: totRem } = await remitoData(ped.remito_pdf_base64);
  console.log(`   total remito=$${totRem != null ? totRem.toFixed(2) : '?'}   dif=$${totRem != null ? (Number(v.total) - totRem).toFixed(2) : '?'}`);
  const vistos = new Set();
  for (const it of v.items) {
    const c = codeOf(it.productId); vistos.add(c);
    const r = rem.get(c) || rem.get(c.replace(/^0+/, ''));
    const pv = Number(it.price);
    if (!r) { console.log(`   [SOLO VENTA]  ${it.name.slice(0,32).padEnd(33)} x${it.quantity} $${pv.toFixed(2)}`); continue; }
    const difP = Math.abs(pv - r.pUnit) > 0.01, difC = r.cant !== it.quantity;
    if (difP || difC) {
      const tags = [difP ? `PRECIO v$${pv.toFixed(2)}/r$${r.pUnit.toFixed(2)}` : '', difC ? `CANT v${it.quantity}/r${r.cant}` : ''].filter(Boolean).join('  ');
      console.log(`   [DIF] ${it.name.slice(0,30).padEnd(31)} ${tags}`);
    }
  }
  for (const [c, r] of rem) {
    const cn = c.replace(/^0+/, '');
    if (!vistos.has(c) && !vistos.has(cn) && !vistos.has('0'+c)) console.log(`   [SOLO REMITO] cod ${c}  x${r.cant} $${r.pUnit.toFixed(2)}`);
  }
}
