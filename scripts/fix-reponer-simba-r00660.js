require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PROD_ID = "prod_mp_0215912"; // AGUA X 6.5L SIMBA (código 0215912)
const MP_ID = "mp_0215912";
const STOCK_CORRECTO = 8;
const MOTIVO = "Corrección: venta R-2026-00663 quedó frenada en 0 (stock insuficiente por remito R-2026-00660 fantasma ya eliminado)";

(async () => {
  const { data: prod } = await supabase
    .from("productos")
    .select("id, name, stock")
    .eq("id", PROD_ID)
    .maybeSingle();
  if (!prod) return console.log("No existe", PROD_ID);

  const stockAnterior = Number(prod.stock) || 0;
  const cantidad = STOCK_CORRECTO - stockAnterior; // -118
  if (cantidad === 0) return console.log("Ya está en", STOCK_CORRECTO, "— nada que hacer.");

  const { error: movErr } = await supabase.from("stock_movimientos").insert({
    mayorista_producto_id: MP_ID,
    tipo: "ajuste",
    cantidad,
    stock_anterior: stockAnterior,
    stock_posterior: STOCK_CORRECTO,
    motivo: MOTIVO,
  });
  if (movErr) throw movErr;

  await supabase.from("mayorista_productos").update({ stock_local: STOCK_CORRECTO }).eq("id", MP_ID);
  await supabase.from("productos").update({ stock: STOCK_CORRECTO }).eq("id", PROD_ID);

  console.log(`OK: ${prod.name} — stock ${stockAnterior} -> ${STOCK_CORRECTO} (${cantidad}), corrección registrada.`);
})();
