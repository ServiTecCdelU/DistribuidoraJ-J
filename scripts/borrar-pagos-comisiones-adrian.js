// Borra los pagos de comisiones de prueba cargados a Adrian.
// Uso: node scripts/borrar-pagos-comisiones-adrian.js          (lista, no borra)
//      node scripts/borrar-pagos-comisiones-adrian.js --borrar (borra)
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BORRAR = process.argv.includes("--borrar");

(async () => {
  const { data: vendedores, error: eV } = await supabase
    .from("vendedores")
    .select("id, name")
    .ilike("name", "%adrian%");
  if (eV) throw eV;

  if (!vendedores || vendedores.length === 0) {
    console.log("No se encontro ningun vendedor que coincida con 'adrian'.");
    return;
  }
  console.log("Vendedores:", vendedores.map((v) => `${v.name} (${v.id})`).join(", "));

  const ids = vendedores.map((v) => v.id);
  const { data: pagos, error: eP } = await supabase
    .from("pagos_comisiones")
    .select("id, seller_name, monto, monto_pagado, fecha_pago, anulado, nota")
    .in("seller_id", ids)
    .order("fecha_pago", { ascending: true });
  if (eP) throw eP;

  console.log(`\nPagos encontrados: ${pagos.length}`);
  pagos.forEach((p) => {
    console.log(
      `  ${p.id} | ${p.fecha_pago} | devengado ${p.monto} | pagado ${p.monto_pagado}` +
        `${p.anulado ? " | ANULADO" : ""}${p.nota ? ` | ${p.nota}` : ""}`
    );
  });

  if (!BORRAR) {
    console.log("\nModo consulta. Volve a correr con --borrar para eliminarlos.");
    return;
  }

  const { error: eD } = await supabase
    .from("pagos_comisiones")
    .delete()
    .in("id", pagos.map((p) => p.id));
  if (eD) throw eD;

  console.log(`\nBorrados ${pagos.length} pagos. Las comisiones vuelven a pendiente solas.`);
})().catch((e) => {
  console.error("ERROR:", e.message || e);
  process.exit(1);
});
