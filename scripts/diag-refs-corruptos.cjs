// Solo lectura: cuenta referencias de los clientes corruptos en cada tabla
// candidata, para saber qué hay que reapuntar antes de borrarlos.
const fs = require('fs');
const path = require('path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const g = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const U = g('NEXT_PUBLIC_SUPABASE_URL'), K = g('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: K, Authorization: `Bearer ${K}` };

const corruptos = [
  'cliente_cabaadiana_1', 'cliente_montaanaaldo_1', 'cliente_doachola_1',
  'cliente_granjadoachola2_1', 'cliente_mioyolanda_1', 'cliente_doaelbanuevo_1',
];
const tablas = ['ventas', 'transacciones', 'pedidos', 'comisiones', 'pedidos_mayorista', 'cobranzas', 'caja', 'auditoria'];

(async () => {
  for (const t of tablas) {
    let total = 0, exists = true, detalle = [];
    for (const c of corruptos) {
      const r = await fetch(`${U}/rest/v1/${t}?client_id=eq.${c}&select=id`, {
        method: 'HEAD', headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
      });
      if (r.status >= 400) { exists = false; break; }
      const n = Number((r.headers.get('content-range') || '*/0').split('/')[1]) || 0;
      if (n) detalle.push(`${c}=${n}`);
      total += n;
    }
    console.log(t.padEnd(20), exists
      ? `client_id OK  filas_corruptas=${total}${detalle.length ? '  [' + detalle.join(', ') + ']' : ''}`
      : '(sin columna client_id)');
  }
})();
