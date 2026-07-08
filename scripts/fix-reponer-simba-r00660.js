require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PROD_ID = "prod_mp_0215912"; // AGUA X 6.5L SIMBA (código 0215912)
const CANTIDAD = 126;

(async () => {
  const { data: prod } = await supabase
    .from("productos")
    .select("id, name, stock")
    .eq("id", PROD_ID)
    .maybeSingle();

  if (!prod) {
    console.log("No se encontró el producto", PROD_ID, "— NO se modificó nada.");
    return;
  }

  const mpId = PROD_ID.startsWith("prod_") ? PROD_ID.slice("prod_".length) : "";
  const stockAnterior = Number(prod.stock) || 0;
  const stockPosterior = Math.max(0, stockAnterior + CANTIDAD);

  const { error: movErr } = await supabase.from("stock_movimientos").insert({
    mayorista_producto_id: mpId || null,
    tipo: "ajuste",
    cantidad: CANTIDAD,
    stock_anterior: stockAnterior,
    stock_posterior: stockPosterior,
    motivo: "Reposición manual — remito r-2026-00660 eliminado sin reponer stock",
  });
  if (movErr) throw movErr;

  if (mpId) {
    await supabase.from("mayorista_productos").update({ stock_local: stockPosterior }).eq("id", mpId);
  }
  const { error: upErr } = await supabase
    .from("productos")
    .update({ stock: stockPosterior })
    .eq("id", PROD_ID);
  if (upErr) throw upErr;

  console.log(`OK: ${prod.name} — stock ${stockAnterior} -> ${stockPosterior} (+${CANTIDAD}), movimiento registrado.`);
})();
