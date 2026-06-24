import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
function ord(items){const rows=[];for(const it of items){if(!it.str.trim())continue;const x=it.transform[4],y=it.transform[5];let r=rows.find(r=>Math.abs(r.y-y)<3);if(!r){r={y,cells:[]};rows.push(r);}r.cells.push({x,s:it.str});}rows.sort((a,b)=>b.y-a.y);return rows.map(r=>r.cells.sort((a,b)=>a.x-b.x).map(c=>c.s).join(' '));}
const rn=process.argv[2]||'R-2026-00066';
const [p]=await(await fetch(`${U}/rest/v1/pedidos?remito_number=eq.${rn}&select=remito_pdf_base64&limit=1`,{headers:H})).json();
const data=new Uint8Array(Buffer.from(p.remito_pdf_base64,'base64'));
const doc=await pdfjs.getDocument({data,disableFontFace:true,isEvalSupported:false}).promise;
const L=ord((await(await doc.getPage(1)).getTextContent()).items);
console.log(`paginas=${doc.numPages}`);
L.slice(0,30).forEach((l,i)=>console.log(String(i).padStart(2),JSON.stringify(l)));
