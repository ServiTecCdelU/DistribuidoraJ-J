/**
 * Chequeo de salud de los datos.
 *
 *   npm run health
 *
 * Corre los seis detectores de `lib/utils/health-checks.ts` contra la base y arma un
 * reporte. Sale con código 1 si encuentra algo, así sirve para CI o para un cron.
 *
 * Solo lee: no modifica nada.
 *
 * Nació de la investigación del remito R-2026-01782, donde se cobraron $20.758,70 que no
 * figuraban en el detalle de la venta y nadie se enteró durante dos días.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import {
  ventasDescuadradas,
  ventasConCobroDistinto,
  pedidosConItemsDuplicados,
  ventasCreditConMontoCobrado,
  cajasDuplicadas,
  cajasDesactualizadas,
} from '../lib/utils/health-checks'
import { paginarTodo } from '../lib/utils/paginar'

config({ path: '.env', quiet: true } as any)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
  process.exit(2)
}

const db = createClient(url, key)

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

const CHECK = '✓'
const CROSS = '✗'

const WARN = '!'

let problemas = 0
let avisos = 0

/**
 * `severidad: 'aviso'` para lo que puede ser legítimo y solo se informa: no cuenta como
 * problema ni hace fallar el chequeo.
 */
function reportar(
  titulo: string,
  hallazgos: unknown[],
  detalle: (h: any) => string,
  severidad: 'problema' | 'aviso' = 'problema',
) {
  if (hallazgos.length === 0) {
    console.log(`  ${CHECK} ${titulo}`)
    return
  }
  const marca = severidad === 'aviso' ? WARN : CROSS
  if (severidad === 'aviso') avisos += hallazgos.length
  else problemas += hallazgos.length
  console.log(`  ${marca} ${titulo} — ${hallazgos.length} caso${hallazgos.length === 1 ? '' : 's'}`)
  for (const h of hallazgos.slice(0, 10)) console.log(`      ${detalle(h)}`)
  if (hallazgos.length > 10) console.log(`      … y ${hallazgos.length - 10} más`)
}

async function main() {
  console.log('\nChequeo de salud de datos\n' + '─'.repeat(60))

  // Paginado en todo: PostgREST corta en 1000 filas sin avisar.
  const ventas = await paginarTodo<any>((desde, hasta) =>
    db.from('ventas')
      .select('id, sale_number, client_name, total, items, payment_type, payment_method, cash_amount, credit_amount, efectivo_amount, transferencia_amount, created_at, remito_number')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(desde, hasta),
  )

  const pedidos = await paginarTodo<any>((desde, hasta) =>
    db.from('pedidos')
      .select('id, remito_number, client_name, items, status')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(desde, hasta),
  )

  const cajas = await paginarTodo<any>((desde, hasta) =>
    db.from('caja')
      .select('id, opened_at, status, cash_total, transfer_total, credit_total, total_sales')
      .order('opened_at', { ascending: false })
      .order('id', { ascending: true })
      .range(desde, hasta),
  )

  console.log(`Analizando ${ventas.length} ventas, ${pedidos.length} pedidos, ${cajas.length} cajas\n`)

  // Solo las ventas con remito suman a la caja.
  const ventasConRemito = ventas.filter((v) => v.remito_number != null)

  reportar(
    'Ventas donde la suma de los items coincide con el total',
    ventasDescuadradas(ventas),
    (h) => `${h.saleNumber ?? h.id}: items ${money(h.sumaItems)} vs total ${money(h.total)} (${money(h.diferencia)})`,
  )

  // Entró menos de lo facturado: siempre es un problema.
  const cobros = ventasConCobroDistinto(ventas)
  reportar(
    'Ventas donde no falta plata respecto de lo facturado',
    cobros.filter((c) => c.tipo === 'falta'),
    (h) => `${h.saleNumber ?? h.id} (${h.clientName ?? '—'}): cobrado ${money(h.cobrado)} vs total ${money(h.total)} (faltan ${money(Math.abs(h.diferencia))})`,
  )

  // Entró de más: puede ser pago de deuda anterior o redondeo, pero también es la firma
  // del bug del remito R-2026-01782. Se informa sin marcarlo como error.
  reportar(
    'Ventas sin cobros por encima del total',
    cobros.filter((c) => c.tipo === 'excedente'),
    (h) => `${h.saleNumber ?? h.id} (${h.clientName ?? '—'}): cobrado ${money(h.cobrado)} vs total ${money(h.total)} (+${money(h.diferencia)})`,
    'aviso',
  )

  reportar(
    'Pedidos sin el mismo producto repetido en dos renglones',
    pedidosConItemsDuplicados(pedidos),
    (h) => `${h.remitoNumber ?? h.id} (${h.clientName ?? 'sin cliente'}): ` +
      h.duplicados.map((d: any) => `${d.name} en ${d.renglones} renglones = ${d.unidades} u`).join(', '),
  )

  reportar(
    'Ventas a cuenta corriente sin montos cobrados colgados',
    ventasCreditConMontoCobrado(ventas),
    (h) => `${h.saleNumber ?? h.id} (${h.clientName ?? '—'}): ` +
      [h.efectivo != null ? `efectivo ${money(h.efectivo)}` : null,
       h.transferencia != null ? `transferencia ${money(h.transferencia)}` : null]
        .filter(Boolean).join(' · '),
  )

  reportar(
    'Un solo registro de caja por día',
    cajasDuplicadas(cajas),
    (h) => `${h.dia}: ${h.ids.join(', ')}`,
  )

  reportar(
    'Cajas cerradas al día con sus ventas',
    cajasDesactualizadas(cajas, ventasConRemito),
    (h) => `${h.id}: efectivo ${money(h.efectivo.guardado)}→${money(h.efectivo.real)} · ` +
      `transferencia ${money(h.transferencia.guardado)}→${money(h.transferencia.real)} · ` +
      `crédito ${money(h.credito.guardado)}→${money(h.credito.real)}`,
  )

  console.log('─'.repeat(60))
  const resumenAvisos = avisos > 0 ? `  ·  ${WARN} ${avisos} para mirar` : ''
  if (problemas === 0) {
    console.log(`${CHECK} Sin inconsistencias${resumenAvisos}\n`)
    process.exit(0)
  }
  console.log(`${CROSS} ${problemas} inconsistencia${problemas === 1 ? '' : 's'}${resumenAvisos}\n`)
  process.exit(1)
}

main().catch((e) => {
  console.error('\nError ejecutando el chequeo:', e?.message ?? e)
  process.exit(2)
})
