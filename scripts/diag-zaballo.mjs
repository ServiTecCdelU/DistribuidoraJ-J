import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
const [p]=await(await fetch(`${U}/rest/v1/pedidos?id=eq.pedido_zaballopamela_2&select=*`,{headers:H})).json();
if(!p){console.log('no encontrado');process.exit();}
console.log('=== PEDIDO ===');
console.log('id:',p.id,'| status:',p.status);
console.log('cliente:',p.client_name,'| client_id:',p.client_id);
console.log('vendedor:',p.seller_name,'| transportista:',p.transportista_name);
console.log('remito:',p.remito_number,'| stock_descontado:',p.stock_descontado);
console.log('creado:',p.created_at,'| actualizado:',p.updated_at);
console.log('sale_id:',p.sale_id,'| held:',p.held,'| notes:',p.notes);
console.log('discount:',p.discount,p.discount_type,'| delivery:',p.delivery_method,'| dir:',p.address);
const items=p.items||[];
console.log('\n=== ITEMS ('+items.length+') ===');
let tot=0;
for(const it of items){const base=(it.price||0)*(it.quantity||0);const dto=it.itemDiscount?base*it.itemDiscount/100:0;const sub=base-dto;tot+=sub;console.log(`  ${it.quantity} x ${it.name} @ $${it.price} ${it.itemDiscount?`(-${it.itemDiscount}%)`:''} = $${sub.toFixed(2)} [${it.productId||it.codigo||'s/cod'}]`);}
console.log('TOTAL pedido: $'+tot.toFixed(2));
// ¿existe venta con ese remito o ese order?
const vById=await(await fetch(`${U}/rest/v1/ventas?order_id=eq.${p.id}&select=id,total,created_at`,{headers:H})).json();
const vByRem=await(await fetch(`${U}/rest/v1/ventas?remito_number=eq.${p.remito_number}&select=id,total,created_at`,{headers:H})).json();
console.log('\nventas con order_id=pedido:',vById.length, vById);
console.log('ventas con remito',p.remito_number+':',vByRem.length, vByRem);
// cliente
if(p.client_id){const[c]=await(await fetch(`${U}/rest/v1/clientes?id=eq.${p.client_id}&select=name,current_balance,debt_classification,seller_id,phone`,{headers:H})).json();console.log('\n=== CLIENTE ===');console.log(c);}
// otros pedidos del cliente
const otros=await(await fetch(`${U}/rest/v1/pedidos?client_name=ilike.*zaballo*&select=id,status,remito_number,created_at,updated_at&order=created_at.desc`,{headers:H})).json();
console.log('\n=== TODOS LOS PEDIDOS DE ZABALLO ===');otros.forEach(o=>console.log(`  ${o.id} | ${o.status} | ${o.remito_number} | creado ${o.created_at?.slice(0,10)} | upd ${o.updated_at?.slice(0,10)}`));
