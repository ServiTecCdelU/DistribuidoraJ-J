require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// % por defecto que se aplican en bloque (no son "% distinto" real, no se registran)
const PORCENTAJES_DEFAULT = [26, 35];

(async () => {
  const { data: productos, error } = await s
    .from("productos")
    .select("id, name, category, ganancia_global, created_at")
    .eq("ganancia_individual", 1)
    .gt("ganancia_global", 0);
  if (error) { console.error(error); return; }

  const { data: yaRegistrados } = await s
    .from("producto_ganancia_historial")
    .select("producto_id");
  const yaRegistradosIds = new Set((yaRegistrados ?? []).map((r) => r.producto_id));

  const aInsertar = (productos ?? [])
    .filter((p) => !PORCENTAJES_DEFAULT.includes(Number(p.ganancia_global)))
    .filter((p) => !yaRegistradosIds.has(p.id))
    .map((p) => ({
      producto_id: p.id,
      producto_nombre: p.name,
      categoria: p.category,
      ganancia_anterior: null,
      ganancia_nueva: Number(p.ganancia_global),
      created_at: p.created_at,
    }));

  if (aInsertar.length === 0) {
    console.log("Nada para insertar.");
    return;
  }

  const { error: insertError } = await s.from("producto_ganancia_historial").insert(aInsertar);
  if (insertError) { console.error(insertError); return; }
  console.log(`Insertados ${aInsertar.length} registros de historial.`);
})();
