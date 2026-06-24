import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
// mayorista habilitado=true con producto_id
let mp=[],from=0;
while(true){
  const b=await(await fetch(`${U}/rest/v1/mayorista_productos?select=id,producto_id,habilitado&habilitado=eq.true&producto_id=not.is.null&limit=1000&offset=${from}`,{headers:H})).json();
  if(!Array.isArray(b)||b.length===0)break;mp=mp.concat(b);if(b.length<1000)break;from+=1000;
}
console.log('mayorista_productos habilitado=true con producto_id:',mp.length);
// traer disabled de esos productos
const ids=mp.map(m=>m.producto_id);
const prodDisabled=new Map();
for(let i=0;i<ids.length;i+=200){
  const chunk=ids.slice(i,i+200);
  const inList='('+chunk.map(x=>`"${x}"`).join(',')+')';
  const rows=await(await fetch(`${U}/rest/v1/productos?select=id,disabled,stock&id=in.${inList}`,{headers:H})).json();
  if(Array.isArray(rows))for(const r of rows)prodDisabled.set(r.id,{disabled:r.disabled,stock:r.stock});
}
let inconsistentes=0,sinProducto=0;const ej=[];
for(const m of mp){
  const p=prodDisabled.get(m.producto_id);
  if(!p){sinProducto++;continue;}
  if(p.disabled===true){inconsistentes++;if(ej.length<10)ej.push(`${m.producto_id} (mp ${m.id}) disabled=true stock=${p.stock}`);}
}
console.log('>>> HABILITADOS en mayorista pero OCULTOS en productos (disabled=true):',inconsistentes);
console.log('>>> habilitados cuyo producto_id no existe en productos:',sinProducto);
console.log('ejemplos inconsistentes:');ej.forEach(e=>console.log('  ',e));
