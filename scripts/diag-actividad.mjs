import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
const dias=30;const limite=new Date();limite.setDate(limite.getDate()-dias);limite.setHours(0,0,0,0);
const cl=await(await fetch(`${U}/rest/v1/clientes?select=id,name&limit=10000`,{headers:H})).json();
const vs=await(await fetch(`${U}/rest/v1/ventas?select=client_id,seller_name,created_at&client_id=not.is.null&order=created_at.desc&limit=100000`,{headers:H})).json();
const ult=new Map();
for(const v of vs){if(!v.client_id||ult.has(v.client_id))continue;ult.set(v.client_id,{d:new Date(v.created_at),s:v.seller_name});}
let act=0,inact=0;const ej=[];
for(const c of cl){const u=ult.get(c.id);if(!u)continue;if(u.d>=limite)act++;else{inact++;if(ej.length<6)ej.push(`${c.name} | ${u.s||'s/v'} | hace ${Math.floor((Date.now()-u.d)/86400000)}d`);}}
console.log('clientes total:',cl.length,'| con compras:',ult.size);
console.log('ACTIVOS (<=30d):',act,'| INACTIVOS (>30d):',inact);
console.log('ejemplos inactivos:');ej.forEach(e=>console.log('  ',e));
