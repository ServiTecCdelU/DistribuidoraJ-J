// Cierra la caja vieja (caja_20260604_2) con su esperado y abre la caja de hoy 06-05 (06:00, inicial 0).
// El cierre de hoy a las 23:00 lo hace solo reconciliarCajaHorario al cargar la pagina.
const fs = require('fs');
const path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').split('\n').forEach((l) => {
  const m = l.match(/^([^#=]+)=["']?([^"'\r]*)["']?/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const VIEJA = 'caja_20260604_2';

const agg = (src) => {
  let efectivo = 0, transfer = 0, credito = 0, total = 0;
  for (const s of src) {
    total += Number(s.total) || 0;
    const method = s.payment_method || 'efectivo';
    if (s.payment_type === 'cash') {
      if (method === 'transferencia') transfer += Number(s.total) || 0; else efectivo += Number(s.total) || 0;
    } else if (s.payment_type === 'credit') {
      credito += Number(s.total) || 0;
    } else if (s.payment_type === 'mixed') {
      const cashAmt = Number(s.cash_amount) || 0;
      const ef = s.efectivo_amount != null ? Number(s.efectivo_amount) : (method !== 'transferencia' ? cashAmt : 0);
      const tr = s.transferencia_amount != null ? Number(s.transferencia_amount) : (method === 'transferencia' ? cashAmt : 0);
      efectivo += ef; transfer += tr; credito += Number(s.credit_amount) || 0;
    }
  }
  return { efectivo, transfer, credito, total, count: src.length };
};

(async () => {
  // --- Cerrar la vieja ---
  const rv = await fetch(`${BASE}/rest/v1/caja?id=eq.${VIEJA}&select=*`, { headers: H });
  const vieja = (await rv.json())[0];
  if (vieja && vieja.status === 'open') {
    const ap = new Date(vieja.opened_at);
    const diaReg = new Date(ap); diaReg.setHours(0, 0, 0, 0);
    const cierre = new Date(diaReg); cierre.setHours(23, 0, 0, 0);
    const rs = await fetch(`${BASE}/rest/v1/ventas?created_at=gte.${ap.toISOString()}&created_at=lte.${cierre.toISOString()}&remito_number=not.is.null&select=total,payment_type,payment_method,efectivo_amount,transferencia_amount,cash_amount,credit_amount`, { headers: H });
    const ventas = await rs.json();
    const st = agg(Array.isArray(ventas) ? ventas : []);
    const rc = await fetch(`${BASE}/rest/v1/pagos_comisiones?created_at=gte.${ap.toISOString()}&created_at=lte.${cierre.toISOString()}&select=monto`, { headers: H });
    const pagos = await rc.json();
    const comis = (Array.isArray(pagos) ? pagos : []).reduce((a, p) => a + (Number(p.monto) || 0), 0);
    const esperado = (vieja.initial_amount || 0) + st.efectivo - comis;
    const up = await fetch(`${BASE}/rest/v1/caja?id=eq.${VIEJA}&status=eq.open`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        closed_at: cierre.toISOString(), closed_by: 'Cierre automático', final_amount: esperado,
        expected_amount: esperado, difference: 0, status: 'closed', notes: 'Cierre automático 23:00',
        sales_count: st.count, total_sales: st.total, cash_total: st.efectivo, credit_total: st.credito, transfer_total: st.transfer,
      }),
    });
    console.log(`Cerrada ${VIEJA} -> ${up.status} | esperado=${esperado.toFixed(2)} | ventas=${st.count} efectivo=${st.efectivo.toFixed(2)} comis=${comis.toFixed(2)}`);
  } else {
    console.log(`${VIEJA} ya no esta abierta, no se cierra`);
  }

  // --- Abrir la de hoy ---
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const apertura = new Date(hoy); apertura.setHours(6, 0, 0, 0);
  const dateStr = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`;
  // ¿ya hay una de hoy abierta?
  const re = await fetch(`${BASE}/rest/v1/caja?status=eq.open&opened_at=gte.${hoy.toISOString()}&select=id&limit=1`, { headers: H });
  const exist = await re.json();
  if (Array.isArray(exist) && exist.length) {
    console.log(`Ya existe caja de hoy abierta: ${exist[0].id}`);
    return;
  }
  // siguiente N para el id
  const rn = await fetch(`${BASE}/rest/v1/caja?id=like.caja_${dateStr}_*&select=id`, { headers: H });
  const prev = await rn.json();
  const n = (Array.isArray(prev) ? prev.length : 0) + 1;
  const id = `caja_${dateStr}_${n}`;
  const ins = await fetch(`${BASE}/rest/v1/caja`, {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ id, opened_at: apertura.toISOString(), opened_by: 'Apertura automática', initial_amount: 0, status: 'open' }),
  });
  console.log(`Abierta ${id} (06:00) -> ${ins.status}`);
})();
