# Plan de Mejoras Integral — Distribuidora Patricia

> Estado: PROPUESTA (no ejecutado). Marcar `[x]` a medida que se avanza.
> Cada ítem indica **Por qué** se hace y **En qué afecta** la mejora.
> Orden por prioridad: Seguridad → Estabilidad/Datos → Rendimiento → Mantenibilidad → Calidad de código → UX/DevEx.

---

## 1. SEGURIDAD (crítico — hacer primero)

### 1.1 Verificar y blindar RLS en Supabase ⚠️ APLICAR EL LUNES 2026-06-01
- [ ] **CONFIRMADO 2026-05-29: RLS está DESHABILITADO en todas las tablas.** Riesgo crítico abierto en producción.
- [ ] Aplicar RLS con políticas por rol (ver plan de ejecución abajo).
- [ ] Testear login admin + seller inmediatamente después. Tener rollback a mano.

**Por qué:** Todos los `services/*.ts` consultan Supabase desde el navegador con la `NEXT_PUBLIC_SUPABASE_ANON_KEY`, que es pública y visible en el bundle del cliente. Con RLS deshabilitado, cualquiera que abra devtools, copie la anon key y pegue al endpoint REST de Supabase puede hacer `select * from clientes / ventas / caja / comisiones` y también modificar/borrar datos, sin pasar por la app ni loguearse.

**En qué afecta:** Evita fuga total de datos del negocio (clientes, deudas, facturación, caja) y manipulación de stock/ventas. Es el riesgo más grave del proyecto.

#### Contexto relevado (para ejecutar seguro)
- Solo `admin` y `seller` entran a la app — `app/page.tsx` manda cualquier otro rol a `/login`. El rol `customer` no se usa en el código.
- La tienda es 100% pública vía `/api/public/*` (service_role en el server) → no usa la anon key.
- Las rutas API usan `supabaseAdmin` (service_role) → **RLS no las afecta**, siguen funcionando.
- El cliente (admin/seller) lee/escribe con la anon key + su JWT de sesión → en políticas se puede usar `auth.uid()`.
- **Punto delicado:** el login (`services/users-service.ts` → `ensureUserProfile`/`getUserProfile`) escribe/lee `usuarios` y `vendedores` con la anon key durante el bootstrap (primer admin, vinculación de seller). Si RLS lo bloquea mal, **se rompe el login para todos**.

#### Decisión pendiente (elegir el lunes)
- **Opción A (robusta):** mover `getUserProfile`/`ensureUserProfile` a una ruta API con service_role (el cliente deja de escribir `usuarios` con anon key). Luego RLS con `is_staff()` queda limpio. Más trabajo, menor riesgo de agujeros.
- **Opción B (rápida):** activar RLS con `is_staff()` y políticas permisivas en `usuarios`/`vendedores` para no tocar el código del login. Más veloz, cierra el agujero anónimo, pero `usuarios` queda algo más laxa (auto-provisionamiento posible).

#### SQL base propuesto (borrador — revisar antes de correr)
```sql
-- 1) Función helper: ¿el usuario actual es staff activo?
create or replace function public.is_staff()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.usuarios u
    where (u.id = auth.uid()::text or u.auth_uid = auth.uid()::text)
      and u.role in ('admin','seller')
      and coalesce(u.is_active, true) = true
  );
$$;

-- 2) Por cada tabla de negocio (ventas, clientes, productos, vendedores,
--    pedidos, comisiones, caja, auditoria, listas_precios, mayorista_productos,
--    stock_movimientos, transacciones, pedidos_mayorista, configuracion):
alter table public.<tabla> enable row level security;
create policy staff_all on public.<tabla>
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 3) usuarios: requiere política especial para el bootstrap de login
--    (definir según Opción A o B antes de correr).

-- ROLLBACK de emergencia (si se rompe el login / la app):
-- alter table public.<tabla> disable row level security;
```

**Notas:**
- `usuarios.id`/`auth_uid` son TEXT; `auth.uid()` es UUID → castear a `::text`.
- service_role (rutas API y tienda pública) ignora RLS, no se rompe.
- Aplicar tabla por tabla y probar la app después de cada bloque.

### 1.2 Validación de entrada en API routes (zod)
- [ ] Agregar validación con `zod` (ya está en deps) en `app/api/ventas/emitir`, `app/api/facturacion/*`, `app/api/public/pedidos`, `app/api/import-productos`, `app/api/remitos`.

**Por qué:** Ninguna ruta API valida el `body` con schema (`grep` de zod en `app/api` = 0 resultados). Se confía en datos externos crudos. `app/api/public/pedidos` crea pedidos sin auth (correcto para tienda) pero sin validar estructura/tipos/montos.

**En qué afecta:** Previene corrupción de datos, inyección de campos inesperados y errores 500 por payloads malformados. Mejora robustez de la facturación AFIP (un payload malo puede emitir mal un comprobante fiscal).

### 1.3 Verificación de ROL en rutas protegidas, no solo de sesión
- [x] Helper `lib/api-auth.ts` (`requireAuth`) que valida token + resuelve rol en `usuarios` (lookup dual id/auth_uid) y bloquea `customer` e inactivos.
- [x] Aplicado a `ventas/emitir`, `facturacion/*`, `afip/*`, `drive`, `remitos` (bloquea `customer`).
- [x] `apply-ganancia` e `import-productos` ahora requieren rol `admin` (antes NO tenían auth: cualquiera modificaba precios o cargaba productos). Callers actualizados para enviar el token.
- [x] Bug colateral corregido: `remitos` antes ignoraba el resultado de `getUser` (token inválido pasaba igual).

**Por qué:** Hoy las rutas protegidas solo chequean que el token sea válido (`supabaseAdmin.auth.getUser`). Cualquier usuario autenticado (incluido un `customer` de la tienda) podría llamar endpoints de facturación o aplicar ganancia global.

**En qué afecta:** Cierra escalada de privilegios. Un cliente no debería poder emitir facturas ni modificar precios mayoristas.

### 1.4 Rate limiting en TODAS las rutas públicas
- [x] Agregado `rateLimit` (60/min por IP) a `app/api/public/productos` y `app/api/public/mas-vendidos`.

**Por qué:** Endpoints públicos sin límite permiten scraping masivo del catálogo y abuso/DoS.

**En qué afecta:** Protege costos de Supabase/Vercel y disponibilidad. Nota: el rate-limit es in-memory y se resetea en cada redeploy (limitación conocida, ver 6.4).

### 1.5 Validación de variables de entorno al iniciar
- [ ] Crear `lib/env.ts` que valide con zod las env requeridas (`SUPABASE_*`, `BIT_INGENIERIA_*`, Google Drive) y falle rápido si falta alguna.

**Por qué:** Hoy se usan con `!` (`process.env.X!`) asumiendo que existen. Si falta una, el error aparece tarde y confuso en runtime.

**En qué afecta:** Despliegues más seguros; errores claros en build/arranque en vez de fallos crípticos en producción (ej: facturación rota por CUIT faltante).

---

## 2. ESTABILIDAD Y DATOS

### 2.1 Manejo de errores consistente en services
- [ ] Estandarizar retorno de errores en `services/*` (envelope `{ data, error }` o throw tipado). Reemplazar `catch` que silencian.
- [ ] Revisar los 13 `console.log` de producción y reemplazar por logger condicional o quitarlos.

**Por qué:** Mezcla de patrones de error entre services dificulta el manejo en UI. `console.log` en producción ensucia y puede filtrar datos.

**En qué afecta:** Menos errores silenciosos, mejores mensajes al usuario, logs más limpios.

### 2.2 Error/loading boundaries faltantes
- [ ] Agregar `error.tsx` y `loading.tsx` a páginas sin ellos: `caja`, `cobranzas`, `cuenta-corriente`, `mayorista`, `comisiones`, `transporte`, `reportes`, `vendedor`, `tienda`.

**Por qué:** Solo 6 páginas tienen `error.tsx` (`clientes`, `dashboard`, `empleados`, `pedidos`, `productos`, `ventas`) y ninguna tiene `loading.tsx`. Un error en `caja` o `cuenta-corriente` (módulos de dinero) rompe la pantalla sin recuperación.

**En qué afecta:** UX más robusta: estados de carga y pantallas de error recuperables en módulos financieros críticos.

### 2.3 Limpiar dependencias muertas
- [ ] Quitar `firebase` y `firebase-admin` de `package.json` (ya no se importan en el código).
- [ ] Revisar duplicados de PDF: `jspdf`, `pdf-lib`, `@react-pdf/renderer`, `puppeteer` + `puppeteer-core`, `html2canvas-pro` — consolidar.

**Por qué:** `firebase`/`firebase-admin` están sin uso (confirmado, 0 imports). `puppeteer` completo (~300MB) además de `puppeteer-core` infla el deploy. Hay 3-4 librerías de PDF coexistiendo.

**En qué afecta:** Build más rápido, bundle/función serverless más liviana, menos superficie de vulnerabilidades, `npm install` más rápido.

---

## 3. RENDIMIENTO

### 3.1 Eliminar `select('*')` innecesarios
- [ ] Reemplazar los 42 `select('*')` por selección explícita de columnas, sobre todo en listados grandes (`productos` ~2013 filas, `mayorista_productos` ~7400).

**Por qué:** Traer todas las columnas de tablas grandes transfiere datos de más y satura el cliente. En productos/mayorista esto pesa.

**En qué afecta:** Cargas más rápidas, menos ancho de banda, menos consumo de memoria en el navegador.

### 3.2 Paginación / virtualización en listados grandes
- [ ] Paginar o virtualizar `app/productos` (2210 líneas, lista completa), `app/mayorista` (~7400 productos), `app/tienda`.

**Por qué:** Renderizar miles de filas/cards de una vez bloquea el hilo principal y degrada el INP.

**En qué afecta:** Mejora Core Web Vitals (INP, LCP), fluidez del scroll, uso de memoria, especialmente en mobile (vendedores en campo).

### 3.3 Revisar waterfalls de fetch en páginas
- [ ] Auditar `useEffect` encadenados en `app/productos` (6), `app/pedidos` (4) y paralelizar fetches independientes con `Promise.all`.
- [ ] En `dashboard-service` (7 queries) verificar que las independientes corran en paralelo.

**Por qué:** Fetches secuenciales que podrían ser paralelos suman latencia innecesaria.

**En qué afecta:** Dashboard y listados cargan notablemente más rápido.

### 3.4 Evaluar capa de caché de datos del servidor
- [ ] Considerar TanStack Query o SWR para server-state (catálogo, clientes, pedidos) en vez de `useEffect` + `useState` manual.

**Por qué (consultar antes — implica librería nueva):** Hoy cada navegación re-fetchea todo manualmente. Una capa SWR da cache, revalidación y menos código repetido. **Requiere aprobación** (regla: no instalar librerías sin consultar).

**En qué afecta:** Menos llamadas redundantes a Supabase, navegación instantánea entre páginas, menos boilerplate de fetching.

---

## 4. MANTENIBILIDAD Y ARQUITECTURA

### 4.1 Dividir archivos gigantes (>800 líneas)
- [ ] `app/productos/page.tsx` (2210) → extraer tabla, filtros, modales, hooks de datos.
- [ ] `app/mayorista/page.tsx` (1636), `app/tienda/page.tsx` (1619), `app/caja/page.tsx` (1614), `app/pedidos/page.tsx` (1577), `app/cuenta-corriente/page.tsx` (1335), `app/transporte/page.tsx` (1308), `app/dashboard/page.tsx` (1177), `app/empleados/page.tsx` (1126).
- [ ] `components/cart/UnifiedCart.tsx` (1244), `hooks/useCart.ts` (1081), `hooks/useGenerarPdf.tsx` (1057).

**Por qué:** 11 archivos superan 800 líneas (máximo recomendado). Archivos de 1500-2200 líneas mezclan UI, estado, fetching y lógica de negocio. Difíciles de leer, testear y modificar sin romper.

**En qué afecta:** Cambios más rápidos y seguros, menos riesgo de regresiones, código revisable. Base para poder testear (ver 5.2).

### 4.2 Respetar la fachada `lib/api.ts`
- [ ] Auditar que las pages importen desde `@/lib/api` y no directo desde `services/*` (decisión de arquitectura documentada en CLAUDE.md).

**Por qué:** La regla del proyecto dice que pages usan `@/lib/api`. Saltarla acopla la UI a la implementación de services.

**En qué afecta:** Mantiene la capa de abstracción; permite cambiar services sin tocar pages.

### 4.3 Centralizar tipo `Venta` duplicado
- [ ] Unificar el tipo `Venta` (hoy duplicado entre `app/ventas/types.ts` y `hooks/useVentas.ts`).

**Por qué:** Tipos duplicados divergen con el tiempo y causan bugs sutiles de datos.

**En qué afecta:** Un solo lugar de verdad para el modelo de venta; menos errores de tipos inconsistentes.

---

## 5. CALIDAD DE CÓDIGO Y TIPOS

### 5.1 Reducir `any` y reactivar chequeo de tipos
- [ ] Reducir progresivamente los 155 `: any` empezando por services y lib (lógica de negocio/dinero).
- [ ] Quitar el único `@ts-nocheck` (`hooks/useGenerarPdf.tsx`) tras tiparlo.
- [ ] Plan a futuro: poder quitar `typescript.ignoreBuildErrors: true` (NO tocar `next.config.mjs` sin acuerdo — ver CLAUDE.md).

**Por qué:** `ignoreBuildErrors: true` hace que el build pase aunque haya errores de tipos reales. Con 155 `any` y errores ignorados, el compilador no protege contra bugs (ej: pasar un número como string a AFIP).

**En qué afecta:** Detecta bugs en build en vez de en producción, sobre todo en facturación y cálculos de dinero/comisiones.

### 5.2 Introducir tests (no hay ninguno)
- [ ] Empezar por tests unitarios de la lógica crítica sin UI: `lib/facturacion-helper.ts`, cálculo de comisiones (`commissions-service`), `lib/utils/format.ts`, lógica de `useCart`.

**Por qué (consultar framework antes):** El proyecto no tiene tests. La lógica de dinero (facturación AFIP, comisiones, caja, cuenta corriente) no tiene red de seguridad. Cualquier refactor (sección 4) es arriesgado sin tests.

**En qué afecta:** Permite refactorizar con confianza, previene regresiones en cálculos fiscales/financieros. **Requiere acordar** framework (Vitest sería el natural para Next).

---

## 6. UX Y DEVEX

### 6.1 Optimización de imágenes
- [ ] Evaluar habilitar el optimizador de Next (`images.unoptimized: true` está forzado) o usar formatos AVIF/WebP en catálogo/tienda.

**Por qué:** Con `unoptimized: true` se sirven imágenes a tamaño completo. En tienda y catálogo (muchas imágenes) esto pesa en LCP, sobre todo mobile.

**En qué afecta:** Carga más rápida de tienda y catálogo. (Verificar primero por qué se desactivó — puede ser por hosting de imágenes externo.)

### 6.2 Accesibilidad básica
- [ ] Revisar foco de teclado, `aria-label` en botones de íconos, contraste en estados de deuda (amber/rojo) en pedidos.

**Por qué:** Módulos densos (pedidos, caja) usan color como único indicador de estado (deuda/moroso/incobrable). Color solo no es accesible.

**En qué afecta:** Usabilidad para todos los empleados, cumplimiento básico de accesibilidad.

### 6.3 Limpieza de archivos sueltos en raíz
- [ ] Mover/eliminar archivos de prueba y datos de la raíz: `test_remito.jpg`, `pedido-mayorista.xlsx`, `update.js`, `update-clients-taxCategory.js`, `fetch_wiki_images.js`, `proxy.ts`, `spa.traineddata`, `Boleta`.

**Por qué:** Scripts y archivos de datos en la raíz ensucian el repo y confunden sobre qué es código de la app vs utilidades one-off.

**En qué afecta:** Repo más claro; mover scripts a `scripts/` y datos fuera del control de versiones.

### 6.4 Documentar limitación del rate-limit in-memory
- [ ] Documentar (o migrar a futuro) que `lib/rate-limit.ts` se resetea en cada redeploy y no es compartido entre instancias serverless de Vercel.

**Por qué:** En Vercel cada función puede correr en instancias distintas; el límite in-memory es por instancia, no global. Es poco efectivo.

**En qué afecta:** Expectativa realista del rate-limit. Migración futura a Upstash/Redis si se necesita límite real (requiere consultar — librería/servicio nuevo).

---

## Resumen de prioridades

| # | Bloque | Impacto | Esfuerzo | Urgencia |
|---|--------|---------|----------|----------|
| 1.1 | RLS Supabase | Crítico | Medio | YA |
| 1.2 | Validación zod API | Alto | Medio | Alta |
| 1.3 | Verificación de rol | Alto | Bajo | Alta |
| 1.4 | Rate limit faltante | Medio | Bajo | Alta |
| 2.2 | Error/loading boundaries | Medio | Bajo | Media |
| 2.3 | Deps muertas (firebase/puppeteer) | Medio | Bajo | Media |
| 3.1/3.2 | select(*) + paginación | Alto | Medio | Media |
| 4.1 | Dividir archivos gigantes | Alto | Alto | Media |
| 5.1/5.2 | Tipos + tests | Alto | Alto | Media |

**Recomendación de orden de ejecución:** 1.1 → 1.3 → 1.4 → 1.2 → 2.3 → 2.2 → 3.1 → 5.2 (tests de lógica de dinero) → 4.1 (refactor con tests ya cubriendo) → resto.

> Ítems que requieren tu aprobación antes de ejecutar (librerías/servicios nuevos): 3.4 (SWR/TanStack), 5.2 (framework de tests), 6.4 (Redis/Upstash).
