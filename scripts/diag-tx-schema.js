// Diagnóstico: columnas de transacciones y ejemplo de movimientos de un cliente
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const get = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const URL = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

(async () => {
  // Una fila de cada tipo para ver columnas
  const r = await fetch(`${URL}/rest/v1/transacciones?select=*&limit=2&order=date.desc`, { headers: H });
  const rows = await r.json();
  console.log('Columnas:', rows[0] ? Object.keys(rows[0]).join(', ') : 'sin filas');
  console.log(JSON.stringify(rows, null, 2).slice(0, 1500));

  // Tipos de transaccion existentes
  const r2 = await fetch(`${URL}/rest/v1/transacciones?select=type&limit=1000`, { headers: H });
  const tipos = [...new Set((await r2.json()).map((x) => x.type))];
  console.log('Tipos:', tipos);
})();
