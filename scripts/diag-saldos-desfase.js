require("dotenv").config({ path: ".env", quiet: true });
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function all(table, sel) {
  let out = [], from = 0;
  for (;;) { const { data, error } = await sb.from(table).select(sel).range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; from += 1000; }
  return out;
}
(async () => {
  const cls = await all("clientes", "id,name,current_balance");
  const txs = await all("transacciones", "client_id,type,amount,cuenta,anulado,afecta_saldo,date,description");
  const led = new Map(), last = new Map();
  for (const t of txs) {
    if ((t.cuenta ?? "minorista") !== "minorista" || t.anulado || t.afecta_saldo === false) continue;
    led.set(t.client_id, (led.get(t.client_id) || 0) + (t.type === "debt" ? 1 : -1) * Number(t.amount));
    if (!last.has(t.client_id) || t.date > last.get(t.client_id).date) last.set(t.client_id, t);
  }
  const bad = cls.map(c => ({ c, l: led.get(c.id) || 0, d: Number(c.current_balance || 0) - (led.get(c.id) || 0) })).filter(x => Math.abs(x.d) >= 1).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d));
  console.log("Clientes con desfase:", bad.length);
  for (const x of bad) { const lt = last.get(x.c.id); console.log(x.c.name.padEnd(35), "bal=", Number(x.c.current_balance).toFixed(2), "ledger=", x.l.toFixed(2), "dif=", x.d.toFixed(2), "| ult:", lt ? String(lt.date).slice(0,10)+" "+lt.type+" "+lt.amount+" "+(lt.description||"").slice(0,40) : "-"); }
})();
