import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
const cnt=async(q)=>{const r=await fetch(`${U}/rest/v1/${q}`,{headers:{...H,Prefer:'count=exact'},method:'HEAD'});return r.headers.get('content-range')?.split('/')[1];};
console.log('productos disabled=true:',await cnt('productos?disabled=eq.true&select=id'));
console.log('productos disabled=false/null:',await cnt('productos?or=(disabled.is.null,disabled.eq.false)&select=id'));
console.log('mayorista habilitado=false:',await cnt('mayorista_productos?habilitado=eq.false&select=id'));
console.log('mayorista habilitado=true:',await cnt('mayorista_productos?habilitado=eq.true&select=id'));
// mp habilitado=false con producto_id cuyo producto está disabled=false (se verian en tienda pese a estar "deshabilitados" en mayorista)
let mp=[],from=0;
while(true){const b=await(await fetch(`${U}/rest/v1/mayorista_productos?select=producto_id&habilitado=eq.false&producto_id=not.is.null&limit=1000&offset=${from}`,{headers:H})).json();if(!Array.isArray(b)||!b.length)break;mp=mp.concat(b);if(b.length<1000)break;from+=1000;}
const ids=mp.map(m=>m.producto_id);let visiblesPeroDeshab=0;
for(let i=0;i<ids.length;i+=200){const chunk=ids.slice(i,i+200);const inList='('+chunk.map(x=>`"${x}"`).join(',')+')';const rows=await(await fetch(`${U}/rest/v1/productos?select=id,disabled&id=in.${inList}&or=(disabled.is.null,disabled.eq.false)`,{headers:H})).json();if(Array.isArray(rows))visiblesPeroDeshab+=rows.length;}
console.log('mp habilitado=false con producto_id:',ids.length);
console.log('  ...de esos, producto VISIBLE en tienda (disabled=false):',visiblesPeroDeshab,'(desincronizados al reves)');
