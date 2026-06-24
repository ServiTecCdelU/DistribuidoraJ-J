import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
// hoy en Argentina (UTC-3): desde 03:00Z de hoy hasta +1d
const now=new Date();
const ar=new Date(now.getTime()-3*3600*1000);
const y=ar.getUTCFullYear(),m=String(ar.getUTCMonth()+1).padStart(2,'0'),d=String(ar.getUTCDate()).padStart(2,'0');
const from=`${y}-${m}-${d}T03:00:00`;
const to=new Date(Date.parse(from)+24*3600*1000).toISOString().slice(0,19);
const url=`${U}/rest/v1/devoluciones?created_at=gte.${from}&created_at=lt.${to}&select=recibo_numero,client_name,seller_name,sale_number,total,items,created_at&order=created_at.desc`;
const rows=await(await fetch(url,{headers:H})).json();
console.log(`DEVOLUCIONES de hoy (${y}-${m}-${d} AR):`, Array.isArray(rows)?rows.length:rows);
if(Array.isArray(rows))for(const r of rows){
  const hora=new Date(r.created_at).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'});
  console.log(`\n  ${r.recibo_numero} | ${hora}`);
  console.log(`  Cliente: ${r.client_name||'(sin cliente)'} | Vendedor: ${r.seller_name||'-'} | Venta #${r.sale_number||'-'} | Total: $${r.total}`);
  (r.items||[]).forEach(it=>console.log(`     - ${it.quantity}x ${it.name} ($${it.price}) [${it.destino}]`));
}
