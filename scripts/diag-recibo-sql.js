// Verifica qué parte del SQL de recibos/día de cobro quedó aplicada
const fs = require('fs');
const path = require('path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const get = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const URL = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

(async () => {
  // 1. Columna dia_cobro
  const r1 = await fetch(`${URL}/rest/v1/clientes?select=id,dia_cobro&limit=1`, { headers: H });
  const b1 = await r1.json();
  console.log('dia_cobro:', r1.ok ? 'OK existe' : JSON.stringify(b1));

  // 2. Función next_recibo_number
  const r2 = await fetch(`${URL}/rest/v1/rpc/next_recibo_number`, { method: 'POST', headers: H, body: '{}' });
  const b2 = await r2.text();
  console.log('next_recibo_number:', r2.ok ? `OK → ${b2}` : b2);
})();
