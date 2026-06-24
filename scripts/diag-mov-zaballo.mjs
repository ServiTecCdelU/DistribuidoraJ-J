import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
// columnas de stock_movimientos
const one=await(await fetch(`${U}/rest/v1/stock_movimientos?select=*&limit=1`,{headers:H})).json();
console.log('cols stock_movimientos:',Object.keys(one[0]||{}).join(', '));
const codigos=['mp_0212905','mp_0105599','mp_0215338','mp_0106068','mp_0103317','mp_0105548','mp_0007392','mp_0012525'];
console.log('\n=== Movimientos de esos productos entre 17 y 22 de junio ===');
for(const c of codigos){
  const movs=await(await fetch(`${U}/rest/v1/stock_movimientos?producto_id=eq.${c}&created_at=gte.2026-06-17&select=tipo,cantidad,referencia,created_at&order=created_at.asc`,{headers:H})).json();
  if(Array.isArray(movs)&&movs.length){
    console.log(`\n${c}:`);
    movs.forEach(m=>console.log(`  ${m.created_at?.slice(0,16)} | ${m.tipo} | cant=${m.cantidad} | ${m.referencia||''}`));
  } else {
    console.log(`\n${c}: (sin movimientos desde 17/06)`);
  }
}
// buscar cualquier movimiento que mencione rechazo
const rech=await(await fetch(`${U}/rest/v1/stock_movimientos?referencia=ilike.*rechaz*&select=producto_id,tipo,cantidad,referencia,created_at&order=created_at.desc&limit=20`,{headers:H})).json();
console.log('\n=== Movimientos con referencia "rechaz*" (todos) ===');
console.log(Array.isArray(rech)&&rech.length?rech:'NINGUNO — no existe reposición por rechazo en el historial');
