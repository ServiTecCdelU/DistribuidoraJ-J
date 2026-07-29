require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: sample } = await s.from("pedidos").select("*").limit(1);
  console.log("=== columnas pedidos ===");
  console.log(Object.keys(sample?.[0] || {}));

  const { data: pedidos, error } = await s
    .from("pedidos")
    .select("id, client_name, seller_name, transportista_name, status, sale_id, remito_number, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) { console.error("pedidos error:", error); return; }
  console.log("=== Últimos pedidos por updated_at ===");
  console.log(JSON.stringify(pedidos, null, 2));

  const { data: delivery, error: errD } = await s
    .from("pedidos")
    .select("id, client_name, transportista_name, status, updated_at")
    .eq("status", "delivery")
    .order("updated_at", { ascending: false });
  if (errD) console.error("delivery error:", errD);
  console.log("=== Pedidos actualmente en 'delivery' ===");
  console.log(JSON.stringify(delivery, null, 2));

  const cols = await s.from("auditoria").select("*").limit(1);
  console.log("=== columnas auditoria ===", Object.keys(cols.data?.[0] || {}));

  const { data: auditoria, error: err2 } = await s
    .from("auditoria")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  if (err2) { console.error("auditoria error:", err2); return; }
  console.log("=== Últimas 30 entradas de auditoría (todas) ===");
  console.log(JSON.stringify(auditoria, null, 2));
})();
