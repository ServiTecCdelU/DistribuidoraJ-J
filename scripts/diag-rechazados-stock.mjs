import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
const rech=await(await fetch(`${U}/rest/v1/pedidos?status=eq.rechazado&select=id,client_name,remito_number,stock_descontado,items,updated_at&order=updated_at.desc`,{headers:H})).json();
console.log('Total pedidos rechazados:',rech.length);
const conStock=rech.filter(p=>p.stock_descontado===true);
console.log('Rechazados con stock_descontado=true (stock NO repuesto):',conStock.length);
for(const p of conStock){
  const items=(p.items||[]).filter(i=>i.productId);
  const u=items.reduce((a,i)=>a+(i.quantity||0)+(i.regalo||0),0);
  console.log(`  ${p.id} | ${p.client_name} | ${p.remito_number} | ${items.length} productos, ~${u} unidades | rechazado ${p.updated_at?.slice(0,10)}`);
}
