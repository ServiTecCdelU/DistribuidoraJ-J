import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
for(const t of ['caja','ventas']){
  const r=await(await fetch(`${U}/rest/v1/${t}?select=*&limit=1`,{headers:H})).json();
  console.log(`\n=== ${t} columnas ===`);
  console.log(r[0]?Object.keys(r[0]).join(', '):'(sin filas)');
}
