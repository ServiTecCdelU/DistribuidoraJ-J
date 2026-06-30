require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // 1. cliente en tabla clientes (columnas?)
  const { data: cs } = await supabase.from("clientes").select("*").limit(1);
  console.log("COLUMNAS clientes:", cs && cs[0] ? Object.keys(cs[0]).join(", ") : "—");

  const { data: cli } = await supabase
    .from("clientes")
    .select("*")
    .or("name.ilike.%retamar%,name.ilike.%rosa%retamar%");
  console.log("\nCLIENTE(S) retamar:");
  (cli || []).forEach((c) => console.log("  ", JSON.stringify(c).slice(0, 300)));

  // 2. ventas de la semana 22-26 jun de ese cliente
  const { data: vsample } = await supabase.from("ventas").select("*").limit(1);
  console.log("\nCOLUMNAS ventas:", vsample && vsample[0] ? Object.keys(vsample[0]).join(", ") : "—");

  const { data: ventas } = await supabase
    .from("ventas")
    .select("id, client_name, created_at, remito_number, status")
    .ilike("client_name", "%retamar%")
    .order("created_at", { ascending: false });
  console.log("\nVENTAS retamar (todas):");
  (ventas || []).forEach((v) =>
    console.log("  ", v.id, "|", v.created_at, "| remito:", v.remito_number, "|", v.status)
  );

  // 3. cualquier pedido/venta del cliente_id despensarosaretamar la semana 22-26
  const { data: pedSem } = await supabase
    .from("pedidos")
    .select("id, client_name, status, created_at")
    .gte("created_at", "2026-06-22T00:00:00")
    .lt("created_at", "2026-06-26T23:59:59")
    .order("created_at", { ascending: true });
  console.log("\nTODOS los pedidos 22-26 jun (", (pedSem || []).length, "):");
  (pedSem || []).forEach((p) =>
    console.log("  ", p.created_at.slice(0, 16), "|", p.client_name, "|", p.status)
  );
})();
