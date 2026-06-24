// Solo lectura. Verificacion detallada venta vs remito (parser posicional + incidencias).
// Uso: node scripts/verificar-venta.mjs N106-09-06-2026 [otra...]
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
const codeOf = (pid) => (pid || '').replace(/^prod_/, '').replace(/^mp_/, '').replace(/^0+/, '');
const get = async (p) => (await fetch(`${U}/rest/v1/${p}`, { headers: H })).json();
function ord(items) { const rows = []; for (const it of items) { if (!it.str.trim()) continue; const x = it.transform[4], y = it.transform[5]; let r = rows.find((r) => Math.abs(r.y - y) < 3); if (!r) { r = { y, cells: [] }; rows.push(r); } r.cells.push({ x, s: it.str }); } rows.sort((a, b) => b.y - a.y); return rows.map((r) => r.cells.sort((a, b) => a.x - b.x).map((c) => c.s).join(' ')); }
async function remito(b64) { const data = new Uint8Array(Buffer.from(b64, 'base64')); const doc = await pdfjs.getDocument({ data, disableFontFace: true, isEvalSupported: false }).promise; const L = []; let tot = null; for (let i = 1; i <= doc.numPages; i++) L.push(...ord((await (await doc.getPage(i)).getTextContent()).items)); await doc.destroy(); const map = new Map(); for (const ln of L) { const m = ln.match(/^\s*(\d{6,8})\s+(\d+)\s+(.*?)\$\s*([\d.]+,\d{2})\s+(?:(\d+)\s*%|-)/); if (m) { const c = m[1].replace(/^0+/, ''); if (!map.has(c)) map.set(c, { cant: Number(m[2]), pUnit: num(m[4]) }); } const t = ln.match(/Total:\s*\$?\s*([\d.]+,\d{2})/i); if (t) tot = num(t[1]); } return { map, tot }; }

for (const sn of process.argv.slice(2)) {
  const [v] = await get(`ventas?sale_number=eq.${sn}&select=id,total,items,payment_type`);
  const [p] = await get(`pedidos?sale_id=eq.${v.id}&select=remito_number,remito_pdf_base64`);
  const inc = (await get(`transacciones?sale_id=eq.${v.id}&select=description`)).filter((t) => /\[(FALTANTE|ROTURA|NO_QUIERE)\]/.test(t.description || '')).map((t) => t.description);
  const { map, tot } = await remito(p.remito_pdf_base64);
  console.log(`\n### ${sn}  remito ${p.remito_number}  pay=${v.payment_type}`);
  console.log(`   total venta=$${Number(v.total).toFixed(2)}   total remito=$${tot != null ? tot.toFixed(2) : '?'}   dif=$${tot != null ? (Number(v.total) - tot).toFixed(2) : '?'}`);
  inc.forEach((d) => console.log(`   INCIDENCIA: ${d}`));
  let problemas = 0;
  const vistos = new Set();
  for (const it of v.items) {
    const c = codeOf(it.productId); vistos.add(c);
    const r = map.get(c); const pv = Number(it.price);
    if (!r) { console.log(`   [EXTRA en venta]   ${it.name.slice(0,34)} x${it.quantity} $${pv.toFixed(2)}`); problemas++; continue; }
    const dp = Math.abs(pv - r.pUnit) > 0.01, dc = r.cant !== it.quantity;
    if (dp) { console.log(`   [PRECIO]  ${it.name.slice(0,30)}  venta $${pv.toFixed(2)} / remito $${r.pUnit.toFixed(2)}`); problemas++; }
    if (dc) { console.log(`   [CANT]    ${it.name.slice(0,30)}  venta ${it.quantity} / remito ${r.cant}`); problemas++; }
  }
  for (const [c, r] of map) if (!vistos.has(c)) { console.log(`   [no cobrado] cod ${c} x${r.cant} $${r.pUnit.toFixed(2)}`); problemas++; }
  console.log(problemas === 0 ? '   ✓ OK: venta coincide con el remito' : `   ⚠ ${problemas} diferencia(s)`);
}
