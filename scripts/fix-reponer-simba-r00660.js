require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Reacomodo del historial de AGUA X 6.5L SIMBA tras eliminar el remito R-2026-00660.
// Deja: R660 -126 (134->8) → reposición +126 (8->134, ligada al remito eliminado) → R663 -126 (134->8).
(async () => {
  // 1. Borrar la corrección -118 (ya no hace falta con el orden correcto)
  await supabase.from("stock_movimientos").delete().eq("id", 10265);

  // 2. Reposición ligada al R660: justo después de él, con snapshots correctos
  await supabase.from("stock_movimientos").update({
    created_at: "2026-07-08T16:36:40",
    stock_anterior: 8,
    stock_posterior: 134,
    motivo: "Remito R-2026-00660 eliminado — stock repuesto",
  }).eq("id", 10264);

  // 3. R663: venta real, ahora descuenta limpio de 134 -> 8 (antes clampeada 8->0)
  await supabase.from("stock_movimientos").update({
    stock_anterior: 134,
    stock_posterior: 8,
  }).eq("id", 10248);

  // 4. Stock final correcto
  await supabase.from("mayorista_productos").update({ stock_local: 8 }).eq("id", "mp_0215912");
  await supabase.from("productos").update({ stock: 8 }).eq("id", "prod_mp_0215912");

  const { data: movs } = await supabase
    .from("stock_movimientos")
    .select("created_at, tipo, cantidad, stock_anterior, stock_posterior, motivo")
    .eq("mayorista_producto_id", "mp_0215912")
    .gte("created_at", "2026-07-08T16:30:00")
    .order("created_at", { ascending: false });
  console.log("HISTORIAL FINAL:");
  (movs || []).forEach((m) =>
    console.log("  ", m.created_at.slice(0, 19), "|", m.tipo, "| cant:", m.cantidad, "|", m.stock_anterior, "->", m.stock_posterior, "|", m.motivo)
  );
})();
