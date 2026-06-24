import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
// columnas de pedidos
const one=await(await fetch(`${U}/rest/v1/pedidos?select=*&limit=1`,{headers:H})).json();
console.log('=== columnas pedidos ===');console.log(Object.keys(one[0]||{}).join(', '));
const RN='R-2026-00299';
console.log('\n=== PEDIDOS remito',RN,'===');
const p=await(await fetch(`${U}/rest/v1/pedidos?remito_number=eq.${RN}&select=id,client_name,status,remito_number,created_at,updated_at`,{headers:H})).json();
console.log(JSON.stringify(p,null,2));
console.log('\n=== cliente pamela (ventas) ===');
const v=await(await fetch(`${U}/rest/v1/ventas?client_name=ilike.*pamela*&select=id,sale_number,client_name,total,remito_number,created_at&order=created_at.desc`,{headers:H})).json();
console.log(JSON.stringify(v,null,2));
console.log('\n=== cliente pamela (pedidos) ===');
const pp=await(await fetch(`${U}/rest/v1/pedidos?client_name=ilike.*pamela*&select=id,client_name,status,remito_number,created_at,updated_at&order=created_at.desc`,{headers:H})).json();
console.log(JSON.stringify(pp,null,2));
console.log('\n=== remitos cercanos 00297-00301 en ventas ===');
for(const n of ['00297','00298','00299','00300','00301']){
  const r=await(await fetch(`${U}/rest/v1/ventas?remito_number=eq.R-2026-${n}&select=client_name,total,created_at,remito_number`,{headers:H})).json();
  console.log(`R-2026-${n}:`,r.length?JSON.stringify(r[0]):'(no existe en ventas)');
}
console.log('\n=== remitos cercanos en pedidos ===');
for(const n of ['00297','00298','00299','00300','00301']){
  const r=await(await fetch(`${U}/rest/v1/pedidos?remito_number=eq.R-2026-${n}&select=client_name,status,created_at,remito_number`,{headers:H})).json();
  console.log(`R-2026-${n}:`,r.length?JSON.stringify(r[0]):'(no existe en pedidos)');
}
