// Backfill LEGACY: ventas viejas que solo tienen la transacción [NO_QUIERE] (sin
// items_no_entregados con motivo no_quiso). Reconstruye los items_no_entregados
// (parseando "nombre xN" del [NO_QUIERE] + precio del pedido/productos) y crea la
// transacción [RECHAZO] (monto 0) para que figure el movimiento y el recibo.
// Idempotente.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes("--apply");

const parseItems = (desc) => {
  const stripped = desc.replace(/^\[NO_QUIERE\]\s*#[\w-]+\s*—\s*/, "").replace(/^\[NO_QUIERE\]\s*/, "");
  const out = [];
  for (const part of stripped.split(", ")) {
    const m = part.match(/^(.*)\sx(\d+)$/);
    if (m) out.push({ name: m[1].trim(), quantity: parseInt(m[2], 10) });
  }
  return out;
};

(async () => {
  const { data: txs } = await supabase
    .from("transacciones")
    .select("sale_id, description")
    .like("description", "[NO_QUIERE]%");
  const descBySale = new Map();
  for (const t of txs || []) if (t.sale_id) descBySale.set(t.sale_id, t.description);

  const ids = [...descBySale.keys()];
  const { data: ventas } = await supabase
    .from("ventas")
    .select("id, created_at, client_id, client_name, remito_number, sale_number, items, items_no_entregados")
    .in("id", ids);

  let reconstruidos = 0, saltados = 0, sinPrecio = 0;
  for (const v of ventas || []) {
    const yaTiene = (v.items_no_entregados || []).some((it) => it.motivo !== "rotura" && it.motivo !== "faltante");
    if (yaTiene) { saltados++; continue; }

    const parsed = parseItems(descBySale.get(v.id) || "");
    if (parsed.length === 0) { saltados++; continue; }

    // Precio: venta.items → pedidos(sale_id).items → productos por nombre
    const priceByName = new Map();
    for (const it of v.items || []) priceByName.set(it.name, { price: it.price, itemDiscount: it.itemDiscount });

    let faltan = parsed.filter((p) => !priceByName.has(p.name)).map((p) => p.name);
    if (faltan.length > 0) {
      const { data: peds } = await supabase.from("pedidos").select("items").eq("sale_id", v.id);
      for (const ped of peds || []) {
        for (const it of ped.items || []) {
          const n = it.name ?? it.product?.name;
          const pr = it.price ?? it.product?.price;
          if (n && faltan.includes(n) && !priceByName.has(n)) priceByName.set(n, { price: pr, itemDiscount: it.itemDiscount });
        }
      }
      faltan = parsed.filter((p) => !priceByName.has(p.name)).map((p) => p.name);
    }
    if (faltan.length > 0) {
      const { data: prods } = await supabase.from("productos").select("name, price").in("name", faltan);
      for (const p of prods || []) if (!priceByName.has(p.name)) priceByName.set(p.name, { price: p.price });
    }

    const nuevos = parsed.map((p) => {
      const pi = priceByName.get(p.name) || {};
      return { name: p.name, quantity: p.quantity, price: pi.price ?? 0, itemDiscount: pi.itemDiscount, motivo: "no_quiso" };
    });
    if (nuevos.some((n) => !n.price)) sinPrecio++;

    const merged = [...(v.items_no_entregados || []), ...nuevos];
    const reciboNumero = `DEV-${v.remito_number || v.sale_number || v.id}`;
    const detalle = parsed.map((p) => `${p.name} x${p.quantity}`).join(", ");

    console.log(`${APPLY ? "FIX" : "DRY"}  ${v.client_name}  ${detalle}  ${nuevos.some(n=>!n.price) ? "(⚠ sin precio)" : ""}`);

    if (APPLY) {
      await supabase.from("ventas").update({ items_no_entregados: merged }).eq("id", v.id);
      if (v.client_id) {
        const { data: existe } = await supabase.from("transacciones").select("id").eq("sale_id", v.id).like("description", "[RECHAZO]%");
        if ((existe || []).length === 0) {
          await supabase.from("transacciones").insert({
            id: `no_quiere_${v.id}_backfill`,
            client_id: v.client_id,
            type: "payment",
            amount: 0,
            description: `[RECHAZO] ${reciboNumero} — ${detalle}`,
            sale_id: v.id,
            date: v.created_at,
            cuenta: "minorista",
          });
        }
      }
    }
    reconstruidos++;
  }

  console.log(`\nReconstruidos: ${reconstruidos}  |  Saltados: ${saltados}  |  Con algún ítem sin precio: ${sinPrecio}`);
  if (!APPLY) console.log("Corré con --apply para aplicar.");
})();
