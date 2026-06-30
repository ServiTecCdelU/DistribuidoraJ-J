import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Alias "@/..." -> raíz del proyecto, igual que tsconfig.json. Permite testear
// módulos que usan imports absolutos. No cambia el resto de la config por defecto.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
