require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const recibos = [
  "RC-2026-00196",
  "RC-2026-00199",
  "RC-2026-00200",
  "RC-2026-00201",
  "RC-2026-00202",
];

(async () => {
  const { data: txs, error: selError } = await s
    .from("transacciones")
    .select("id, recibo_numero")
    .in("recibo_numero", recibos)
    .eq("anulado", true);
  if (selError) { console.error(selError); process.exit(1); }
  const ids = (txs || []).map((t) => t.id);
  if (ids.length === 0) { console.log("Nada para borrar"); return; }

  const { data: comps, error: compError } = await s
    .from("comprobantes_pago")
    .delete()
    .in("transaction_id", ids)
    .select("id, transaction_id");
  if (compError) { console.error(compError); process.exit(1); }
  console.log("Comprobantes borrados:", JSON.stringify(comps, null, 2));

  const { data, error } = await s
    .from("transacciones")
    .delete()
    .in("id", ids)
    .select("id, recibo_numero");
  if (error) { console.error(error); process.exit(1); }
  console.log("Transacciones borradas:", JSON.stringify(data, null, 2));
})();
