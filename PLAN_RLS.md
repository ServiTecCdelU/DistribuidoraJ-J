# Plan completo para activar RLS sin romper la app

> Estado: **NO ejecutado**. Documento de plan. RLS está **deshabilitado** (rollback aplicado).
> La app vuelve a andar. Este plan describe cómo activarlo bien, por etapas.

## 0. Qué pasó (causa raíz)

Al activar RLS en todas las tablas con una política `for all to authenticated`, la app
**dejó de mostrar datos**. Motivo:

- La app accede a Supabase **directo con la anon key desde el cliente** (23 services
  importan `@/lib/supabase`, el cliente anon). Ver lista en §Apéndice A.
- Con RLS apagado, la anon key tiene **acceso total** → todo funcionaba.
- Con RLS + política `to authenticated`, cualquier request que **no viaje como usuario
  autenticado** entra como rol `anon` y queda **bloqueada**.
- Hay al menos dos focos que acceden como `anon` (sin sesión de usuario):
  1. **Server Components / cargas server-side** que usan el cliente anon: la sesión de
     Supabase Auth vive en el navegador (localStorage), el server no la tiene.
     Páginas server detectadas: `app/pedidos`, `app/tienda`, `app/transporte`, `app/vendedor`.
  2. Posibles lecturas client-side antes de que la sesión esté lista.

**Conclusión:** activar RLS "de una" no es un SQL. Requiere garantizar que **cada** acceso a
datos o (a) viaje autenticado, o (b) pase por una **ruta API con la service role**
(que ignora RLS por diseño). Es trabajo de código + SQL, por fases, probando módulo por módulo.

---

## 1. Objetivo y principios

**Objetivo:** RLS activado en todas las tablas de `public`, con la app 100% funcional, y
acceso mínimo por rol (`admin`, `seller`, público).

**Principios:**
- Nunca dejar el sistema caído: se activa **tabla por tabla**, probando cada una.
- La **service role** (rutas API server-side) es el camino preferido para escrituras y
  para lecturas que hoy corren en server components. Ignora RLS → no se rompe.
- La **anon key con sesión** (`authenticated`) se usa para lecturas/escrituras client-side
  de usuarios logueados, cubiertas por políticas.
- El **público** (tienda) ya pasa por `app/api/public/*` (service role) → no necesita anon.

---

## FASE 0 — Diagnóstico de sesión (bloqueante, hacer primero)

Antes de tocar nada hay que confirmar si las requests client-side llegan como
`authenticated` o `anon`. Define toda la estrategia.

**Cómo verificar (con RLS aún apagado):**
1. Logueado en la app, abrir DevTools → Network → filtrar requests a `*.supabase.co/rest/v1`.
2. Mirar el header `Authorization: Bearer <jwt>`. Pegar el JWT en jwt.io y revisar el claim
   `role`:
   - `role: authenticated` → la sesión se propaga. RLS por rol es viable directo (Fase 2).
   - `role: anon` o sin Bearer de usuario → la sesión **no** llega. Hay que migrar esos
     accesos a rutas API service role primero (Fase 1 ampliada).

**Salida de la fase:** saber, por cada módulo, si lee como `authenticated` o `anon`.

> Sospecha actual (a confirmar): las páginas server (`pedidos`, `tienda`, `transporte`,
> `vendedor`) leen como `anon`. El resto (client-side, logueado) probablemente `authenticated`.

---

## FASE 1 — Preparar el acceso server-side (mover a service role)

Para cada lectura/escritura que en Fase 0 dio `anon` (server components y rutas sensibles):

1. Crear (o reutilizar) una **ruta API** bajo `app/api/...` que use `@/lib/supabase-admin`
   (service role) y verifique sesión/rol con `lib/api-auth.ts`.
2. Cambiar la página/servicio para llamar a esa ruta en vez de `@/lib/supabase` directo.
3. Mantener el envelope estándar de respuesta (`{ success, data, error }`).

Tablas/áreas candidatas a pasar por API (porque se cargan en server o son sensibles):
- `pedidos` (página server) → ya hay `app/api/public/pedidos` para la tienda; falta una
  ruta **protegida** para la vista interna.
- `transporte`, `vendedor` (páginas server) → rutas protegidas de lectura.
- Escrituras de negocio ya cubiertas por RPC/rutas: `ventas/emitir`, `apply-ganancia`,
  `remitos`, `productos/[id]/movimiento`. Revisar que NO haya escrituras client-side
  directas a tablas sensibles (caja, transacciones, comisiones) sin pasar por server.

**Patrón de ruta protegida (ejemplo):**
```ts
// app/api/cuenta-corriente/[clientId]/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/api-auth' // verifica sesión/rol

export async function GET(req: Request, { params }: { params: { clientId: string } }) {
  const auth = await requireAuth(req, ['admin', 'seller'])
  if (!auth.ok) return NextResponse.json({ success: false, data: null, error: 'No autorizado' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('transacciones').select('*').eq('client_id', params.clientId)
  if (error) return NextResponse.json({ success: false, data: null, error: 'Error' }, { status: 500 })
  return NextResponse.json({ success: true, data, error: null })
}
```

---

## FASE 2 — Políticas RLS por rol

Una vez que los accesos `anon` están migrados a service role, se activan políticas finas.

### 2.1 Función helper de rol (una sola vez)

Relaciona el usuario de Supabase Auth con su rol en la tabla `usuarios`
(campo `auth_uid` y `role`, según arquitectura del proyecto):

```sql
create or replace function public.app_role()
returns text
language sql stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.usuarios where auth_uid = auth.uid() limit 1),
    'anon'
  );
$$;
```

### 2.2 Plantilla de políticas por tabla

```sql
-- 1) habilitar RLS
alter table public.<tabla> enable row level security;

-- 2) admin: acceso total
drop policy if exists rls_admin_all on public.<tabla>;
create policy rls_admin_all on public.<tabla>
  for all to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

-- 3) seller: lectura (ajustar por columna de pertenencia donde aplique)
drop policy if exists rls_seller_read on public.<tabla>;
create policy rls_seller_read on public.<tabla>
  for select to authenticated
  using (public.app_role() in ('admin', 'seller'));
```

> La **service role** ignora RLS: las rutas API siguen funcionando sin políticas.

### 2.3 Clasificación de tablas (qué política aplica)

| Tabla | admin | seller | público (anon) | Notas |
|-------|-------|--------|----------------|-------|
| `clientes` | total | lectura + sus clientes (`seller_id`) | solo vía `/api/public/clientes` | piloto |
| `ventas` | total | lectura de las suyas (`seller_id`) | no | |
| `transacciones` | total | lectura ligada a sus clientes | no | cta cte |
| `transacciones_mayorista` | total | no | no | deuda proveedor |
| `caja` | total | no | no | sensible |
| `comisiones` | total | solo las suyas | no | |
| `productos` | total | lectura | `/api/public/productos` | |
| `mayorista_productos` | total | lectura | no | |
| `stock_movimientos` | total | no | no | |
| `pedidos` | total | los suyos | `/api/public/pedidos` | |
| `pedidos_mayorista` | total | no | no | |
| `vendedores` | total | lectura propia | `/api/public/vendedores` | |
| `usuarios` | total | lectura propia (`auth_uid`) | no | **crítico** |
| `listas_precios` | total | lectura | no | |
| `configuracion` | total | lectura | no | alias transfer |
| `auditoria` | total | no | no | |
| `devoluciones` | total | las suyas | no | |
| `gastos_fijos` / `gastos_variables` | total | no | no | finanzas |
| `faltantes` | total | lectura ligada | no | |
| `ajustes_venta` (descuentos) | total | las suyas | no | |
| `hoja_ruta` | total | transportista | no | |

> Para "sus clientes / sus ventas" usar el `seller_id` (o `codigo_vendedor`) comparado con el
> id del usuario logueado. Empezar permisivo (lectura `in ('admin','seller')`) y endurecer
> después; lo importante en el paso 1 es cerrar el acceso público crudo.

---

## FASE 3 — Orden de implementación (piloto → resto)

1. **Piloto: `clientes`.** Activar RLS + políticas solo en esta tabla. Probar: listado de
   clientes, alta/edición, cuenta corriente, tienda pública (`/api/public/clientes`).
   Si algo falla → `alter table public.clientes disable row level security;` y corregir.
2. **Lectura pública:** `productos`, `vendedores`, `pedidos` (confirmar que la tienda usa
   API service role y no anon directo).
3. **Sensibles de admin:** `caja`, `transacciones`, `transacciones_mayorista`, `comisiones`,
   `gastos_*`, `auditoria`, `stock_movimientos`.
4. **Resto:** `ventas`, `mayorista_productos`, `pedidos_mayorista`, `listas_precios`,
   `configuracion`, `devoluciones`, `faltantes`, `ajustes_venta`, `hoja_ruta`, `usuarios`.
5. **`usuarios` al final** y con cuidado: una política mal puesta acá puede dejar a todos
   sin poder resolver su rol (probar login/logout y cambio de rol).

Cada paso: activar → probar el módulo → si rompe, rollback de **esa** tabla y arreglar.

---

## FASE 4 — Verificación

- Supabase → **Advisors → Security**: sin alertas "RLS disabled in public".
- Checklist funcional logueado como **admin**: caja, ventas, nueva venta, pedidos,
  cuenta corriente, productos, mayorista, dashboard, gastos, comisiones, empleados.
- Checklist como **seller**: mis ventas, nueva venta, mis pedidos, mis clientes, comisiones.
- **Tienda pública** (sin login): catálogo, más vendidos, checkout.
- Emisión AFIP, generación de PDF/remito, importación de productos.
- Cron de caja (`/api/cron/reconciliar-caja`) sigue corriendo (usa service role).

---

## FASE 5 — Seguridad complementaria (relacionado)

- **Rotar las API keys** de Supabase (Settings → API): estuvieron sin RLS y hay un secreto
  hardcodeado pendiente en `settings.local.json`. Actualizar `.env.local` y variables en Vercel.
- Confirmar que `SUPABASE_SERVICE_ROLE_KEY` **solo** se usa server-side (nunca en
  `NEXT_PUBLIC_*` ni en cliente).
- Revisar que ninguna ruta `app/api/public/*` exponga datos sensibles (solo lectura segura).

---

## Rollback global (emergencia)

```sql
do $rls$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I disable row level security;', t.tablename);
  end loop;
end
$rls$;
```

Rollback de una sola tabla:
```sql
alter table public.<tabla> disable row level security;
```

---

## Apéndice A — Services que usan el cliente anon (a auditar)

`ajustes-venta-service`, `audit-service`, `auth-service`, `clients-service`,
`cobranzas-service`, `commissions-service`, `dashboard-service`, `devoluciones-service`,
`gastos-service`, `hoja-ruta-service`, `mayorista-cuenta-service`, `mayorista-service`,
`orders-service`, `payments-service`, `price-list-service`, `products-service`,
`rentabilidad-service`, `sales-service`, `sellers-service`, `supabase-helpers`,
`transfer-config-service`, `users-service`.

Por cada uno: clasificar sus llamadas en (a) client-side autenticado → cubre RLS por rol,
(b) server-side / pública → mover a ruta API service role.

## Apéndice B — Rutas API existentes (service role disponible)

Protegidas: `afip/*`, `apply-ganancia`, `drive`, `facturacion/*`, `import-productos`,
`parse-remito`, `productos/[id]/movimiento`, `productos/[id]/stock-history`, `remitos`,
`ventas/emitir`, `cron/reconciliar-caja`.
Públicas (sin auth): `public/clientes`, `public/productos`, `public/pedidos`,
`public/mas-vendidos`, `public/vendedores`.

Faltan rutas protegidas de lectura para las vistas server internas (pedidos, transporte,
vendedor) — ver Fase 1.
