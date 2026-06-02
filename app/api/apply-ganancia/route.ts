import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, { roles: ['admin'] })
    if (!auth.ok) return auth.response

    const { porcentaje, scope } = await req.json()
    if (typeof porcentaje !== 'number' || porcentaje < 0) {
      return NextResponse.json({ error: 'Porcentaje inválido' }, { status: 400 })
    }

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
