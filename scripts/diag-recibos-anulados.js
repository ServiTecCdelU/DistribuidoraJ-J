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
  const { data, error } = await s
    .from("transacciones")
    .select("id, client_id, recibo_numero, amount, anulado, anulado_motivo, anulado_by, type, date")
    .in("recibo_numero", recibos);
  if (error) { console.error(error); return; }
  console.log(JSON.stringify(data, null, 2));
})();
