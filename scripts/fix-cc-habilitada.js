require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SALDO_EPSILON = 0.01;
const DIAS_ATRASADO = 7;
const DIAS_MOROSO = 15;
const DIAS_INCOBRABLE = 365;
const MOROSO_MAX_DIAS_TOTAL = DIAS_MOROSO + 15; // moroso hace 15 dias como maximo => hasta dia 30 total

function diasDesde(fecha, ahora) {
  if (!fecha) return 0;
  return Math.max(0, Math.floor((ahora.getTime() - fecha.getTime()) / 86400000));
}

(async () => {
  const ahora = new Date();

  const { data: clientes, error } = await supabase
    .from("clientes")
    .select("id, name, current_balance, cuenta_corriente_habilitada");
  if (error) throw error;

  const habilitadosActualmente = clientes.filter((c) => c.cuenta_corriente_habilitada);
  const deudores = clientes.filter((c) => Number(c.current_balance) > 0).map((c) => c.id);

  const debtSinceMap = {};
  if (deudores.length > 0) {
    const { data: debts, error: e2 } = await supabase
      .from("transacciones")
      .select("client_id, date, saldo, amount")
      .in("client_id", deudores)
      .eq("type", "debt")
      .order("date", { ascending: true })
      .limit(20000);
    if (e2) throw e2;
    for (const t of debts ?? []) {
      const saldo = t.saldo != null ? Number(t.saldo) : Number(t.amount);
      if (saldo <= SALDO_EPSILON) continue;
      if (!debtSinceMap[t.client_id]) debtSinceMap[t.client_id] = new Date(t.date);
    }
  }

  // Historial real de CC: al menos una transacción `debt` (venta a crédito) alguna vez.
  // Los `payment` generados por devoluciones/saldo a favor no cuentan como historial.
  const idsHabilitados = habilitadosActualmente.map((c) => c.id);
  const conHistorialDebt = new Set();
  for (let i = 0; i < idsHabilitados.length; i += 500) {
    const batch = idsHabilitados.slice(i, i + 500);
    const { data: rows, error: e3 } = await supabase
      .from("transacciones")
      .select("client_id")
      .in("client_id", batch)
      .eq("type", "debt")
      .limit(20000);
    if (e3) throw e3;
    for (const r of rows ?? []) conHistorialDebt.add(r.client_id);
  }

  const toEnable = [];
  const toDisable = [];

  for (const c of clientes) {
    const debtSince = debtSinceMap[c.id] || null;
    const dias = diasDesde(debtSince, ahora);
    // al dia = sin deuda registrada o deuda < 15 dias (normal/atrasado)
    // moroso hasta 15 dias en ese estado = dias totales entre 15 y 30
    const cumpleDeuda = !debtSince || dias < DIAS_MOROSO || dias <= MOROSO_MAX_DIAS_TOTAL;
    const tieneHistorial = conHistorialDebt.has(c.id);
    const estaActualmenteHabilitado = !!c.cuenta_corriente_habilitada;

    const debeQuedarHabilitado = estaActualmenteHabilitado && cumpleDeuda && tieneHistorial;

    if (debeQuedarHabilitado && !estaActualmenteHabilitado) toEnable.push(c); // no deberia pasar
    if (!debeQuedarHabilitado && estaActualmenteHabilitado) toDisable.push(c);
  }

  console.log(`Total clientes: ${clientes.length}`);
  console.log(`Habilitados actualmente: ${habilitadosActualmente.length}`);
  console.log(`A deshabilitar (no cumplen criterio): ${toDisable.length}`);
  toDisable.forEach((c) => {
    const dias = diasDesde(debtSinceMap[c.id], ahora);
    const motivo = !conHistorialDebt.has(c.id) ? "sin historial de ventas a crédito" : `deuda ${dias} dias`;
    console.log(`  - ${c.name} (${c.id}) saldo=${c.current_balance} [${motivo}]`);
  });

  if (process.argv.includes("--apply")) {
    const ids = toDisable.map((c) => c.id);
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const { error: eUpd } = await supabase
        .from("clientes")
        .update({ cuenta_corriente_habilitada: false })
        .in("id", batch);
      if (eUpd) throw eUpd;
    }
    console.log(`\nAplicado: ${ids.length} clientes deshabilitados en C.C.`);
  } else {
    console.log("\n(dry-run) Ejecutar con --apply para aplicar los cambios.");
  }
})();
