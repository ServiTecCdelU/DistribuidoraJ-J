import fs from 'fs';import path from 'path';import {fileURLToPath} from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const env=fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const g=k=>((env.match(new RegExp(`^${k}=(.*)$`,'m'))||[])[1]||'').trim().replace(/^"|"$/g,'');
const U=g('NEXT_PUBLIC_SUPABASE_URL'),K=g('SUPABASE_SERVICE_ROLE_KEY');
const H={apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json'};
const HORA_AP=6,HORA_CI=23,LIMITE_DIAS=31;
const ahora=new Date();const diaHoy=new Date(ahora);diaHoy.setHours(0,0,0,0);
const limite=new Date(diaHoy);limite.setDate(limite.getDate()-LIMITE_DIAS);
const dk=d=>`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const map=r=>({createdAt:r.created_at,total:Number(r.total)||0,paymentType:r.payment_type,paymentMethod:r.payment_method||'efectivo',cashAmount:Number(r.cash_amount)||0,creditAmount:Number(r.credit_amount)||0,remitoNumber:r.remito_number});
const agg=src=>{let efectivo=0,transfer=0,credito=0,total=0;for(const s of src){total+=s.total||0;const m=s.paymentMethod||'efectivo';if(s.paymentType==='cash'){if(m==='transferencia')transfer+=s.total||0;else efectivo+=s.total||0;}else if(s.paymentType==='credit'){credito+=s.total||0;}else if(s.paymentType==='mixed'){const ef=m!=='transferencia'?s.cashAmount:0;const tr=m==='transferencia'?s.cashAmount:0;efectivo+=ef;transfer+=tr;credito+=s.creditAmount;}}return{efectivo,transfer,credito,total,count:src.length};};

const ventas=(await(await fetch(`${U}/rest/v1/ventas?created_at=gte.${limite.toISOString()}&remito_number=not.is.null&select=created_at,total,payment_type,payment_method,cash_amount,credit_amount,remito_number`,{headers:H})).json()).map(map);
const cajas=await(await fetch(`${U}/rest/v1/caja?opened_at=gte.${limite.toISOString()}&select=opened_at`,{headers:H})).json();
const diasConCaja=new Set(cajas.map(r=>dk(new Date(r.opened_at))));
const pagos=await(await fetch(`${U}/rest/v1/pagos_comisiones?created_at=gte.${limite.toISOString()}&select=monto,created_at`,{headers:H})).json();

const porDia=new Map();
for(const s of ventas){const d=new Date(s.createdAt);if(d<limite||d>=diaHoy)continue;const dia=new Date(d);dia.setHours(0,0,0,0);const key=dk(dia);if(diasConCaja.has(key))continue;if(!porDia.has(key))porDia.set(key,[]);porDia.get(key).push(s);}

for(const [key,vs] of porDia){
  const [yy,mm,dd]=key.split('-').map(Number);
  const dia=new Date(yy,mm,dd,0,0,0,0);
  const ap=new Date(dia);ap.setHours(HORA_AP,0,0,0);
  const ci=new Date(dia);ci.setHours(HORA_CI,0,0,0);
  const periodo=vs.filter(s=>{const d=new Date(s.createdAt);return d>=ap&&d<=ci;});
  if(!periodo.length)continue;
  const st=agg(periodo);
  const comis=pagos.reduce((a,p)=>{const pd=new Date(p.created_at);return pd>=ap&&pd<=ci?a+(Number(p.monto)||0):a;},0);
  const esperado=st.efectivo-comis;
  const dateStr=`${yy}${String(mm+1).padStart(2,'0')}${String(dd).padStart(2,'0')}`;
  const id=`caja_${dateStr}_1`;
  const body={id,opened_at:ap.toISOString(),opened_by:'Apertura automática',initial_amount:0,closed_at:ci.toISOString(),closed_by:'Cierre automático',final_amount:esperado,expected_amount:esperado,difference:0,status:'closed',notes:'Cierre automático 23:00 (retroactivo)',sales_count:st.count,total_sales:st.total,cash_total:st.efectivo,credit_total:st.credito,transfer_total:st.transfer};
  const res=await fetch(`${U}/rest/v1/caja`,{method:'POST',headers:{...H,Prefer:'return=representation'},body:JSON.stringify(body)});
  const txt=await res.text();
  console.log(`Creada caja ${id} (${new Date(yy,mm,dd).toDateString()}): ventas=${st.count} total=${st.total} efectivo=${st.efectivo} -> ${res.status}`);
  if(!res.ok)console.log('  ',txt.slice(0,200));
}
console.log('Días backfilleados:',porDia.size);
