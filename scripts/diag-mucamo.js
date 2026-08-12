require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: p, error } = await supabase.from("pedidos").select("*").ilike("client_name", "%mucamo%").order("created_at", { ascending: false }).limit(40);
  if (error) return console.log("ERR pedidos", error.message);
  console.log("PEDIDOS", p.length);
  p.forEach((x) => {
    console.log(" -", x.id, "|", x.client_name, "|", x.status, "| total", x.total, "| created", x.created_at, "| upd", x.updated_at, "| remito:", x.remito_numero || x.remito_number || (x.remito ? "SI(obj)" : "-"), "| items", (x.items || []).length);
  });

  const { data: a } = await supabase.from("auditoria").select("*").order("created_at", { ascending: false }).limit(300);
  const rel = (a || []).filter((r) => JSON.stringify(r).toLowerCase().includes("mucamo"));
  console.log("\nAUDITORIA relacionada:", rel.length);
  rel.forEach((r) => console.log("  ", r.created_at, r.action || r.accion, r.entity || r.entidad, (r.user_name || r.usuario || ""), JSON.stringify(r).slice(0, 400)));
})();
