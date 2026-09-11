/**
 * Ejecuta un script TypeScript del proyecto resolviendo imports igual que el bundler
 * (sin extensión, con el alias `@/`).
 *
 *   node scripts/run-ts.mjs scripts/health-check.ts
 *
 * Node ejecuta TypeScript de forma nativa, pero en ESM exige la extensión en cada import y
 * el proyecto importa sin ella. En vez de agregar una dependencia (tsx, ts-node), usa Vite
 * —que ya viene con Vitest— y su misma resolución de alias.
 */

import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const objetivo = process.argv[2]
if (!objetivo) {
  console.error('Uso: node scripts/run-ts.mjs <archivo.ts>')
  process.exit(2)
}

const raiz = fileURLToPath(new URL('..', import.meta.url))

const server = await createServer({
  root: raiz,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
  resolve: { alias: { '@': raiz } },
})

try {
  await server.ssrLoadModule('/' + path.relative(raiz, path.resolve(objetivo)).replace(/\\/g, '/'))
} finally {
  await server.close()
}
