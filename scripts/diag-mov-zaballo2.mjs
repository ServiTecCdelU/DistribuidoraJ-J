import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
const codigos=['mp_0212905','mp_0105599','mp_0215338','mp_0106068','mp_0103317','mp_0105548','mp_0007392','mp_0012525'];
for(const c of codigos){
  const movs=await(await fetch(`${U}/rest/v1/stock_movimientos?mayorista_producto_id=eq.${c}&created_at=gte.2026-06-16&select=tipo,cantidad,stock_anterior,stock_posterior,motivo,venta_id,created_at&order=created_at.asc`,{headers:H})).json();
  console.log(`\n${c}:`);
  if(Array.isArray(movs)&&movs.length) movs.forEach(m=>console.log(`  ${m.created_at?.slice(0,16)} | ${m.tipo} | cant=${m.cantidad} | ${m.stock_anterior}->${m.stock_posterior} | venta=${m.venta_id||'-'} | motivo="${m.motivo||''}"`));
  else console.log('  (sin movimientos desde 16/06)');
}
console.log('\n=== muestra de motivos usados (ultimos 15) ===');
const last=await(await fetch(`${U}/rest/v1/stock_movimientos?select=tipo,motivo,venta_id,created_at&order=created_at.desc&limit=15`,{headers:H})).json();
last.forEach(m=>console.log(`  ${m.tipo} | venta=${m.venta_id||'-'} | motivo="${m.motivo||''}"`));
