require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CID = "cliente_kioscomarcela_2";

(async () => {
  const { data: cli } = await supabase
    .from("clientes")
    .select("id, name, current_balance, cuenta_corriente_habilitada")
    .eq("id", CID)
    .single();
  console.log("CLIENTE:", JSON.stringify(cli));

  const { data: vs } = await supabase
    .from("ventas")
    .select("id, sale_number, total, payment_type, hoja_ruta_number, created_at")
    .eq("client_id", CID)
    .order("created_at", { ascending: false });
  console.log(`\nVENTAS (${(vs || []).length}):`);
  (vs || []).forEach((v) => console.log("  ", JSON.stringify(v)));

  const { data: tx } = await supabase
    .from("transacciones")
    .select("id, type, amount, saldo, description, date, sale_id, anulado")
    .eq("client_id", CID)
    .order("date", { ascending: true });
  console.log(`\nTRANSACCIONES (${(tx || []).length}):`);
  (tx || []).forEach((t) => console.log("  ", JSON.stringify(t)));

  const { data: dev } = await supabase
    .from("devoluciones")
    .select("id, recibo_numero, sale_id, sale_number, total, affects_balance, note, created_at")
    .eq("client_id", CID);
  console.log(`\nDEVOLUCIONES (${(dev || []).length}):`);
  (dev || []).forEach((d) => console.log("  ", JSON.stringify(d)));
})();
