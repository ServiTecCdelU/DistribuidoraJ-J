# Plan de Mejoras — Distribuidora Patricia

> Estado: PROPUESTA. Marcar `[x]` a medida que se avanza.
> Relevado: 2026-06-09. Cada ítem indica **Por qué** y **Afecta**.
> Orden por prioridad: Seguridad → Datos/Estabilidad → Rendimiento → Arquitectura → Calidad → Limpieza.

## Estado real medido (2026-06-09)
- 19 rutas API: **0 validan con zod**, solo 11 verifican auth.
- **51** usos de `select('*')` en `services/`.
- **165** `any` en `app/services/hooks/lib`.
- **1 solo test** (`lib/__tests__/gastos-constants.test.ts`) — Vitest instalado.
- **38 scripts** `diag-*`/`fix-*` sueltos en `scripts/` (de 66 totales).
- `firebase` y `firebase-admin` siguen en `package.json` **sin uso**.
- 22 `console.log/debug` en código productivo.
- 6 pages > 1500 líneas (`productos` 2294, `pedidos` 2105, `caja` 1823, `mayorista` 1739, `tienda` 1619, `cuenta-corriente` 1418).

**UX/Estilo medido:**
- Radius inconsistente: 175 `rounded-xl`, 133 `rounded-lg`, 73 `rounded-md` vs **solo 63 `rounded-2xl`** (el estándar del proyecto).
- Dark mode **muerto**: variables `.dark` en `globals.css` + 121 clases `dark:` pero `ThemeProvider` (`components/theme-provider.tsx`) **no está montado** en `app/layout.tsx`.
- Borrados sin confirmación consistente: 8 handlers de delete, **0 `AlertDialog`**, 1 `confirm()` nativo (`listas-precios`).
- Solo **10** botones con estado loading/disabled → doble-submit posible (riesgo: venta/cobranza duplicada).
- Debounce solo en **6** archivos → búsquedas sobre miles de productos filtran en cada tecla.
- Accesibilidad: **8** `aria-*` fuera de `components/ui/`; `focus-visible` custom solo 20.
- Loading mezclado: 24 archivos con `Skeleton`, 31 con spinner `animate-spin` (dos patrones conviviendo).
- `<img>` crudo en `cuenta-corriente/page.tsx` y `payment-modal.tsx` (resto usa `next/image`).
- 8 componentes con vistas duplicadas desktop/mobile (`hidden lg:block`) — doble mantenimiento.

---

## 1. SEGURIDAD (crítico — primero)

### 1.1 RLS en Supabase ⚠️ DEADLINE VENCIDO (era 2026-06-01)
- [ ] **Confirmar en vivo** si RLS sigue deshabilitado (no se pudo verificar por MCP sin token). Si lo está, es el riesgo más grave abierto.
- [ ] Aplicar RLS por rol con helper `is_staff()` (SQL borrador abajo).
- [ ] Testear login admin + seller justo después. Tener rollback a mano.

**Por qué:** todos los `services/*.ts` consultan Supabase desde el navegador con la `ANON_KEY` (pública, visible en el bundle). Sin RLS, cualquiera con devtools puede leer/modificar `clientes`, `ventas`, `caja`, `comisiones` sin loguearse.
**Afecta:** evita fuga total de datos del negocio y manipulación de stock/ventas.

```sql
-- Helper: ¿usuario actual es staff activo? (usuarios.id/auth_uid son TEXT → castear)
create or replace function public.is_staff()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.usuarios u
    where (u.id = auth.uid()::text or u.auth_uid = auth.uid()::text)
      and u.role in ('admin','seller') and coalesce(u.is_active,true)=true
  );
$$;
-- Por cada tabla de negocio:
alter table public.<tabla> enable row level security;
create policy staff_all on public.<tabla> for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- ROLLBACK: alter table public.<tabla> disable row level security;
```
Tablas: `ventas, clientes, productos, vendedores, pedidos, comisiones, caja, auditoria, listas_precios, mayorista_productos, stock_movimientos, transacciones, pedidos_mayorista, configuracion`.
- Rutas API usan `supabaseAdmin` (service_role) → **RLS no las rompe**.
- `/api/public/*` usa service_role en server → la tienda sigue OK.
- **Punto delicado:** login (`ensureUserProfile`/`getUserProfile`) escribe `usuarios`/`vendedores` con anon key. Política especial o moverlo a ruta API service_role (preferido).

### 1.2 Rotar secreto Supabase hardcodeado
- [ ] Hay un secreto Supabase en `settings.local.json` (allow-list de curl). Rotarlo y quitarlo. Ver `CLAUDE.local.md`.

**Por qué/Afecta:** secreto expuesto en archivo del repo local → posible filtración de service_role.

### 1.3 Validación zod en rutas API
- [x] **Hecho (2026-06-09):** helper `lib/api-validation.ts` (`parseJsonBody`) que valida con zod y devuelve 400 consistente respetando el campo de error de cada ruta. Aplicado en las **11 rutas que reciben body JSON**: `ventas/emitir`, `facturacion`, `facturacion/comprobantes`, `facturacion/consultar-cuit`, `facturacion/reimprimir`, `apply-ganancia`, `import-productos`, `remitos`, `drive`, `productos/[id]/movimiento` y `public/pedidos` (entrada anónima). Build verde.
- Nota: `parse-remito` recibe archivo/formData (no JSON) → no aplica este helper.

**Por qué:** antes se confiaba en el body crudo. **Afecta:** previene datos corruptos, inyección lógica y crashes.

### 1.4 Verificación de ROL (no solo sesión) en rutas protegidas
- [~] **Parcial:** `apply-ganancia` e `import-productos` ya verifican `roles: ['admin']`. **Falta decidir** quién factura (¿sellers emiten?) antes de restringir `ventas/emitir` y `facturacion/*` — hoy exigen sesión válida. Restringir sin confirmar podría romper el flujo de vendedores.

**Por qué:** un seller no debería emitir/alterar lo de admin. **Afecta:** evita escalada de privilegios.

### 1.5 Rate limiting en rutas públicas
- [ ] Aplicar `lib/rate-limit.ts` a `/api/public/*` (clientes, productos, pedidos, vendedores).

**Por qué:** endpoints anónimos scrapeables. **Afecta:** mitiga scraping/abuso. (Limitación: in-memory, se resetea en redeploy → documentar.)

### 1.6 Validar variables de entorno al iniciar
- [x] **Hecho (2026-06-09):** `lib/env.ts` valida `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` con zod (lazy, cacheado), cableado en `lib/supabase-admin.ts`. Falla con mensaje claro si faltan.
- [ ] Pendiente: extender el schema a `BIT_INGENIERIA_*` y credenciales Drive donde se consumen.

**Por qué:** hoy un env faltante rompe en runtime con error oscuro. **Afecta:** fallo temprano y diagnosticable.

---

## 2. DATOS Y ESTABILIDAD

### 2.1 Manejo de errores consistente en services
- [ ] Unificar manejo: no tragar errores en silencio, propagar con mensaje, loguear contexto en server. Revisar los 51 `select('*')` que asumen éxito.

**Afecta:** menos estados inconsistentes y bugs silenciosos.

### 2.2 Error/loading boundaries
- [ ] Agregar `error.tsx`/`loading.tsx` en rutas pesadas (`productos`, `pedidos`, `caja`, `mayorista`, `cuenta-corriente`).

**Afecta:** una query que falla no rompe toda la página.

### 2.3 Integridad de ventas/stock
- [ ] Verificar que TODO descuento de stock/comisión pase por RPC `process_sale()` (no inserts sueltos). Auditar `sales-service.ts` y mayorista.

**Por qué:** los muchos `fix-*` scripts sugieren descuadres históricos. **Afecta:** evita stock/comisiones inconsistentes.

---

## 3. RENDIMIENTO

### 3.1 Eliminar `select('*')` innecesarios (51 casos)
- [ ] Seleccionar solo columnas usadas en listados grandes (productos ~7400, ventas, clientes).

**Afecta:** menos payload, render más rápido, menos memoria.

### 3.2 Paginación / virtualización en listados grandes
- [ ] Paginar o virtualizar `productos`, `mayorista`, `cuenta-corriente`, `ventas`.

**Afecta:** evita traer miles de filas y bloquear el render.

### 3.3 Optimización de imágenes
- [ ] `images.unoptimized:true` está forzado. Evaluar dimensiones explícitas y lazy en catálogo/tienda. (No tocar `next.config.mjs` sin confirmar.)

---

## 4. ARQUITECTURA Y MANTENIBILIDAD

### 4.1 Dividir pages gigantes (>800 líneas)
- [ ] Prioridad: `productos/page.tsx` (2294), `pedidos/page.tsx` (2105), `caja/page.tsx` (1823), `mayorista/page.tsx` (1739), `tienda/page.tsx` (1619), `cuenta-corriente/page.tsx` (1418), `useGenerarPdf.tsx` (1363), `UnifiedCart.tsx` (1352).
- [ ] Extraer subcomponentes/hooks por feature, sin cambiar comportamiento.

**Afecta:** mantenibilidad, menos riesgo al editar, mejor reuso.

### 4.2 Respetar la fachada `lib/api.ts`
- [ ] Auditar que las pages NO importen directo de `services/`. Corregir las que lo hagan.

### 4.3 Centralizar tipo `Venta` duplicado
- [ ] Unificar `app/ventas/types.ts` vs `hooks/useVentas.ts` (hoy divergen en `afipData`/base64).

**Afecta:** evita bugs de tipos y conversiones inconsistentes.

---

## 5. CALIDAD DE CÓDIGO Y TIPOS

### 5.1 Reducir `any` (165) y reactivar chequeo de tipos
- [ ] Tipar gradualmente services/hooks críticos. Quitar `@ts-nocheck` de `useGenerarPdf.tsx`.
- [ ] Correr `tsc --noEmit` aparte del build (el build ignora errores TS).

**Afecta:** detecta bugs en compile-time en vez de producción.

### 5.2 Tests (solo hay 1)
- [ ] Cubrir lógica de negocio pura primero: `lib/utils/promo.ts`, `lib/utils/format.ts`, cálculo de comisiones, descuentos, mayorista.
- [ ] Luego `hooks/useCart.ts`, `hooks/useVentas.ts`, helpers de facturación. Mockear Supabase, no pegarle a BD real.

**Afecta:** evita regresiones en plata (ventas/comisiones/stock).

### 5.3 Quitar `console.log` de debug (22)
- [ ] Limpiar logs de debug en código productivo.

---

## 6. LIMPIEZA Y DEVEX

### 6.1 Quitar dependencias muertas
- [x] **Hecho (2026-06-09):** eliminados `firebase` y `firebase-admin` de `package.json` (0 imports). `npm install` removió 188 paquetes. Build verde.

**Afecta:** bundle/instalación más livianos, menos superficie.

### 6.2 Ordenar scripts sueltos (38 diag/fix en raíz de `scripts/`)
- [ ] Mover `diag-*`/`fix-*` a `scripts/diagnostico/` y `scripts/fixes/` (o borrar los ya resueltos). No son tests.

**Afecta:** repo más limpio, menos ruido en git status.

### 6.3 Limpiar archivos sueltos en raíz
- [ ] Revisar/borrar `clientes_Nueva Zona.csv`, xlsx/jpg de prueba. Agregar patrones a `.gitignore`.

---

## 7. ESTILO VISUAL (consistencia del design system)

### 7.1 Unificar border-radius al estándar `rounded-2xl`
- [ ] Hoy conviven 4 escalas (md/lg/xl/2xl) y el estándar declarado es el MENOS usado (63 de ~444). Definir regla final: `rounded-2xl` para cards/modales/contenedores, `rounded-xl` para inputs/botones, `rounded-full` para badges/avatares.
- [ ] Migrar por módulo (empezar por las pages más vistas: caja, pedidos, ventas, productos). Ajustar `--radius` en `globals.css` si conviene resolverlo por token en vez de clase por clase.

**Afecta:** identidad visual coherente; hoy cada pantalla se ve de una "época" distinta.

### 7.2 Resolver dark mode: activarlo o eliminarlo
- [ ] Decidir: (A) montar `ThemeProvider` en `app/layout.tsx` + toggle en sidebar/header, validando las 121 clases `dark:` existentes; o (B) borrar las variables `.dark` y clases `dark:` muertas.
- [ ] Recomendado: **(A)** — el CSS ya está hecho, falta solo el wiring. Probar legibilidad en caja/pedidos (colores de estado amber/rojo/verde sobre fondo oscuro).

**Afecta:** hoy es código muerto que confunde; activado, es una mejora visible para uso nocturno (reparto/caja).

### 7.3 Sistema de colores semánticos de estado
- [ ] Ya existen tokens `--success`/`--warning` en `globals.css`. Crear helper/`cva` único para los estados que se repiten en todo el sistema: deuda (amber), moroso (rojo), incobrable (rojo oscuro), al día (verde), estados de pedido (pending/preparation/delivery/completed), tipos de pago.
- [ ] Reemplazar los hex/clases ad-hoc dispersos en pedidos, clientes, cuenta-corriente, caja por ese helper.

**Afecta:** el mismo concepto (ej. "moroso") se ve igual en TODAS las pantallas; cambiar un color es 1 línea.

### 7.4 Unificar patrón de loading
- [ ] Conviven `Skeleton` (24 archivos) y spinners (31). Regla: **Skeleton para carga de páginas/listados** (mantiene el layout, no salta), **spinner solo dentro de botones**.
- [ ] Crear 2-3 skeletons reutilizables (tabla, card de producto, lista mobile) y usarlos en todas las pages.

**Afecta:** percepción de velocidad y cero saltos de layout (CLS).

### 7.5 Jerarquía tipográfica consistente
- [ ] Auditar títulos de página/sección/card: hoy cada page define tamaños a mano. Definir 3 niveles (`text-2xl font-bold` página, `text-lg font-semibold` sección, `text-sm font-medium text-muted-foreground` label) y aplicarlos.

**Afecta:** lectura más rápida; las pantallas densas (caja, cuenta corriente) lo necesitan.

---

## 8. UX (flujos y fricción)

### 8.1 Confirmación de acciones destructivas — GLOBAL
- [x] **Hecho (2026-06-09):** todos los borrados destructivos de datos ya pasan por `ConfirmDialog`: empleados, gastos, listas-precios, pedidos (deleteOrder) y productos. Reemplazado el único `confirm()` nativo (listas-precios). No quedan `confirm()`/`alert()` nativos en el código.
- Nota: borrados livianos/reversibles se dejaron sin modal a propósito para no agregar fricción (quitar faltante del historial en `clientes/[id]` — optimista y revierte si falla; eliminar remito en pedidos — reversible, "podés generarlo de nuevo").
- [ ] Para acciones de plata (anular venta, reabrir caja, eliminar cobranza) el dialog debe mostrar el impacto: "Se restaurará stock de N productos, se revertirá comisión de $X".

**Afecta:** previene borrados accidentales en datos de negocio — la causa de varios scripts `fix-*` históricos.

### 8.2 Anti doble-submit en operaciones de dinero — CRÍTICO UX
- [ ] Solo 10 botones tienen estado loading. Auditar TODOS los submits que mutan plata/stock (procesar venta, cobranza, pago de pedido, cierre de caja, emisión AFIP) y garantizar: `disabled` durante el request + spinner en el botón + no cerrar modal hasta respuesta.
- [ ] Patrón único: hook `useSubmitting()` o estado local estándar.

**Afecta:** elimina ventas/cobranzas duplicadas (ya hubo: `fix-villagran-duplicado`, `diag-joannas-doble`, `diag-pedidos-duplicados`).

### 8.3 Búsquedas con debounce + feedback
- [x] **Hecho (2026-06-09):** hook `hooks/use-debounce.ts` aplicado en `clientes` (no tenía) y `tienda` (su debounce estaba MUERTO — `searchInput`/`handleSearchChange` definidos pero sin uso; reconectado vía el hook y eliminado el código muerto). Ya tenían debounce manual funcional: productos, descuentos, mayorista, ventas/nueva.
- [ ] Pendiente menor: feedback de contador de resultados ("128 productos") y empty state accionable en las búsquedas (parte de 8.4).
- [ ] Mostrar contador de resultados ("128 productos") y empty state con acción ("No hay resultados para X — limpiar filtros").

**Afecta:** la búsqueda deja de trabarse en catálogos grandes; el usuario sabe qué pasó.

### 8.4 Empty states accionables
- [ ] Unificar los 25 empty states dispersos en un componente `EmptyState` (ícono + mensaje + CTA). Ej: pedidos vacío → "Crear pedido"; clientes sin movimientos → link a nueva venta.

**Afecta:** pantallas vacías guían en vez de parecer rotas.

### 8.5 Optimistic UI + revalidación en acciones frecuentes
- [ ] En cambios de estado de pedidos ("a preparación", "a reparto"), marcar visualmente al instante y revertir con toast si falla, en vez de esperar el round-trip.
- [ ] Tras crear/editar en modales, actualizar la lista local sin refetch completo de la página.

**Afecta:** el flujo diario de pedidos (la operación más repetida) se siente instantáneo.

### 8.6 Mobile-first real en flujos de campo
- [ ] Vendedor (`app/vendedor/`) y transportista (`/pedidos`) trabajan desde el teléfono. Auditar: targets táctiles ≥44px, botones de acción primarios fijos abajo (thumb zone), evitar tablas con scroll horizontal donde una card list funciona mejor.
- [ ] Consolidar las 8 vistas duplicadas `hidden lg:block` donde sea posible (una sola estructura responsive > dos árboles a mantener).

**Afecta:** menos errores de dedo en la calle; mitad de código de UI que mantener.

### 8.7 Accesibilidad mínima viable
- [ ] `aria-label` en botones de solo ícono (editar/borrar/descargar en tablas — hoy casi ninguno tiene).
- [ ] Verificar contraste de los colores de estado (amber sobre blanco suele fallar AA).
- [ ] Foco visible al navegar con teclado en tablas y modales (hoy 20 usos custom en todo el código).

**Afecta:** usabilidad general; el contraste también ayuda al sol en reparto.

### 8.8 Tienda pública: primera impresión y velocidad
- [ ] `app/tienda/page.tsx` (1619 líneas) es 100% client-side: el cliente ve blanco hasta que carga el JS. Mover catálogo inicial a Server Component con datos pre-cargados (los componentes interactivos quedan client).
- [ ] Reemplazar `<img>` por `next/image` con dimensiones en `cuenta-corriente` y `payment-modal`; lazy en grillas de catálogo.
- [ ] Carrito: feedback al agregar (badge animado en el ícono), y persistencia si recarga.

**Afecta:** la tienda es la cara pública — hoy es la página más lenta del sistema.

### 8.9 Navegación y orientación
- [ ] Decidir destino de los items comentados del sidebar (Dashboard, Reportes, Cobranzas, Transporte, Listas de Precios, Auditoría): habilitarlos o borrarlos del código.
- [ ] Breadcrumb o título consistente por página (hoy algunos módulos no indican dónde estás en mobile).
- [ ] Indicador activo del sidebar visible también en mobile.

**Afecta:** menos código zombie; orientación clara en pantallas chicas.

### 8.10 Formularios: validación visible y persistencia
- [ ] Donde hay `react-hook-form` + zod, mostrar errores inline bajo el campo (no solo toast). Auditar product-modal, client-modal, gastos.
- [ ] En modales largos (producto con 1135 líneas de modal), avisar antes de cerrar con cambios sin guardar.

**Afecta:** menos datos cargados a medias, menos re-trabajo.

---

## Resumen de prioridades
1. **Ahora:** 1.1 RLS, 1.2 rotar secreto, 8.2 anti doble-submit (ya causó datos duplicados).
2. **Esta semana:** 1.3 zod, 1.4 rol, 1.5 rate-limit, 1.6 env, 8.1 ConfirmDialog global.
3. **Siguiente:** 2.x errores/integridad, 3.1–3.2 rendimiento, 8.3 debounce, 8.8 tienda.
4. **Continuo:** 4.x dividir archivos, 5.x tipos+tests, 6.x limpieza, 7.x estilo (por módulo, al tocar cada page), 8.4–8.10 UX incremental.

> Regla práctica para 7.x/8.x: NO hacer un "big bang" visual. Cada vez que se toque un módulo por otra razón, aplicarle el estándar (radius, loading, confirmaciones, empty states). Los únicos transversales que valen la pena de una sola pasada: ConfirmDialog (8.1), anti doble-submit (8.2) y debounce (8.3).
