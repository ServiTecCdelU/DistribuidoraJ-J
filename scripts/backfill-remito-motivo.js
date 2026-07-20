require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes("--apply") === false;

async function fetchAllMovimientos() {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await s
      .from("stock_movimientos")
      .select("id, motivo, created_at, cantidad")
      .eq("tipo", "apertura_bulto")
      .eq("motivo", "Ingreso por remito proveedor")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

(async () => {
  const movs = await fetchAllMovimientos();
  console.log(`Movimientos a corregir: ${movs.length}`);

  const { data: deudas, error: e2 } = await s
    .from("transacciones_mayorista")
    .select("id, description, date, distribucion")
    .eq("type", "debt")
    .ilike("description", "Boleta %")
    .order("date", { ascending: true });
  if (e2) throw e2;

  const deudasParsed = deudas
    .map((d) => {
      const m = d.description.match(/^Boleta\s+([\d-]+)/);
      return m ? { nro: m[1], distribucion: d.distribucion, dateMs: new Date(d.date).getTime() } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.dateMs - b.dateMs);

  let matched = 0;
  let unmatched = 0;
  const updates = [];

  for (const mov of movs) {
    const movMs = new Date(mov.created_at).getTime();
    // La deuda de cada importación se registra al final del lote, después de crear
    // todos sus movimientos de stock. La primera deuda posterior al movimiento es la suya.
    const deuda = deudasParsed.find((d) => d.dateMs >= movMs);
    if (!deuda) {
      unmatched++;
      continue;
    }
    matched++;
    const referencia = `Ingreso por boleta de proveedor ${deuda.nro} (JYJDISTRIBUCIONES${deuda.distribucion})`;
    updates.push({ id: mov.id, referencia });
  }

  console.log(`Matcheados: ${matched} / Sin match: ${unmatched}`);
  console.log("Ejemplo:", updates.slice(0, 3));

  if (DRY_RUN) {
    console.log("\nDRY RUN — no se actualizó nada. Ejecutar con --apply para aplicar.");
    return;
  }

  let done = 0;
  for (const u of updates) {
    const { error } = await s.from("stock_movimientos").update({ motivo: u.referencia }).eq("id", u.id);
    if (error) {
      console.error(`Error actualizando id=${u.id}:`, error.message);
      continue;
    }
    done++;
  }
  console.log(`Actualizados: ${done}/${updates.length}`);
})();
