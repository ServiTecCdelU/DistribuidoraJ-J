const fs=require('fs'),path=require('path');
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json',Prefer:'return=representation'};
const PRECIOS={mp_0101573:1049.49, mp_0101572:749.81};
const TOTAL_REMITO=337503.46;
const get=async p=>(await fetch(`${U}/rest/v1/${p}`,{headers:H})).json();
const patch=async(p,body)=>{const r=await fetch(`${U}/rest/v1/${p}`,{method:'PATCH',headers:H,body:JSON.stringify(body)});return{ok:r.ok,status:r.status,data:await r.json()};};
const fixItems=items=>items.map(it=>PRECIOS[it.productId]!=null?{...it,price:PRECIOS[it.productId]}:it);
(async()=>{
  // 1) VENTA
  const [v]=await get('ventas?id=eq.venta_supermercadounidos_2&select=items,total');
  const r1=await patch('ventas?id=eq.venta_supermercadounidos_2',{
    items:fixItems(v.items), subtotal:TOTAL_REMITO, total:TOTAL_REMITO,
    cash_amount:TOTAL_REMITO, transferencia_amount:TOTAL_REMITO,
  });
  console.log('VENTA patch ok=',r1.ok,'total=',r1.data?.[0]?.total);

  // 2) PEDIDO
  const [p]=await get('pedidos?id=eq.pedido_supermercadounidos_1&select=items');
  const r2=await patch('pedidos?id=eq.pedido_supermercadounidos_1',{items:fixItems(p.items)});
  console.log('PEDIDO patch ok=',r2.ok);

  // 3) VENDEDOR (acumulados)
  const [s]=await get('vendedores?id=eq.vendedor_adriangange_1&select=total_sales,total_commission,commission_rate');
  const delta=338288.74-TOTAL_REMITO;                 // 785.28
  const deltaCom=Math.round(delta*(Number(s.commission_rate)/100)*100)/100; // 23.56
  const r3=await patch('vendedores?id=eq.vendedor_adriangange_1',{
    total_sales:Math.round((Number(s.total_sales)-delta)*100)/100,
    total_commission:Math.round((Number(s.total_commission)-deltaCom)*100)/100,
  });
  console.log('VENDEDOR patch ok=',r3.ok,'| delta_ventas=',delta,'delta_comision=',deltaCom);
  console.log('  total_sales:',s.total_sales,'->',r3.data?.[0]?.total_sales);
  console.log('  total_commission:',s.total_commission,'->',r3.data?.[0]?.total_commission);

  // verificacion comision derivada de la venta
  console.log('\nComision de ESTA venta (derivada): ',TOTAL_REMITO,'* 3% =',Math.round(TOTAL_REMITO*0.03*100)/100);
})().catch(e=>console.error(e));
