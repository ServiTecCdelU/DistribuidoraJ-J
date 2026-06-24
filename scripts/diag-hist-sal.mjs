import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
// SAL mp_0012525: ver sus movimientos crudos
const m=await(await fetch(`${U}/rest/v1/stock_movimientos?mayorista_producto_id=eq.mp_0012525&select=tipo,cantidad,stock_anterior,stock_posterior,motivo,venta_id,created_at&order=created_at.desc`,{headers:H})).json();
console.log('SAL mp_0012525 movimientos:');m.forEach(x=>console.log(`  ${x.created_at?.slice(0,16)} | ${x.tipo} | ${x.cantidad} | ${x.stock_anterior}->${x.stock_posterior} | venta=${x.venta_id||'-'} | "${x.motivo}"`));
