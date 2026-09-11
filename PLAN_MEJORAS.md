# Plan de mejoras

> Relevado el **10/09/2026**, a partir de la investigación del remito `R-2026-01782`
> (PANADERIA TIKI), donde se cobraron $20.758,70 que no figuraban en el detalle de la venta.
> Cada punto tiene evidencia concreta, no es una lista genérica de buenas prácticas.
>
> Lo que ya se corrigió en esa sesión está al final, en [Anexo: lo ya resuelto](#anexo-lo-ya-resuelto).

---

## 🔴 Prioridad 1 — Riesgo real y presente

### 1.1 RLS deshabilitado

Sin políticas, cualquiera con la anon key lee y escribe toda la base: clientes, precios,
ventas, deudas.

**No es un SQL de una línea.** El intento anterior rompió la app y se hizo rollback. El
análisis de causa raíz y el plan por fases están en **[PLAN_RLS.md](PLAN_RLS.md)** — leer eso
antes de tocar nada.

Es lo más importante del documento, pero necesita una tarde dedicada.

---

### 1.2 `ignoreBuildErrors: true` con 99 errores de TypeScript

**Evidencia:** el commit `1da799b` usó la acción de auditoría `order_cancelled` sin agregarla
al tipo `AuditAction`. El compilador lo marcó y el commit pasó igual. Se encontró por
casualidad al día siguiente. Con la bandera activa, el registro de auditoría podía fallar en
silencio.

Agrava el problema haber verificado comparando el **total** de errores: eran 99 antes y 99
después, porque entró uno y salió otro. El total no sirve como chequeo.

**Acción (incremental, no un big bang):**

1. Script que guarde el baseline de errores **por archivo** y falle si alguno sube.
2. Bajar archivo por archivo, empezando por los que mueven plata:
   `hooks/useCart.ts` (20), `services/dashboard-service.ts` (5), `lib/api.ts` (4).
3. Cuando llegue a cero, sacar la bandera de `next.config.mjs`.

**Esfuerzo:** el script ~1 h. La limpieza, incremental.

```bash
# baseline por archivo
node node_modules/typescript/bin/tsc --noEmit 2>&1 \
  | grep "error TS" | sed 's/(.*//' | sort | uniq -c | sort -rn
```

---

### 1.3 Consultas sin paginar (bomba de tiempo)

PostgREST corta en **1000 filas** por defecto, sin error y sin aviso.

**Evidencia:** durante la auditoría de cajas, una consulta sin paginar devolvió 1000 de 1672
ventas y produjo un diagnóstico falso de 63 cajas rotas. Eran 38.

El cron de reconciliación (`app/api/cron/reconciliar-caja/route.ts:97`) hace la misma consulta
sin paginar. Hoy trae 572 filas en su ventana de 31 días, así que **funciona por poco margen**.
Cuando el volumen llegue a ~33 ventas/día, va a truncar en silencio y las cajas van a cerrar
con totales incompletos.

**Acción:** helper `selectAll()` que pagine con `.range()`, y usarlo en el cron, reportes y
toda consulta sin `.limit()` explícito.

**Esfuerzo:** ~30 min. Es la mejor relación costo/beneficio del documento.

---

## 🟠 Prioridad 2 — Lo que hizo posible los bugs

### 2.1 Invariantes de venta sin validar

Los dos bugs de dinero de esta sesión compartían firma: **la suma de los items no coincidía
con el total y nadie se enteraba.**

El cierre de caja ahora expone `desvio`, pero es tardío: avisa a las 23:00 del día siguiente.

**Acción:** validar al guardar.

```
suma(items) == total                          → bloquear si no
total == efectivo + transferencia + crédito   → avisar si no
```

Con tests sobre `processSale` y el flujo de cobro. Hubiera atajado los $25.399,94 antes de
llegar a la caja.

---

### 2.2 Script permanente de salud de datos

En la sesión se escribieron ~15 consultas de diagnóstico de un solo uso. Seis merecen quedar
fijas:

| Chequeo | Qué detecta |
|---|---|
| `suma(items) ≠ total` | Ventas con detalle incompleto |
| `cobrado ≠ total` | Descuadres de caja |
| Mismo `productId` en dos renglones | Duplicación de items |
| Caja cerrada ≠ recálculo | Cajas desactualizadas |
| `payment_type=credit` con monto cobrado | Residuos de conversión de pago |
| Dos cajas el mismo día | Duplicación de cajas |

**Acción:** `scripts/health-check.js` que las corra y devuelva un reporte. Los `scripts/diag-*`
existentes son la misma idea pero descartables; esto es el permanente.

**Esfuerzo:** ~2 h, y convierte el trabajo de la sesión en algo reutilizable.

---

### 2.3 `app/pedidos/page.tsx` — 2.476 líneas

`.claude/rules/code-style.md` fija 800 como máximo. Es el archivo donde estaban casi todos los
bugs de la sesión, y no es casualidad: concentra cobro, remito, stock, faltantes, hojas de
ruta, anulación y filtros.

Ya se le extrajeron ~100 líneas a `lib/utils/` (`stock-remito`, `items-pedido`, `stock-check`,
`remito-edicion`, `diff-items`, `anulacion-pedido`).

**Acción, sin reescribir lo que funciona:**

- `useCobroPedido()` — flujo de cobro
- `useRemito()` — generación y stock

**Criterio:** cada vez que se toque el archivo, extraer una pieza. No un refactor de una semana.

---

## 🟡 Prioridad 3 — Deuda que molesta

### 3.1 Errores tragados en silencio

Hay varios `.catch(() => {})` y `.then(() => {}).catch(() => {})` en el flujo de cobro. Si
falla el guardado de `items_no_entregados` o el registro de auditoría, no se entera nadie.

**Acción:** un `logSilencioso(contexto, error)` que al menos escriba a consola en dev.

---

### 3.2 Cajas duplicadas el mismo día

Se detectaron pares con números idénticos:

```
caja_20260708_1 / _2      caja_20260723_1 / _2      caja_20260724_1 / _2
caja_20260725_1 / _2      caja_20260728_1 / _2
```

**Sin investigar.** Probable carrera entre el cron y la apertura manual, o el cron corriendo
dos veces. Si se duplican cajas, se duplican los reportes.

---

### 3.3 Las 3 cajas de junio con ventas faltantes

```
caja_20260602_1   18 ventas → 17
caja_20260603_1   24 ventas → 20
caja_20260604_1   20 ventas → 14
```

Son las únicas cerradas a mano. Se decidió no recalcularlas, pero **no se sabe por qué
desaparecieron esas ventas**. Si el mecanismo sigue activo, puede repetirse.

**Consulta puntual:** ¿esas ventas existen sin `remito_number`, o no existen?

---

### 3.4 Dependencias sin uso

`firebase` y `firebase-admin` siguen en `package.json` sin usarse. Peso de instalación y
superficie de dependencias sin razón.

---

### 3.5 Documentación que apunta a archivos borrados

`CLAUDE.md` referencia `PLAN_MIGRACION_SUPABASE.md` y `CLAUDE.local.md` referenciaba este
`PLAN_MEJORAS.md`, borrado en el commit `2250523`. Conviene revisar esas referencias.

---

## 🟢 Prioridad 4 — Calidad

### 4.1 Auditoría más allá de pedidos

Los pedidos ya quedan trazados (commit `66fcf7a`). **Las ventas no**: si alguien cambia el
tipo de pago, el descuento o el total, no queda registro de quién ni cuándo. Es exactamente el
agujero que tenían los pedidos.

### 4.2 Cobertura de tests

De 0 a 333 en la sesión, pero todos nacidos de estos bugs. Zonas sin cobertura que mueven
plata: `processSale`, `lib/facturacion-helper.ts`, `hooks/useCart.ts`.

### 4.3 `.next` bloqueado en Windows (entorno, no proyecto)

`npm run build` falla con `EBUSY` sobre `.next/build/chunks/*.js.map`. No hay `next dev`
corriendo; los candidatos son `SearchIndexer` / `SearchProtocolHost`.

**Solución:** excluir la carpeta del proyecto en Configuración → Buscar → Búsqueda en Windows.

**Workaround mientras tanto** — buildear en un worktree limpio:

```bash
git worktree add %TEMP%\buildcheck HEAD --detach
robocopy node_modules %TEMP%\buildcheck\node_modules /E /MT:16
cd %TEMP%\buildcheck && npm run build
```

> Un junction a `node_modules` **no sirve**: Turbopack lo rechaza con
> `Symlink [project]/node_modules is invalid, it points out of the filesystem root`.

---

## Por dónde empezar

Tres cosas para una semana, en orden:

1. **Helper de paginación** (30 min) — evita un bug futuro invisible
2. **Script de salud de datos** (2 h) — hace permanente el trabajo de la sesión
3. **Baseline de errores TS** (1 h) — frena la sangría sin pedir arreglar 99 cosas

RLS es más importante que las tres, pero es un proyecto aparte: ver [PLAN_RLS.md](PLAN_RLS.md).

---

## Anexo: lo ya resuelto

Cerrado en la sesión del 10/09/2026. Sirve como contexto de por qué existe cada punto de arriba.

### Código (commits `bfa2b99` → `788f555`)

| Bug | Corrección |
|---|---|
| Un ajuste de N unidades se restaba a **cada** renglón con ese producto | `aplicarAjustesAItems()` consume renglón por renglón |
| Caja informaba el total facturado, no lo cobrado | `lib/utils/caja-desglose.ts`, unificado entre pantalla y cron |
| `mapSale` nunca exponía `efectivo_amount` / `transferencia_amount` | Agregados al tipo y al mapper |
| Reemplazar por un producto ya presente duplicaba el renglón | `consolidarItems()` en las tres puertas de entrada |
| El stock se comparaba contra el total en cada renglón | `repartirStockDisponible()` |
| Pasar una venta a cuenta corriente dejaba montos cobrados fantasma | `camposConversionPago()` |
| Editar un renglón afectaba a otro del mismo producto | `claveLinea()` (producto+precio+descuento) |
| Los items se reescribían sin dejar rastro | `diffItems()` + auditoría en los 3 puntos |
| Eliminar un pedido lo borraba sin registro | Anulación con motivo, responsable y fecha |
| Caja fusionaba rotura + faltante bajo "pérdida" | Tres categorías separadas |

**333 tests en 32 archivos.** Build verificado.

### Datos corregidos en producción

| Qué | Detalle |
|---|---|
| 2 ventas | N1656 → $193.675,41 · N937 → $238.241,66 (items = total = cobrado) |
| Yerba del remito 01782 | Reclasificada de rotura a **faltante**, pérdida ajustada a −$25.789,36, 10 u repuestas al stock |
| 35 cajas | Recalculadas. Verificación posterior: 0 descuadradas |
| 25 ventas | Residuos de conversión de pago limpiados |
| 22 pedidos | Items consolidados, sin cambiar ningún total |

Backups de cada corrección en `%TEMP%\backup-*.json`.
