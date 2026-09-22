require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COLS =
  "id, client_id, client_name, seller_name, transportista_name, status, created_at, updated_at, sale_id, remito_number, hoja_ruta_number, source";

(async () => {
  const ids = ["cliente_kioscomarcela_1", "cliente_kioscomarcela_2"];

  const { data: peds, error } = await supabase
    .from("pedidos")
    .select(COLS)
    .in("client_id", ids)
    .gte("created_at", "2026-09-01")
    .order("created_at");
  if (error) console.log("ERR pedidos:", error.message);
  console.log("== PEDIDOS MES ==");
  for (const p of peds || []) console.log(JSON.stringify(p));

  const { data: hr, error: e2 } = await supabase
    .from("pedidos")
    .select(COLS)
    .eq("hoja_ruta_number", "112");
  if (e2) console.log("ERR hr:", e2.message);
  console.log("== PEDIDOS HOJA RUTA 112 ==");
  for (const p of hr || []) console.log(JSON.stringify(p));

  const { data: hoja, error: e3 } = await supabase
    .from("hojas_ruta")
    .select("*")
    .eq("numero", "112");
  console.log("== HOJA RUTA 112 ==", e3 ? e3.message : JSON.stringify(hoja));

  const { data: vts, error: e4 } = await supabase
    .from("ventas")
    .select("*")
    .in("client_id", ids)
    ;
  console.log("== VENTAS MES ==", e4 ? e4.message : JSON.stringify(vts));
})();
