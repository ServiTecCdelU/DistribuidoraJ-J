import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/api-auth'
import { parseJsonBody } from '@/lib/api-validation'

const gananciaSchema = z.object({
  porcentaje: z.number().min(0, 'Porcentaje inválido'),
  scope: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, { roles: ['admin'] })
    if (!auth.ok) return auth.response

    const parsed = await parseJsonBody(req, gananciaSchema)
    if (!parsed.ok) return parsed.response
    const { porcentaje, scope } = parsed.data

    const rpcName = scope === 'medicamentos' ? 'apply_ganancia_medicamentos' : 'apply_ganancia_global'
    const { data, error } = await supabaseAdmin.rpc(rpcName, {
      p_porcentaje: porcentaje,
    })

    if (error) throw error

    return NextResponse.json({ updated: data ?? 0 })
  } catch (err: any) {
    console.error('[apply-ganancia]', err)
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 })
  }
}
