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

const BUCKET = 'hojas-ruta'

export interface HojaRuta {
  id: string
  numero: string
  fechaReparto: string
  storagePath: string
  url: string
  total: number
  cantidadPedidos: number
  cantidadClientes: number
  vendedores: string[]
  pedidoIds: string[]
  createdAt: Date
}

function mapHojaRuta(d: any): HojaRuta {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(d.storage_path)
  return {
    id: d.id,
    numero: d.numero,
    fechaReparto: d.fecha_reparto,
    storagePath: d.storage_path,
    url: data.publicUrl,
    total: Number(d.total) || 0,
    cantidadPedidos: d.cantidad_pedidos || 0,
    cantidadClientes: d.cantidad_clientes || 0,
    vendedores: d.vendedores || [],
    pedidoIds: d.pedido_ids || [],
    createdAt: new Date(d.created_at),
  }
}

// Guarda el HTML de la hoja de ruta en Storage y registra la metadata.
// Reimprimir la misma hoja (mismo N°) pisa el archivo y actualiza el registro.
export async function saveHojaRuta(params: {
  numero: string
  html: string
  fechaReparto: Date
  total: number
  pedidoIds: string[]
  cantidadClientes: number
  vendedores: string[]
  fingerprint?: string
}): Promise<HojaRuta> {
  const storagePath = `hoja-ruta-${params.numero}.html`
  const blob = new Blob([params.html], { type: 'text/html; charset=utf-8' })

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, { upsert: true, contentType: 'text/html; charset=utf-8' })
  if (uploadError) throw new Error(`Error subiendo hoja de ruta: ${uploadError.message}`)

  const fecha = params.fechaReparto
  const fechaReparto = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`

  const row = {
    id: `hr_${params.numero}`,
    numero: params.numero,
    fecha_reparto: fechaReparto,
    storage_path: storagePath,
    total: params.total,
    cantidad_pedidos: params.pedidoIds.length,
    cantidad_clientes: params.cantidadClientes,
    vendedores: params.vendedores,
    pedido_ids: params.pedidoIds,
    fingerprint: params.fingerprint || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('hojas_ruta')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw new Error(`Error guardando hoja de ruta: ${error.message}`)

  return mapHojaRuta(data)
}

export async function getHojasRuta(): Promise<HojaRuta[]> {
  const { data, error } = await supabase
    .from('hojas_ruta')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Error cargando hojas de ruta: ${error.message}`)
  return (data || []).map(mapHojaRuta)
}

export async function getHojaRutaHtml(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath)
  if (error || !data) throw new Error(`Error descargando hoja de ruta: ${error?.message || 'sin datos'}`)
  return await data.text()
}
