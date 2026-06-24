const fs=require('fs'),path=require('path');
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`};
const q=async p=>(await fetch(`${U}/rest/v1/${p}`,{headers:H})).json();
(async()=>{
  for(const sn of ['N109-09-06-2026','N95-06-06-2026','N47-04-06-2026','N147-12-06-2026']){
    const [v]=await q(`ventas?sale_number=eq.${sn}&select=id,total`);
    const peds=await q(`pedidos?sale_id=eq.${v.id}&select=id,remito_number`);
    console.log(sn,'total=',v.total,'→ remitos:',peds.map(p=>p.remito_number).join(', ')||'ninguno','(',peds.length,'pedidos)');
  }
})().catch(e=>console.error(e));
