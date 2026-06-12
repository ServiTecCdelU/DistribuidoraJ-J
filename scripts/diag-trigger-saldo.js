// Prueba del trigger set_debt_saldo: inserta deuda de prueba, lee saldo, borra.
const fs = require('fs');
const path = require('path');
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const get = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const URL = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

(async () => {
  const id = `test_trigger_saldo_${Date.now()}`;
  const r = await fetch(`${URL}/rest/v1/transacciones`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ id, client_id: null, type: 'debt', amount: 123.45, description: '[TEST trigger saldo]', date: new Date().toISOString() }),
  });
  const body = await r.json();
  const row = Array.isArray(body) ? body[0] : null;
  console.log('Insert saldo =', row ? row.saldo : JSON.stringify(body));
  await fetch(`${URL}/rest/v1/transacciones?id=eq.${id}`, { method: 'DELETE', headers: H });
  console.log('Fila de prueba borrada');
})();
