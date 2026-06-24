// Prueba de extractor posicional: ordena tokens por fila (Y) y columna (X)
// antes de parsear, para respetar el orden de lectura de la tabla.
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
const get = async (p) => (await fetch(`${U}/rest/v1/${p}`, { headers: H })).json();

function lineasOrdenadas(items) {
  // agrupar por Y (fila), tolerancia 3px
  const rows = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) { row = { y, cells: [] }; rows.push(row); }
    row.cells.push({ x, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y); // arriba -> abajo
  return rows.map((r) => r.cells.sort((a, b) => a.x - b.x).map((c) => c.s).join(' '));
}

async function parse(base64) {
  const data = new Uint8Array(Buffer.from(base64, 'base64'));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true, isEvalSupported: false }).promise;
  const lineas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    lineas.push(...lineasOrdenadas(tc.items));
  }
  await doc.destroy();
  // por linea: codigo cant DESC $ pUnit dto% $ unitCdto $ final
  const map = new Map();
  for (const ln of lineas) {
    const m = ln.match(/^\s*(\d{6,8})\s+(\d+)\s+(.*?)\$\s*([\d.]+,\d{2})\s+(\d+)\s*%/);
    if (m) {
      const cod = m[1].replace(/^0+/, '');
      if (!map.has(cod)) map.set(cod, { cant: Number(m[2]), pUnit: num(m[4]), dto: Number(m[5]) });
    }
  }
  return { map, lineas };
}

const sn = process.argv[2] || 'N144-12-06-2026';
const [v] = await get(`ventas?sale_number=eq.${sn}&select=id`);
const [p] = await get(`pedidos?sale_id=eq.${v.id}&select=remito_pdf_base64,remito_number`);
const { map, lineas } = await parse(p.remito_pdf_base64);
console.log('Remito', p.remito_number, '\n--- lineas de items detectadas ---');
for (const [cod, r] of map) console.log(`cod ${cod.padStart(7)}  x${String(r.cant).padEnd(3)} $${r.pUnit.toFixed(2).padStart(10)}  dto ${r.dto}%`);
console.log(`\nTotal items: ${map.size}`);
