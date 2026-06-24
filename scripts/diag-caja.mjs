import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
const rows=await(await fetch(`${U}/rest/v1/caja?opened_at=gte.2026-06-17&select=id,opened_at,closed_at,opened_by,closed_by,status,total_sales,cash_total&order=opened_at.desc`,{headers:H})).json();
console.log('CAJAS desde 2026-06-17:');
for(const r of rows){console.log(`${r.opened_at} -> ${r.closed_at||'(abierta)'} | ${r.status} | open_by=${r.opened_by} | close_by=${r.closed_by} | ventas=${r.total_sales} cash=${r.cash_total}`);}
console.log('total filas:',rows.length);
// ventas con remito del sabado 20
const vs=await(await fetch(`${U}/rest/v1/ventas?created_at=gte.2026-06-20T00:00:00&created_at=lt.2026-06-21T00:00:00&remito_number=not.is.null&select=id,created_at,total,remito_number`,{headers:H})).json();
console.log('\nVENTAS con remito del SABADO 2026-06-20:',Array.isArray(vs)?vs.length:vs);
if(Array.isArray(vs))vs.forEach(v=>console.log(`  ${v.created_at} $${v.total} ${v.remito_number}`));
