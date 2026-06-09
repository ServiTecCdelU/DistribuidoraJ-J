# Módulo Gastos y Rentabilidad — Diseño

**Fecha:** 2026-06-08
**Rama:** `feat/rentabilidad-gastos`
**Estado:** aprobado el diseño · pendiente ejecutar SQL antes de implementar

## Problema

El dueño no sabe si el negocio es rentable. Necesita cargar los gastos (fijos
mensuales y variables/móviles) y que el sistema calcule, contra los datos de
ventas y comisiones ya existentes, si el mes da ganancia o pérdida.

## Decisiones tomadas

- **Fuente de ganancia:** automático estimado. Se toman las ventas del mes y se
  estima el costo cruzando cada producto con su precio base actual.
- **Tipos de gasto:** fijos mensuales + variables/móviles + comisiones
  automáticas (las comisiones devengadas se descuentan solas, no se cargan a mano).
- **Acceso:** solo `admin` (igual que Caja).

## Ubicación y alcance

- Página: `app/rentabilidad/` · solo admin · nuevo ítem en el sidebar.
- Rama: `feat/rentabilidad-gastos`.
- Estilo: `rounded-2xl`, paleta teal/cyan, consistente con Caja.

## Modelo de datos (Supabase) — 2 tablas nuevas

```sql
-- Gastos fijos recurrentes (se repiten todos los meses hasta darlos de baja)
create table gastos_fijos (
  id text primary key,
  nombre text not null,
  categoria text,                 -- alquiler, sueldos, servicios, etc.
  monto numeric not null default 0,
  activo boolean not null default true,
  desde date,                     -- mes desde el que aplica (opcional)
  hasta date,                     -- mes hasta el que aplica (null = vigente)
  created_at timestamptz not null default now()
);

-- Gastos variables / móviles (puntuales, con fecha)
create table gastos_variables (
  id text primary key,
  nombre text not null,
  categoria text,                 -- combustible, mantenimiento, reparación, etc.
  monto numeric not null default 0,
  fecha date not null,
  created_at timestamptz not null default now()
);
```

> ⚠ Ejecutar este SQL en Supabase ANTES de escribir el código que lo usa
> (regla del proyecto en CLAUDE.md).

## Cálculo de rentabilidad (por mes seleccionado)

| Concepto | Origen |
|---|---|
| Ingresos | Σ total de `ventas` del mes |
| Costo mercadería (estimado) | Σ `cantidad × costo unit.` por ítem vendido. Costo unit. = `productos.precio_base`, o derivado `precio_venta ÷ (1 + ganancia%/100)` cuando no hay precio base |
| **Ganancia bruta** | Ingresos − Costo mercadería |
| Comisiones | Σ `comisiones` devengadas del mes (automático) |
| Gastos fijos | Σ `gastos_fijos` activos vigentes ese mes |
| Gastos variables | Σ `gastos_variables` con fecha en el mes |
| **Resultado neto** | Ganancia bruta − comisiones − gastos fijos − gastos variables |
| Punto de equilibrio | (gastos fijos + variables + comisiones) ÷ margen% → ventas necesarias para no perder |

- Indicador grande: **Rentable** (verde) si neto > 0 · **En pérdida** (rojo) si < 0.
- El costo se rotula **"estimado"** porque usa precios actuales del producto, no
  el costo histórico del momento de la venta (las ventas no guardan costo).
- Los ítems de regalo (`price = 0`) igual suman su costo de mercadería.

## Notas de datos (verificadas en el código)

- En `productos`: `precio_base` = costo, `precio_venta`/`price` = precio con
  ganancia, `ganancia_global` = % markup. `precio_venta = precio_base × (1 + ganancia/100)`.
- El ítem de venta guarda `productId` + `price` (precio de venta), no el costo.
  El costo se estima cruzando `productId` → `productos`.
- Comisiones devengadas en tabla `comisiones` (por fecha del mes). No usar
  `pagos_comisiones` (esas son las pagadas, no las generadas).

## Componentes / código

- `services/gastos-service.ts` — CRUD de `gastos_fijos` y `gastos_variables`.
- `services/rentabilidad-service.ts` — arma el cálculo mensual (ventas + COGS
  estimado + comisiones + gastos).
- `lib/api.ts` — exponer `gastosApi` y `rentabilidadApi` (las pages importan desde acá).
- `app/rentabilidad/page.tsx` — página fina; lógica en hook/servicio.
- `components/rentabilidad/` — cards resumen, gráfico (recharts), secciones CRUD.
- Sidebar: nuevo ítem solo admin en `components/layout/app-sidebar.tsx`.

## UI

1. Selector de mes (arriba).
2. Fila de cards: Ingresos · Costo mercadería · Ganancia bruta · Gastos fijos ·
   Gastos variables · Comisiones · **Resultado neto** · margen %.
3. Gráfico de barras: ingresos vs costos vs gastos (recharts, ya instalado).
4. Sección CRUD gastos fijos: lista + alta/edición/baja.
5. Sección CRUD gastos variables: filtrados por el mes seleccionado.

## Próximos pasos

1. Ejecutar el SQL en Supabase.
2. Implementar servicios → API → página → sidebar.
3. `npm run build`, commit y push en `feat/rentabilidad-gastos`.
