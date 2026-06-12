// Prueba end-to-end de Realtime en pedidos: se suscribe, toca una fila y espera el evento.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const get = (k) => ((env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
const supabase = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('NEXT_PUBLIC_SUPABASE_ANON_KEY'));

(async () => {
  let recibido = false;

  const channel = supabase
    .channel('diag-pedidos')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (payload) => {
      recibido = true;
      console.log(`EVENTO RECIBIDO: ${payload.eventType} en pedido ${(payload.new || payload.old || {}).id}`);
    })
    .subscribe(async (status) => {
      console.log('Suscripción:', status);
      if (status !== 'SUBSCRIBED') return;
      // Tocar una fila real sin cambiarla de verdad: update de held a su mismo valor no dispara…
      // sí dispara: Postgres emite UPDATE aunque el valor sea igual.
      const { data, error: selErr } = await supabase.from('pedidos').select('id, held').limit(1);
      if (selErr) { console.log('Error select:', selErr.message); process.exit(1); }
      if (!data?.length) { console.log('No hay pedidos para probar'); process.exit(0); }
      console.log('Tocando pedido', data[0].id);
      const { error: updErr } = await supabase.from('pedidos').update({ held: data[0].held ?? false }).eq('id', data[0].id);
      console.log('Update:', updErr ? `ERROR ${updErr.message}` : 'OK');
    });

  setTimeout(() => {
    if (!recibido) console.log('SIN EVENTO en 10s — revisar publicación/replica identity');
    supabase.removeChannel(channel);
    process.exit(recibido ? 0 : 1);
  }, 10000);
})();
