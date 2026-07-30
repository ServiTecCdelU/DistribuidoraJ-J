// Borra UNA deuda anterior ([DEUDA_ANT]) cargada por error y devuelve el monto
// al current_balance del cliente. No borra si tiene pagos imputados o saldo tocado.
// Uso: node scripts/fix-borrar-deuda-anterior.js            (lista)
//      node scripts/fix-borrar-deuda-anterior.js <txId>     (borra)
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const txId = process.argv[2];

  const { data: deudas, error } = await supabase
    .from("transacciones")
    .select("id, client_id, amount, saldo, date, description")
    .eq("type", "debt")
    .like("description", "[DEUDA_ANT]%")
    .order("date", { ascending: false });
  if (error) throw error;

  if (!txId) {
    console.log("DEUDAS ANTERIORES cargadas:");
    for (const d of deudas || []) {
      console.log(
        `  ${d.id} | ${new Date(d.date).toLocaleDateString("es-AR")} | $${d.amount} | saldo $${d.saldo} | ${d.client_id} | ${d.description}`
      );
    }
    console.log("\nPara borrar: node scripts/fix-borrar-deuda-anterior.js <txId>");
    return;
  }

  const deuda = (deudas || []).find((d) => d.id === txId);
  if (!deuda) return console.log("No se encontró esa deuda anterior:", txId);

  const { data: pagos } = await supabase
    .from("transacciones")
    .select("id")
    .eq("debt_id", txId);
  if (pagos && pagos.length > 0) {
    return console.log(`ABORTADO: la deuda tiene ${pagos.length} pago(s) imputado(s).`);
  }
  if (Number(deuda.saldo) !== Number(deuda.amount)) {
    return console.log(
      `ABORTADO: el saldo ($${deuda.saldo}) no coincide con el monto ($${deuda.amount}) — ya se pagó algo.`
    );
  }

  const { data: cli } = await supabase
    .from("clientes")
    .select("name, current_balance")
    .eq("id", deuda.client_id)
    .single();

  const nuevoBalance = Number(cli.current_balance || 0) - Number(deuda.amount);
  const { error: delErr } = await supabase.from("transacciones").delete().eq("id", txId);
  if (delErr) throw delErr;
  await supabase.from("clientes").update({ current_balance: nuevoBalance }).eq("id", deuda.client_id);

  console.log(
    `BORRADA ${txId} — ${cli.name}: balance ${cli.current_balance} → ${nuevoBalance}`
  );
})();
