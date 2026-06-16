// services/hoja-ruta-service.ts
import { supabase } from '@/lib/supabase'

const CONFIG_KEY = 'hoja_ruta'

interface HojaRutaState {
  last?: number
  hash?: string
}

function formatNumero(n: number): string {
  return String(n).padStart(3, '0')
}

async function readState(): Promise<HojaRutaState> {
  const { data } = await supabase
    .from('configuracion')
    .select('value')
    .eq('key', CONFIG_KEY)
    .maybeSingle()
  return (data?.value as HojaRutaState | null) || {}
}

// Asigna el N° de hoja de ruta según el contenido (fingerprint):
// - Si el contenido es idéntico al de la última hoja emitida, devuelve el MISMO número.
// - Si cambió (otra persona, otro remito, otro importe), incrementa en 1.
// Empieza en 1 ("001").
export async function assignHojaRuta(fingerprint: string): Promise<string> {
  const state = await readState()
  const last = typeof state.last === 'number' ? state.last : 0

  if (last > 0 && state.hash === fingerprint) {
    return formatNumero(last)
  }

  const next = last + 1
  await supabase
    .from('configuracion')
    .upsert({ key: CONFIG_KEY, value: { last: next, hash: fingerprint } }, { onConflict: 'key' })
  return formatNumero(next)
}
