/**
 * Chequeo de errores de TypeScript contra un baseline congelado.
 *
 *   npm run typecheck            comparar contra el baseline
 *   npm run typecheck:update     regenerar el baseline (después de arreglar errores)
 *
 * El proyecto compila con `ignoreBuildErrors: true` y arrastra errores viejos. Esto no los
 * arregla: impide que crezcan. Falla si un archivo tiene más errores que antes o si aparece
 * un archivo nuevo con errores.
 *
 * Por archivo y no por total: un error nuevo puede quedar tapado por otro resuelto en otro
 * lado. Pasó con un `AuditAction` inválido que se coló con el total intacto en 99.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  contarPorArchivo,
  compararConBaseline,
  type ConteoPorArchivo,
} from '../lib/utils/ts-baseline'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const BASELINE = path.join(raiz, 'scripts', 'ts-baseline.json')

const actualizar = process.argv.includes('--update')

function correrTsc(): string {
  try {
    execFileSync(
      process.execPath,
      [path.join(raiz, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'],
      { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
    )
    return '' // sin errores
  } catch (e: any) {
    // tsc sale con código 2 cuando hay errores de tipos: la salida es el resultado esperado.
    const salida = `${e?.stdout ?? ''}${e?.stderr ?? ''}`
    if (!salida.trim()) throw e
    return salida
  }
}

console.log('\nVerificando tipos…')
const conteo = contarPorArchivo(correrTsc())
const total = Object.values(conteo).reduce((a, n) => a + n, 0)

if (actualizar) {
  const ordenado: ConteoPorArchivo = {}
  for (const k of Object.keys(conteo).sort()) ordenado[k] = conteo[k]
  writeFileSync(BASELINE, JSON.stringify(ordenado, null, 2) + '\n')
  console.log(`Baseline actualizado: ${total} errores en ${Object.keys(conteo).length} archivos\n`)
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.error(`No existe ${path.relative(raiz, BASELINE)}. Generalo con: npm run typecheck:update\n`)
  process.exit(2)
}

const baseline: ConteoPorArchivo = JSON.parse(readFileSync(BASELINE, 'utf8'))
const r = compararConBaseline(baseline, conteo)

console.log('─'.repeat(60))

if (r.mejoraron.length > 0) {
  console.log(`\n✓ ${r.mejoraron.length} archivo${r.mejoraron.length === 1 ? '' : 's'} con menos errores:`)
  for (const m of r.mejoraron) console.log(`    ${m.archivo}: ${m.antes} → ${m.ahora}`)
  console.log('\n  Congelá la mejora con: npm run typecheck:update')
}

if (!r.ok) {
  console.log(`\n✗ ${r.empeoraron.length} archivo${r.empeoraron.length === 1 ? '' : 's'} con errores nuevos:`)
  for (const e of r.empeoraron) {
    const etiqueta = e.antes === 0 ? 'sin errores en el baseline' : `antes ${e.antes}`
    console.log(`    ${e.archivo}: ${etiqueta} → ahora ${e.ahora}`)
  }
  console.log(`\n  Total: ${r.totalAntes} → ${r.totalAhora}`)
  console.log('  Corré `node node_modules/typescript/bin/tsc --noEmit` para ver el detalle.\n')
  process.exit(1)
}

console.log(`\n✓ Sin errores nuevos (${r.totalAhora} conocidos, baseline ${r.totalAntes})\n`)
process.exit(0)
