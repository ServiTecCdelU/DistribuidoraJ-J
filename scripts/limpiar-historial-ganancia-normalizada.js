require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const esMedicamento = (categoria) => (categoria ?? "").trim().toLowerCase().includes("medicamento");

(async () => {
  const [{ data: gananciaRes }, { data: gananciaMedRes }] = await Promise.all([
    s.from("productos").select("ganancia_global").or("disabled.eq.false,disabled.is.null").gt("ganancia_global", 0).limit(1),
    s.from("productos").select("ganancia_global").ilike("category", "%medicamento%").gt("ganancia_global", 0).limit(1),
  ]);
  const gananciaActual = gananciaRes?.[0]?.ganancia_global != null ? Number(gananciaRes[0].ganancia_global) : null;
  const gananciaMedicamentos = gananciaMedRes?.[0]?.ganancia_global != null ? Number(gananciaMedRes[0].ganancia_global) : null;
  console.log("Normalizado global:", gananciaActual, "| medicamentos:", gananciaMedicamentos);

  const { data: historial, error } = await s.from("producto_ganancia_historial").select("id, categoria, ganancia_nueva");
  if (error) { console.error(error); return; }

  const aBorrar = (historial ?? [])
    .filter((h) => {
      const normalizado = esMedicamento(h.categoria) ? gananciaMedicamentos : gananciaActual;
      return normalizado != null && Number(normalizado) === Number(h.ganancia_nueva);
    })
    .map((h) => h.id);

  if (aBorrar.length === 0) {
    console.log("Nada para borrar.");
    return;
  }

  const { error: delError } = await s.from("producto_ganancia_historial").delete().in("id", aBorrar);
  if (delError) { console.error(delError); return; }
  console.log(`Borrados ${aBorrar.length} registros que coincidían con el % normalizado vigente.`);
})();
