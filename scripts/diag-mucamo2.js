require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: p } = await s.from("pedidos").select("*").eq("id","pedido_elmucamo_5").single();
  console.log(JSON.stringify(p).slice(0,2500));
  const { data: v } = await s.from("ventas").select("id,client_name,total,created_at,remito_numero,status").ilike("client_name","%mucamo%").order("created_at",{ascending:false}).limit(5);
  console.log("\nVENTAS", JSON.stringify(v,null,1));
})();
