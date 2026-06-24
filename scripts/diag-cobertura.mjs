import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
function ord(items){const rows=[];for(const it of items){if(!it.str.trim())continue;const x=it.transform[4],y=it.transform[5];let r=rows.find(r=>Math.abs(r.y-y)<3);if(!r){r={y,cells:[]};rows.push(r);}r.cells.push({x,s:it.str});}rows.sort((a,b)=>b.y-a.y);return rows.map(r=>r.cells.sort((a,b)=>a.x-b.x).map(c=>c.s).join(' '));}
async function pm(b64){const data=new Uint8Array(Buffer.from(b64,'base64'));const doc=await pdfjs.getDocument({data,disableFontFace:true,isEvalSupported:false}).promise;const L=[];for(let i=1;i<=doc.numPages;i++)L.push(...ord((await(await doc.getPage(i)).getTextContent()).items));await doc.destroy();let n=0;for(const ln of L)if(/^\s*(\d{6,8})\s+(\d+)\s+(.*?)\$\s*([\d.]+,\d{2})\s+(\d+)\s*%/.test(ln))n++;return n;}
let from=0,step=20,iter=0,ok=0,fail=[];
for(;;){
  const r=await fetch(`${U}/rest/v1/pedidos?remito_pdf_base64=not.is.null&sale_id=not.is.null&select=id,remito_number,remito_pdf_base64&order=created_at.asc`,{headers:{...H,Range:`${from}-${from+step-1}`}});
  const lote=await r.json();if(!Array.isArray(lote)||lote.length===0)break;
  for(const p of lote){iter++;let n=0;try{n=await pm(p.remito_pdf_base64);}catch{}if(n>0)ok++;else fail.push(p.remito_number);}
  if(lote.length<step)break;from+=step;
}
console.log('pedidos iterados:',iter,' parseados ok:',ok,' fallidos:',fail.length);
console.log('remitos fallidos (primeros 30):',fail.slice(0,30).join(', '));
