// Backfill: crea la transacción [RECHAZO] (monto 0) para ventas históricas
// que tienen items_no_entregados con motivo "no_quiso", para que el rechazo
// figure como movimiento propio en la cuenta corriente del cliente.
// Idempotente: no duplica si ya existe una tx [RECHAZO] para esa venta.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes("--apply");

(async () => {
  const { data: ventas, error } = await supabase
    .from("ventas")
    .select("id, created_at, client_id, client_name, sale_number, remito_number, items_no_entregados")
    .not("client_id", "is", null)
    .not("items_no_entregados", "is", null)
    .order("created_at", { ascending: true });
  if (error) { console.error(error.message); process.exit(1); }

  let candidatos = 0, insertados = 0, yaExisten = 0;
  for (const v of ventas || []) {
    const noQuiso = (v.items_no_entregados || []).filter((it) => it.motivo === "no_quiso");
    if (noQuiso.length === 0) continue;
    candidatos++;

    const { data: existentes } = await supabase
      .from("transacciones")
      .select("id, description")
      .eq("sale_id", v.id)
      .like("description", "[RECHAZO]%");
    if ((existentes || []).length > 0) { yaExisten++; continue; }

    const reciboNumero = `DEV-${v.remito_number || v.sale_number || v.id}`;
    const detalle = noQuiso.map((it) => `${it.name} x${it.quantity}`).join(", ");
    const row = {
      id: `no_quiere_${v.id}_backfill`,
      client_id: v.client_id,
      type: "payment",
      amount: 0,
      description: `[RECHAZO] ${reciboNumero} — ${detalle}`,
      sale_id: v.id,
      date: v.created_at,
      cuenta: "minorista",
    };
    console.log(`${APPLY ? "INSERT" : "DRY"}  ${v.client_name}  ${row.description}`);
    if (APPLY) {
      const { error: insErr } = await supabase.from("transacciones").insert(row);
      if (insErr) { console.error(`  ✗ ${insErr.message}`); continue; }
      insertados++;
    }
  }

  console.log(`\nCandidatos: ${candidatos}  |  Ya existían: ${yaExisten}  |  ${APPLY ? "Insertados" : "A insertar"}: ${APPLY ? insertados : candidatos - yaExisten}`);
  if (!APPLY) console.log("Corré con --apply para aplicar.");
})();
