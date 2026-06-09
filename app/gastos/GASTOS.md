# Módulo Gastos — funcionamiento

Referencia rápida de `app/gastos/page.tsx`. Solo `admin`.

## Qué hace

Carga y administra los gastos del negocio para, más adelante, calcular rentabilidad
en el dashboard. Dos tipos:

- **Gastos fijos** (`gastos_fijos`): recurrentes (alquiler, sueldos, servicios). Se
  definen una vez con una **vigencia** opcional (`desde`/`hasta`, por mes) y cuentan
  automáticamente en cada mes vigente — no se cargan a mano cada mes. `activo=false`
  deja de sumar.
- **Gastos variables** (`gastos_variables`): puntuales, con `fecha`. Se listan por el
  mes seleccionado.

## Datos

- Tablas `gastos_fijos` y `gastos_variables` (ver schema en
  `docs/superpowers/specs/2026-06-08-rentabilidad-gastos-design.md`).
- Service: `services/gastos-service.ts` (CRUD de ambas). Expuesto por `lib/api.ts` →
  `gastosApi` (`getFijos/createFijo/updateFijo/deleteFijo`,
  `getVariables/createVariable/updateVariable/deleteVariable`).
- Constantes (categorías sugeridas): `lib/gastos-constants.ts`.

## UI

- Selector de mes (`input type=month`) arriba.
- KPIs: total fijos vigentes · total variables del mes · total del mes.
- Sección Gastos fijos: lista completa (marca vigencia/inactivo) + alta/edición/baja
  vía `components/gastos/gasto-fijo-modal.tsx`.
- Sección Gastos variables: lista del mes + alta/edición/baja vía
  `components/gastos/gasto-variable-modal.tsx`.
- Vigencia: `esVigente(gasto, 'YYYY-MM')` replica el filtro de
  `rentabilidad-service.ts` para el KPI.

## Pendiente (fases siguientes)

- Dashboard de **rentabilidad** (ya hay `services/rentabilidad-service.ts`):
  ingresos − costo mercadería estimado − comisiones − gastos = resultado neto.
