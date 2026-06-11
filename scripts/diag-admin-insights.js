// Verificación rápida de columnas/queries usadas por admin-insights-service
const fs = require('fs')
const path = require('path')
const env = {}
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8').split('\n').forEach((l) => {
  const m = l.match(/^([^#=]+)=["']?([^"'\r]*)["']?/)
  if (m) env[m[1].trim()] = m[2].trim()
})
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  const checks = [
    ['clientes', 'id, name, phone, seller_id, current_balance, debt_classification'],
    ['transacciones', 'client_id, type, amount, date, cuenta'],
    ['ventas', 'client_id, client_name, items, total, payment_type, payment_method, cash_amount, credit_amount, remito_number, created_at'],
    ['productos', 'id, codigo, name, category, stock, unidades_por_bulto, disabled, price, precio_venta, precio_base, ganancia_global'],
    ['mayorista_productos', 'producto_id, precio_lista'],
    ['vendedores', 'id, name'],
    ['comprobantes_pago', 'id, status'],
  ]
  for (const [tabla, cols] of checks) {
    const { error } = await supabase.from(tabla).select(cols).limit(1)
    console.log(tabla.padEnd(22), error ? `ERROR: ${error.message}` : 'OK')
  }
}
main()
