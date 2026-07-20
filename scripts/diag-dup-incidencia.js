require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await s.from("transacciones").select("sale_id, id, description")
    .ilike("description", "%AGUANTADORA%");
  console.log("TRANSACCIONES:", JSON.stringify(data, null, 2));
  const ids = [...new Set((data || []).map(d => d.sale_id).filter(Boolean))];
  for (const id of ids) {
    const { data: v } = await s.from("ventas").select("id, sale_number, items_no_entregados").eq("id", id).single();
    console.log("\nVENTA", id, "items_no_entregados:", JSON.stringify(v?.items_no_entregados, null, 2));
  }
})();
