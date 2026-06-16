import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Resuelve el alias "@/..." (igual que tsconfig) para que los tests puedan
// importar módulos de la app. Sin esto, importar utilidades que dependen de
// otros módulos vía "@/..." falla al resolver.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
