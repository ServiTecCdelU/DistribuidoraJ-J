import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json'};
const get=async(q)=>await(await fetch(`${U}/rest/v1/${q}`,{headers:H})).json();
const patch=async(q,body)=>{const r=await fetch(`${U}/rest/v1/${q}`,{method:'PATCH',headers:H,body:JSON.stringify(body)});if(!r.ok)throw new Error(await r.text());};
const post=async(q,body)=>{const r=await fetch(`${U}/rest/v1/${q}`,{method:'POST',headers:H,body:JSON.stringify(body)});if(!r.ok)throw new Error(await r.text());};

// Replica registrarMovimiento (entrada de stock)
async function reponer(productId, cantidad, motivo){
  const prodId = productId.startsWith('prod_')?productId:`prod_${productId}`;
  const mpId = productId.startsWith('prod_')?productId.slice(5):productId;
  const [prod]=await get(`productos?id=eq.${prodId}&select=stock`);
  let stockAnterior;
  if(prod && prod.stock!=null) stockAnterior=Number(prod.stock);
  else {const [mp]=await get(`mayorista_productos?id=eq.${mpId}&select=stock_local`);stockAnterior=Number(mp?.stock_local??0);}
  const stockPosterior=Math.max(0,stockAnterior+cantidad);
  await post(`stock_movimientos`,{mayorista_producto_id:mpId,tipo:'ajuste',cantidad,stock_anterior:stockAnterior,stock_posterior:stockPosterior,motivo});
  await patch(`mayorista_productos?id=eq.${mpId}`,{stock_local:stockPosterior});
  await patch(`productos?id=eq.${prodId}`,{stock:stockPosterior});
  return {stockAnterior,stockPosterior};
}
const salida=i=>(Number(i.quantity)||0)+(Number(i.regalo)||0);

const ids=['pedido_rodriguezeliana_4','pedido_zaballopamela_2','pedido_supermercadomt_2'];
for(const id of ids){
  const [p]=await get(`pedidos?id=eq.${id}&select=id,client_name,remito_number,stock_descontado,items`);
  if(!p){console.log('NO encontrado',id);continue;}
  if(p.stock_descontado!==true){console.log('skip (sin stock descontado):',id);continue;}
  console.log(`\n=== ${p.client_name} (${p.remito_number}) ===`);
  const motivo=`Rechazo pedido ${p.remito_number||''} — ${p.client_name||''} (retroactivo)`.trim();
  for(const it of (p.items||[])){
    if(!it.productId||salida(it)<=0)continue;
    const r=await reponer(it.productId, salida(it), motivo);
    console.log(`  +${salida(it)} ${it.name} [${it.productId}] ${r.stockAnterior}->${r.stockPosterior}`);
  }
}
console.log('\nListo.');
