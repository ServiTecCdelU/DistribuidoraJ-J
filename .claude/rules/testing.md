# Testing

Runner: **Vitest** (`npm run test`, `npm run test:watch`).

> Histórico: el proyecto nació sin tests. Vitest ya está instalado; al tocar
> lógica de negocio crítica (ventas, stock, comisiones, facturación) agregar test.

## Prioridad de cobertura
1. `services/*` con cálculo (sales, commissions, stock, mayorista, price-list).
2. `lib/utils/*` (format, promo, doc-actions) — puras, fáciles de testear.
3. `hooks/useCart.ts`, `hooks/useVentas.ts`.
4. Helpers de facturación (`lib/facturacion-helper.ts`).

## Estructura (AAA)
```ts
import { describe, it, expect } from "vitest";

describe("formatCurrency", () => {
  it("formatea ARS con separador de miles", () => {
    expect(formatCurrency(1500)).toBe("$ 1.500");
  });
});
```

## Reglas
- Nombres descriptivos del comportamiento, no del método.
- Mockear Supabase (`lib/supabase`/`supabase-admin`), no pegarle a la BD real.
- No testear contra datos productivos. Los scripts `scripts/diag-*` son diagnóstico, no tests.
- Si un test falla, arreglar la implementación, no el test (salvo que el test esté mal).
