# Plan SaaS Multi-Tenant

> Guía para convertir este proyecto (hoy single-tenant) en un SaaS que venda el
> sistema a múltiples distribuidoras, cada una con sus datos aislados y sus
> funciones a medida, en un solo despliegue.

## Objetivo

- **Muchos clientes, casi iguales** → una sola base de datos y un solo despliegue.
- **Funciones a medida por cliente** que solo ve quien las paga → feature flags por tenant.
- **Datos aislados** → nadie ve los datos de otro.

---

## 1. Modelo elegido: multi-tenant con `tenant_id` + RLS

- Una sola BD Supabase. Cada distribuidora es un **tenant** (fila en tabla `tenants`).
- **Todas** las tablas de negocio llevan columna `tenant_id`.
- Cada query filtra por el tenant del usuario logueado.
- **RLS (Row Level Security) obligatorio**: la base de datos garantiza el
  aislamiento aunque un query se olvide de filtrar.
- Un solo repo, un solo deploy: se arregla un bug una vez y se corrige para todos.

### Por qué NO otras opciones
- **Copia física por cliente (una BD y deploy por cada uno):** no escala pasando
  de ~5-10 clientes. Se reserva solo como excepción para un cliente con algo tan
  distinto que rompe el modelo común.
- **Schema-per-tenant:** demasiado costoso de operar para este caso.

---

## 2. Funciones a medida SIN bifurcar código: feature flags por tenant

Regla de oro: **nunca** hardcodear `if (cliente == "X") hacé Y`. Se vuelve
inmantenible. En su lugar, el código de la feature vive en el repo de todos y
solo se **activa** para quien la pagó.

### Tabla sugerida
```sql
CREATE TABLE tenant_features (
  tenant_id   text NOT NULL REFERENCES tenants(id),
  feature_key text NOT NULL,
  activo      boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, feature_key)
);
```

Ejemplo de datos:
```
tenant_id | feature_key      | activo
patricia  | facturacion_afip | true
otro      | facturacion_afip | false
patricia  | ruteo_mapa       | true
```

### Uso en código
```ts
if (tenant.tieneFeature("ruteo_mapa")) {
  // ...mostrar mapa de ruteo...
}
```

Ventajas:
- El que pagó la ve; los demás no. Sin duplicar código.
- Un solo despliegue: un bug se corrige para todos a la vez.
- Las features se venden como upsell (encaja con el abono mensual por sucursal).

---

## 3. Aislamiento de datos vs. funcionalidad (no confundir)

Son dos cosas distintas:

| Necesidad | Cómo se resuelve |
|-----------|------------------|
| Que las ventas/clientes de un tenant no las vea otro | `tenant_id` + **RLS** (automático) |
| Que un cliente tenga una función que otro no | **feature flags** por tenant |

---

## 4. Qué aplicar — checklist de migración (por fases)

### Fase 0 — Preparación
- [ ] Crear tabla `tenants` (id legible, nombre, branding, estado, plan).
- [ ] Crear tabla `tenant_features` (feature flags).
- [ ] Definir el tenant inicial (la distribuidora actual) y su `tenant_id`.

### Fase 1 — Columna `tenant_id` en todas las tablas de negocio
- [ ] `ventas`, `clientes`, `productos`, `pedidos`, `caja`, `comisiones`,
      `vendedores`, `usuarios`, `auditoria`, `listas_precios`,
      `mayorista_productos`, `stock_movimientos`, `transacciones`,
      `pedidos_mayorista`, `configuracion`, etc.
- [ ] **Backfill**: asignar el `tenant_id` del cliente actual a todos los
      registros existentes.
- [ ] Índices por `tenant_id` en las tablas grandes.

### Fase 2 — RLS (CRÍTICO — hoy está deshabilitado)
- [ ] Habilitar RLS en todas las tablas con `tenant_id`.
- [ ] Política: un usuario solo ve/edita filas de su propio `tenant_id`.
- [ ] Guardar el `tenant_id` del usuario en su claim JWT / perfil para que la
      política lo lea.
- [ ] Verificar que sin RLS bien puesto el multi-tenant es un agujero de
      seguridad (cualquiera vería datos ajenos).

### Fase 3 — Auth con tenant
- [ ] El perfil de usuario (`usuarios`) sabe a qué tenant pertenece.
- [ ] Toda sesión resuelve el tenant activo y filtra por él.
- [ ] Revisar cache de auth (`invalidateAuthCache()`) para no mezclar tenants.

### Fase 4 — Services y rutas API
- [ ] Cada query en `services/` respeta el tenant activo.
- [ ] **`service role` (admin) revisado**: bypassea RLS, así que en rutas API
      server-side hay que inyectar siempre el `tenant_id` correcto a mano.
- [ ] Rutas públicas (`app/api/public/*`) deben resolver el tenant por dominio
      o parámetro, no exponer datos cruzados.

### Fase 5 — Feature flags
- [ ] Helper `tieneFeature(tenant, key)`.
- [ ] Reemplazar cualquier lógica a medida por chequeos de feature flag.

### Fase 6 — Branding y config por tenant
- [ ] Logo, nombre, colores, datos de contacto por tenant (la tabla
      `configuracion` ya usa el patrón `key`, extenderla con `tenant_id`).
- [ ] Resolución de tenant por dominio/subdominio
      (`patricia.tuapp.com`, `otro.tuapp.com`) o por selección tras login.

### Fase 7 — Onboarding de nuevo tenant
- [ ] Alta de distribuidora: crear tenant + admin inicial + config + features.
- [ ] Flujo repetible para no hacerlo a mano cada vez.

### Fase 8 — AFIP por tenant (LO MÁS DELICADO)
- [ ] Hoy el CUIT / punto de venta / certificado están en variables de entorno
      (`BIT_INGENIERIA_*`), atados a una sola empresa.
- [ ] Multi-tenant necesita esos datos **por tenant en la BD**, no en `.env`:
      cada distribuidora factura con **su propio CUIT y certificado AFIP**.
- [ ] Almacenar certificados AFIP de forma segura (no en el repo, no en env
      global; cifrados / en storage protegido).
- [ ] Adaptar `lib/facturacion-helper.ts` para tomar credenciales del tenant.
- [ ] Es la parte más sensible: no solo lógica, también legal/fiscal.

---

## 5. Riesgos principales

1. **AFIP/facturación**: cada tenant factura con su CUIT y certificado propio.
   Migrar de env vars global a credenciales por tenant es lo más complejo y
   riesgoso (fiscal + seguridad).
2. **RLS mal aplicado**: si falta una política o un query admin no filtra,
   se filtran datos entre clientes. Testear el aislamiento en serio.
3. **Backfill**: asignar mal el `tenant_id` a datos existentes mezcla información.
4. **`service role`**: bypassea RLS; todo uso server-side debe inyectar el tenant.

---

## 6. Resumen de la decisión

> **Modelo B (tenant_id + RLS) + feature flags por tenant.**
> Cubre "muchos clientes casi iguales" y "funciones a medida sin que los demás
> las vean", todo en un solo despliegue. Las funciones a medida se activan por
> flag, nunca bifurcando código. Lo más delicado es AFIP (credenciales por
> tenant). Prerrequisito bloqueante: habilitar RLS (hoy deshabilitado).
