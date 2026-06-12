# Arquitectura

Detalle vivo: `CLAUDE.md` y `.claude/context/codemap.md`.

## Reglas no negociables
- **Fachada**: las pages importan de `lib/api.ts`, nunca directo de `services/`.
- **Carrito**: único `components/cart/UnifiedCart.tsx`, adaptable por rol (`admin`/`seller`/`null`). Lógica en `hooks/useCart.ts`. No duplicar.
- **Facturación AFIP**: unificada en `lib/facturacion-helper.ts`.
- **Supabase clients**: `lib/supabase.ts` (anon, client) / `lib/supabase-admin.ts` (service role, server). No mezclar.
- **Ventas atómicas**: usar RPC `process_sale()` (transacción ACID). No insertar venta/stock/comisión por separado.
- **Formato**: importar `formatCurrency` desde `lib/utils/format.ts`. Nunca instanciar `Intl` inline.
- **Fechas legacy**: convertir con `toDate()` de `services/supabase-helpers.ts`.

## Estructura de carpetas (no cambiar sin confirmar)
```
app/<modulo>/        # page + <MODULO>.md (doc del área)
app/api/             # rutas API (public/ sin auth, resto protegidas)
components/<dominio>/ # UI por dominio
services/            # 1 service por tabla/dominio
hooks/               # lógica reutilizable
lib/ , lib/utils/    # fachada, supabase, helpers, formato
```

## Antes de implementar
1. Leer el `<MODULO>.md` del área (si existe) y el codemap.
2. Buscar si ya existe service/hook/componente. Reutilizar.
3. Si necesitás tabla/columna nueva en Supabase → informar el SQL ANTES de escribir código.
