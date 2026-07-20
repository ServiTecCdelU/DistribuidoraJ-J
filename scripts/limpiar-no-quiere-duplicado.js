// Limpia filas [NO_QUIERE] legacy que tienen un [RECHAZO] gemelo con TEXTO IDENTICO
// para la misma venta. El [RECHAZO] es la fila canonica (la dejamos). items_no_entregados
// (fuente de verdad) NO se toca. Monto 0: sin impacto en stock/caja.
// Idempotente. Dry-run por defecto; correr con --apply para borrar.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes("--apply");
const strip = (d) => (d || "")
  .replace(/^\[(NO_QUIERE|RECHAZO)\]\s*\S+\s*—\s*/, "")
  .replace(/^\[(NO_QUIERE|RECHAZO)\]\s*/, "")
  .trim();

(async () => {
  const { data, error } = await s.from("transacciones")
    .select("id, sale_id, description")
    .or("description.like.[NO_QUIERE]%,description.like.[RECHAZO]%");
  if (error) { console.error(error.message); process.exit(1); }

  // Indexar textos de [RECHAZO] por venta
  const rechazoTextos = new Map(); // sale_id -> Set(texto)
  for (const t of data) {
    if ((t.description || "").startsWith("[RECHAZO]") && t.sale_id) {
      if (!rechazoTextos.has(t.sale_id)) rechazoTextos.set(t.sale_id, new Set());
      rechazoTextos.get(t.sale_id).add(strip(t.description));
    }
  }

  // Candidatos: [NO_QUIERE] cuyo texto coincide con un [RECHAZO] de la misma venta
  const aBorrar = data.filter((t) =>
    (t.description || "").startsWith("[NO_QUIERE]") &&
    t.sale_id &&
    rechazoTextos.get(t.sale_id)?.has(strip(t.description))
  );

  for (const t of aBorrar) console.log(`${APPLY ? "DELETE" : "DRY"}  ${t.sale_id}  ${t.id}  ${t.description}`);
  console.log(`\nTotal a borrar: ${aBorrar.length}`);

  if (APPLY && aBorrar.length > 0) {
    const ids = aBorrar.map((t) => t.id);
    const { error: delErr } = await s.from("transacciones").delete().in("id", ids);
    if (delErr) { console.error(delErr.message); process.exit(1); }
    console.log(`Borradas: ${ids.length}`);
  }
  if (!APPLY) console.log("Corré con --apply para borrar.");
})();
