// Corrige el saldo a favor fantasma de KIOSCO MARCELA (cliente de contado, sin cta cte).
// DEV-00072 (venta N1361-24-08-2026) bajó current_balance a -13.459,40 aunque la
// devolución se hizo en efectivo. Mismo patrón que la corrección del 2026-08-04.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CID = "cliente_kioscomarcela_2";
const DEV_ID = "devolucion_kioscomarcela_1";
const TX_ID = "transaccion_kioscomarcela_1";

(async () => {
  const r1 = await supabase
    .from("devoluciones")
    .update({ affects_balance: false })
    .eq("id", DEV_ID);
  console.log("devoluciones.affects_balance=false:", r1.error?.message || "OK");

  const r2 = await supabase.from("transacciones").update({ anulado: true }).eq("id", TX_ID);
  console.log("transacciones.anulado=true:", r2.error?.message || "OK");

  const r3 = await supabase.from("clientes").update({ current_balance: 0 }).eq("id", CID);
  console.log("clientes.current_balance=0:", r3.error?.message || "OK");

  const { data: cli } = await supabase
    .from("clientes")
    .select("id, name, current_balance, cuenta_corriente_habilitada")
    .eq("id", CID)
    .single();
  console.log("\nFINAL:", JSON.stringify(cli));
})();
