import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/api-validation'

export const runtime = 'nodejs'

const movimientoSchema = z.object({
  tipo: z.string().min(1, 'tipo requerido'),
  cantidad: z.number(),
  stockAnterior: z.number(),
  stockPosterior: z.number(),
  motivo: z.string().nullish(),
  usuarioId: z.string().nullish(),
  usuarioNombre: z.string().nullish(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const productId = params.id
  const mayoristId = productId.replace(/^prod_/, '')

  const parsed = await parseJsonBody(req, movimientoSchema)
  if (!parsed.ok) return parsed.response
  const { tipo, cantidad, stockAnterior, stockPosterior, motivo, usuarioId, usuarioNombre } = parsed.data

  const { error } = await supabaseAdmin.from('stock_movimientos').insert({
    mayorista_producto_id: mayoristId,
    tipo,
    cantidad,
    stock_anterior: stockAnterior,
    stock_posterior: stockPosterior,
    motivo: motivo ?? null,
    usuario_id: usuarioId ?? null,
    usuario_nombre: usuarioNombre ?? null,
  })

  if (error) {
    console.error('[stock-movimiento] insert error:', error.message)
    return NextResponse.json({ error: 'No se pudo registrar el movimiento' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
