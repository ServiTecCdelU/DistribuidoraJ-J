/**
 * Script para importar cuentas corrientes desde los Excel de vendedores.
 * Extrae: cliente, fecha emisión, saldo (deuda), vendedor asignado.
 *
 * Uso: node scripts/importar-ctas-ctes.cjs
 *
 * Genera: scripts/output-ctas-ctes.json con los datos listos para importar.
 */

const XLSX = require('xlsx')
const path = require('path')
const fs = require('fs')

const FILES = [
  { file: 'CTA CTE NICOLAS (1).xls', vendedor: 'SALDIVIA NICOLAS' },
  { file: 'CTAS CTES LUCAS.xls', vendedor: 'LUCAS BENITEZ' },
  { file: 'CTA CTE ADRIAN.xls', vendedor: 'GANGE ADRIAN' },
]

function parseNumber(val) {
  if (!val) return 0
  // Formato: "166,787.41" o "(43,524.91)" para negativos
  const str = String(val).trim()
  const isNeg = str.startsWith('(') && str.endsWith(')')
  const clean = str.replace(/[()$,]/g, '').trim()
  const num = parseFloat(clean)
  if (isNaN(num)) return 0
  return isNeg ? -num : num
}

function parseDate(val) {
  if (!val) return null
  const num = Number(val)
  if (!isNaN(num) && num > 40000) {
    // Excel serial date → JS date
    const date = new Date((num - 25569) * 86400 * 1000)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const str = String(val).trim()
  const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) return null
  const [, day, month, year] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function processFile(filePath, vendedor) {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  // Buscar fila de datos (empiezan después del header "Vendedor:")
  let dataStart = -1
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row && String(row[1] || '').includes('Vendedor:')) {
      dataStart = i + 1
      break
    }
  }

  if (dataStart === -1) {
    console.error(`No se encontró inicio de datos en ${filePath}`)
    return []
  }

  // Mapeo de columnas (verificado con debug):
  // Col 0: código cliente
  // Col 3: nombre cliente
  // Col 8: fecha emisión (serial Excel)
  // Col 36: total comprobante
  // Col 40: saldo
  // Col 43: acumulado cliente

  const clientDebt = {} // { clientName: { lastAcumulado, transactions: [...] } }

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[3]) continue // Skip empty rows

    const clientName = String(row[3]).trim()
    if (!clientName || clientName === 'Cliente') continue

    const fechaEmision = parseDate(row[8])
    const saldo = parseNumber(row[40])
    const acumulado = parseNumber(row[43])

    if (!clientDebt[clientName]) {
      clientDebt[clientName] = { transactions: [], lastAcumulado: 0 }
    }

    clientDebt[clientName].transactions.push({
      fecha: fechaEmision,
      saldo,
    })
    clientDebt[clientName].lastAcumulado = acumulado
  }

  // Generar resultado: último acumulado es la deuda total actual del cliente
  const results = []
  for (const [clientName, data] of Object.entries(clientDebt)) {
    // Solo incluir clientes con deuda positiva
    if (data.lastAcumulado > 0) {
      // Fecha más reciente
      const fechas = data.transactions.map(t => t.fecha).filter(Boolean).sort()
      const ultimaFecha = fechas[fechas.length - 1] || null

      results.push({
        cliente: clientName,
        vendedor,
        deudaTotal: Math.round(data.lastAcumulado * 100) / 100,
        ultimaFechaEmision: ultimaFecha,
        cantidadComprobantes: data.transactions.length,
      })
    }
  }

  return results.sort((a, b) => b.deudaTotal - a.deudaTotal)
}

// Procesar todos los archivos
const allResults = []
for (const { file, vendedor } of FILES) {
  const filePath = path.join(__dirname, '..', file)
  if (!fs.existsSync(filePath)) {
    console.error(`Archivo no encontrado: ${file}`)
    continue
  }
  console.log(`Procesando: ${file} (${vendedor})`)
  const results = processFile(filePath, vendedor)
  console.log(`  → ${results.length} clientes con deuda`)
  allResults.push(...results)
}

// Resumen
console.log(`\nTotal: ${allResults.length} clientes con deuda`)
const totalDeuda = allResults.reduce((acc, r) => acc + r.deudaTotal, 0)
console.log(`Deuda total: $${totalDeuda.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)

// Por vendedor
const byVendedor = {}
for (const r of allResults) {
  if (!byVendedor[r.vendedor]) byVendedor[r.vendedor] = { count: 0, total: 0 }
  byVendedor[r.vendedor].count++
  byVendedor[r.vendedor].total += r.deudaTotal
}
console.log('\nPor vendedor:')
for (const [v, data] of Object.entries(byVendedor)) {
  console.log(`  ${v}: ${data.count} clientes, $${data.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
}

// Guardar output
const outputPath = path.join(__dirname, 'output-ctas-ctes.json')
fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2))
console.log(`\nGuardado en: ${outputPath}`)
