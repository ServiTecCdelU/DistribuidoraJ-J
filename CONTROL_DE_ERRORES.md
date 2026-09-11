# Control de errores

> Errores encontrados y corregidos el **10/09/2026**, a partir del remito `R-2026-01782`
> (PANADERIA TIKI), donde se cobraron $20.758,70 que no figuraban en el detalle de la venta.
>
> **Este documento está pensado para auditar otro proyecto derivado de este.** Cada error
> trae cómo detectar si está presente, qué archivo copiar y qué datos hay que corregir.
>
> Empezá por el [Camino rápido](#camino-rápido).

---

## Camino rápido

Si el otro proyecto es un clon, lo más eficiente es:

**1. Copiar el script de salud de datos y correrlo.** Te dice en un minuto cuáles de estos
errores dejaron rastro en la base:

```bash
# copiar desde este proyecto
lib/utils/health-checks.ts
lib/utils/health-checks.test.ts
lib/utils/paginar.ts          # health-checks lo usa
lib/utils/items-pedido.ts     # health-checks lo usa
lib/utils/clave-linea.ts      # health-checks lo usa
lib/utils/caja-desglose.ts    # health-checks lo usa
scripts/health-check.ts
scripts/run-ts.mjs

# agregar a package.json
"health": "node scripts/run-ts.mjs scripts/health-check.ts"

npm run health
```

**2. Revisar los errores 1 a 6** (los de dinero) con los greps de cada sección.

**3. El resto** son mejoras: aplicá las que te sirvan.

> El script solo lee, no modifica nada.

---

## Tabla de errores

| # | Error | Gravedad | ¿Deja rastro en los datos? |
|---|---|---|---|
| 1 | Ajuste de cantidad aplicado por producto en vez de por renglón | 🔴 Plata | Sí |
| 2 | La caja informa lo facturado en vez de lo cobrado | 🔴 Plata | Sí |
| 3 | Campos de cobro que el mapper nunca expone | 🔴 Plata | No |
| 4 | Items duplicados al reemplazar un producto | 🟠 Causa del #1 | Sí |
| 5 | Conversión de pago que deja montos fantasma | 🟠 Plata | Sí |
| 6 | Consultas truncadas en 1000 filas | 🔴 Datos incompletos | No |
| 7 | Paginación sin orden único: filas repetidas y salteadas | 🔴 Datos incorrectos | No |
| 8 | Stock comparado contra el total en cada renglón | 🟠 Operativo | No |
| 9 | Ediciones por producto sobre renglones distintos | 🟡 Plata | No |
| 10 | Eliminar un pedido lo borra sin dejar rastro | 🟠 Trazabilidad | Irreversible |
| 11 | Los items se reescriben sin registro de qué cambió | 🟡 Trazabilidad | No |
| 12 | La caja mezcla rotura con faltante | 🟡 Reporte engañoso | No |

---

## 1. 🔴 Ajuste de cantidad aplicado por producto, no por renglón

**Qué pasa.** Al cobrar un pedido, un ajuste de N unidades (rotura, faltante, devolución) se
resta a **cada** renglón que tenga ese producto. Si el producto está en dos renglones,
descuenta el doble.

**El caso real.** Yerba en dos renglones de 10. Rotura de 10 → restó 10 a cada uno → los dos
quedaron en 0 y se borraron. Descontó 20 en vez de 10. El cliente pagó $193.675 y la venta
quedó en $172.917.

**Cómo saber si lo tenés.** Buscá el cálculo de items ajustados al cobrar:

```bash
grep -rn "adjByProduct\|totalDeduccion" app/ --include=*.tsx
```

Si aparece un patrón como este, está presente:

```js
const adj = adjByProduct.get(item.productId)
return { ...item, quantity: item.quantity - totalDeduccion }  // ← a CADA renglón
```

**Arreglo.** Copiar `aplicarAjustesAItems()` de `lib/utils/stock-remito.ts`. Consume la
cantidad renglón por renglón hasta agotarla.

**Datos.** El chequeo 1 de `npm run health` lista las ventas afectadas.

---

## 2. 🔴 La caja informa lo facturado en vez de lo cobrado

**Qué pasa.** Para pagos `cash`, la caja suma `total` de la venta e ignora los montos
realmente cobrados. Cualquier diferencia entre lo que entró y lo que se facturó queda
invisible, y la caja cierra con `difference: 0` aunque no cierre.

**Por qué es el más peligroso.** No causa el descuadre: lo **esconde**. Sin él, el error #1
se hubiera visto el mismo día.

**Cómo saber si lo tenés.**

```bash
grep -rn "payment_type === \"cash\"\|payment_type === 'cash'" app/ --include=*.tsx --include=*.ts
```

Si ves esto, está presente:

```js
if (s.paymentType === "cash") {
  if (method === "transferencia") transferTotal += s.total   // ← usa total
}
```

**Ojo:** revisá **todos** los lugares. Acá estaba duplicado en cuatro: el PDF de caja, los
totales del día, el modal de cierre y el cron de reconciliación.

**Arreglo.** Copiar `lib/utils/caja-desglose.ts` (`desglosePago` y `agregarDesglose`) y usarlo
en todos. Acepta camelCase y snake_case, así lo comparten la pantalla y el cron.

`agregarDesglose` devuelve `desvio` (cobrado − facturado): conviene asentarlo en las notas del
cierre para que el descuadre quede escrito.

**Datos.** Chequeo 2 de `npm run health`, y el 6 para las cajas ya cerradas con totales viejos.

---

## 3. 🔴 Campos de cobro que el mapper nunca expone

**Qué pasa.** La base tiene `efectivo_amount` y `transferencia_amount`, pero el mapper de
ventas no los convierte, así que el código los lee como `undefined` **siempre**. El desglose
de pagos mixtos cae al fallback en el 100% de los casos.

**Cómo saber si lo tenés.**

```bash
grep -n "efectivo_amount\|transferencia_amount" services/sales-service.ts
grep -n "efectivoAmount\|transferenciaAmount" lib/types.ts
```

Si el primero solo aparece en queries y el segundo no aparece, está presente.

Síntoma en el consumidor: accesos en snake_case sobre objetos camelCase.

```js
const efectivoAmt = (s as any).efectivo_amount ?? cashAmt   // ← siempre undefined
```

**Arreglo.** Agregar los dos campos al tipo `Sale` y al mapper, con `!= null` y no
truthy-check: un cobro de **$0 es un dato válido**, no un campo ausente.

```ts
efectivoAmount: d.efectivo_amount != null ? Number(d.efectivo_amount) : undefined,
```

---

## 4. 🟠 Items duplicados al reemplazar un producto

**Qué pasa.** Al reemplazar una marca por otra que **ya está** en el pedido, se crea un
segundo renglón con el mismo `productId` en vez de sumar al existente. Es la causa raíz del
error #1.

**Cómo saber si lo tenés.**

```bash
grep -rn "replacements\[" app/ --include=*.tsx
```

Si el `.map()` de reemplazos no consolida después, está presente. Detectá los datos con el
chequeo 3 de `npm run health`.

**Arreglo.** Copiar `consolidarItems()` de `lib/utils/items-pedido.ts` y aplicarlo en **las
tres puertas de entrada**:

- creación del pedido (`services/orders-service.ts`)
- API pública de pedidos, si existe (el body es externo, no se confía)
- armado del remito, después de aplicar los reemplazos

**Regla importante:** consolidar **solo** si coinciden producto, precio y descuento. A distinto
precio son dos renglones deliberados y fusionarlos cambiaría lo que se le cobra al cliente.

**Extra de UI.** Al elegir un reemplazo que ya está en el pedido, mostrar *"Ya hay N en el
pedido — queda M en un solo renglón"*.

---

## 5. 🟠 Conversión de pago que deja montos fantasma

**Qué pasa.** Cuando el admin pasa una venta a cuenta corriente, se limpia `cash_amount` pero
**no** `efectivo_amount` ni `transferencia_amount`. Queda plata anotada como cobrada que nunca
entró. Y al revés: al pasar a contado no se cargan, así que un residuo anterior sobrevive.

**Por qué importa más después de arreglar el #2.** Antes, esos campos se ignoraban y el residuo
era inofensivo. Una vez que la caja empieza a confiar en ellos, un residuo mueve plata de
columna.

**Cómo saber si lo tenés.**

```bash
grep -rn "payment_type: 'credit'\|payment_type: \"credit\"" services/ --include=*.ts
```

Mirá si el update que pasa a `credit` limpia los tres montos. Si solo limpia `cash_amount`,
está presente.

**Arreglo.** Copiar `camposConversionPago()` de `lib/utils/conversion-pago.ts`. Define el
estado completo en ambas direcciones:

- **a cuenta corriente** → los tres montos en `null`, no entró plata
- **a cobrada** → el monto al medio elegido, el otro en `null`, sin residuos

**Datos.** Chequeo 4 de `npm run health`. Acá eran 25 ventas. Se limpian poniendo los montos
en `null` (la deuda ya está bien registrada en `transacciones`; verificalo antes).

---

## 6. 🔴 Consultas truncadas en 1000 filas

**Qué pasa.** PostgREST corta en **1000 filas** por defecto: devuelve 1000 **sin error y sin
aviso**. El código toma el resultado como completo.

**No es teórico.** Acá ya estaba pasando: `getSales()` devolvía 1000 de 1685 y las pantallas de
Clientes y Reportes calculaban sobre el 59% de las ventas.

**Cómo saber si lo tenés.** Primero, qué tablas superan el límite:

```sql
select 'ventas' t, count(*) from ventas
union all select 'pedidos', count(*) from pedidos
union all select 'productos', count(*) from productos
union all select 'transacciones', count(*) from transacciones
union all select 'stock_movimientos', count(*) from stock_movimientos;
```

Después, las consultas sin límite sobre esas tablas:

```bash
grep -rn "\.select(" services/ app/api/ --include=*.ts \
  | grep -vE "\.range\(|\.limit\(|\.single\(|\.maybeSingle\(|count:|head:"
```

Prestá atención a las funciones tipo `getAll` / `getSales` / `getOrders`, que traen todo.

**Arreglo.** Copiar `lib/utils/paginar.ts` y usar `paginarTodo()`:

```ts
const ventas = await paginarTodo((desde, hasta) =>
  supabase.from('ventas').select('*')
    .order('created_at').order('id')   // ← ver error #7
    .range(desde, hasta)
)
```

Recibe **una función**, no una query: el query builder de Supabase se consume al ejecutarse y
hay que crear uno nuevo por página.

**Revisá también el cron de caja**, si lo tenés. Puede estar funcionando hoy de casualidad por
estar debajo del límite.

---

## 7. 🔴 Paginación sin orden único

**Qué pasa.** Paginar no alcanza si el `ORDER BY` no es único. Con filas que comparten el valor
de orden, Postgres no garantiza la misma secuencia entre páginas: **repite unas y saltea otras**.

**El caso real.** 155 productos comparten `created_at` (importación en lote). `getProducts()`
devolvía 2282 filas pero solo **2225 IDs distintos**: 57 duplicados y 57 que no aparecían nunca.
Ya pasaba con un bucle de paginación hecho a mano.

**Cómo saber si lo tenés.**

```sql
select created_at, count(*) from productos
group by created_at having count(*) > 1
order by count(*) desc limit 5;
```

Si hay grupos grandes, cualquier paginación por `created_at` sin desempate está devolviendo mal.

Para confirmarlo, paginá y comparé el total contra los IDs únicos.

**Arreglo.** Agregar un desempate por una columna única en **todas** las paginaciones:

```ts
.order('created_at', { ascending: false })
.order('id', { ascending: true })        // ← desempate
```

---

## 8. 🟠 Stock comparado contra el total en cada renglón

**Qué pasa.** Al verificar stock antes de armar el remito, cada renglón compara su cantidad
contra el stock **total** del producto. Dos renglones de 10 contra un stock de 15 dan "alcanza"
las dos veces, cuando faltan 5.

**Cómo saber si lo tenés.**

```bash
grep -rn "stock: stockMap.get\|stock < qty\|i.stock <" app/ components/ --include=*.tsx
```

**Arreglo.** Copiar `repartirStockDisponible()` de `lib/utils/stock-check.ts`. Cada renglón ve
lo que dejan los anteriores del mismo producto.

---

## 9. 🟡 Ediciones por producto sobre renglones distintos

**Qué pasa.** Cantidad, descuento, reemplazo y exclusión se indexan por `productId`. Cuando el
mismo producto está en dos renglones a **distinto precio** (deliberado, ver #4), editar uno
afecta a los dos.

**Cómo saber si lo tenés.**

```bash
grep -rn "quantities\[\|discounts\[\|excludeProductIds" app/ components/ --include=*.tsx
```

Si las claves son `productId`, está presente.

**Arreglo.** Copiar `lib/utils/clave-linea.ts`. La clave es **producto + precio + descuento**,
el mismo criterio con el que `consolidarItems` decide qué fusionar: dos renglones que sobreviven
a la consolidación siempre tienen claves distintas.

Migrar el estado del modal y el pipeline de ediciones a esa clave, aceptando `productId` como
fallback para no romper llamadas existentes.

---

## 10. 🟠 Eliminar un pedido lo borra sin dejar rastro

**Qué pasa.** El pedido se borra de la base. Se pierde quién lo hizo, cuándo y por qué. Es
irreversible: si pasó, esos datos no vuelven.

**Cómo saber si lo tenés.**

```bash
grep -rn "deleteOrder\|\.delete()" services/orders-service.ts
```

**Arreglo.** Anulación en vez de borrado.

```sql
ALTER TABLE pedidos
  ADD COLUMN anulado_at     timestamptz,
  ADD COLUMN anulado_por    text,
  ADD COLUMN anulado_motivo text;
```

Copiar `lib/utils/anulacion-pedido.ts` y `components/pedidos/anulados-panel.tsx`, y:

- `cancelOrder()` reemplaza a `deleteOrder()`, que **deja de exportarse** desde la fachada — si
  queda expuesto, alguien lo vuelve a usar
- **motivo obligatorio**: es el dato que se perdía
- mantener la reposición de stock que hacía el borrado
- no permitir anular un pedido **cobrado** (ya tiene venta, caja y comisión), ni uno rechazado,
  ni anular dos veces
- `anulado` ≠ `rechazado`: el rechazo lo decide el cliente y es información comercial; la
  anulación corrige un error de carga. Mezclarlos ensucia el análisis de rechazos

Verificá antes si la columna `status` tiene un CHECK constraint. Acá no tenía y el valor nuevo
entró sin migración.

---

## 11. 🟡 Los items se reescriben sin registro de qué cambió

**Qué pasa.** Los items de un pedido se pisan en varios momentos (armado del remito, edición de
descuentos, ajustes al cobrar) y ninguno deja rastro. Cuando aparece una inconsistencia, no hay
forma de saber cómo llegó ahí.

**Consecuencia real:** no se pudo determinar si la yerba se duplicó al cargar el pedido o al
reemplazar una marca. El array se reescribió sin registro.

**Arreglo.** Copiar `lib/utils/diff-items.ts` y registrar en auditoría en los tres puntos. El
texto queda así:

> YERBA X 500G MAÑANITA 20 → 21; quitó KETCHUP HELLMANNS 30U X 60GR x1

El diff agrupa por producto antes de comparar: si no, con renglones duplicados un cambio real
queda escondido detrás de la duplicación.

Acordate de agregar las acciones nuevas al tipo de auditoría **y** a la pantalla que las
traduce.

---

## 12. 🟡 La caja mezcla rotura con faltante

**Qué pasa.** El helper de incidencias de caja suma rotura + faltante bajo "pérdida". El
faltante **no es plata perdida**: la mercadería vuelve al depósito.

**El caso real.** Un día mostraba $59.766 de pérdida cuando lo perdido eran $17.331 y el resto
($42.435) eran faltantes. Casi el triple.

**Cómo saber si lo tenés.**

```bash
grep -rn "perdida: rotura + faltante\|devolucion" lib/utils/incidencias.ts
```

**Arreglo.** Usar la vista que separa los tres motivos (**Pérdida / Faltante / Rechazo**) en el
card de caja, en el detalle del historial y en la tabla de ventas.

Además: si el card de pérdidas se alimenta de transacciones filtradas por `[ROTURA]`, los
faltantes y rechazos **nunca aparecen**. Calculalo desde los `items_no_entregados` de las ventas.

---

## Kit de archivos portables

Lógica pura, sin dependencias del proyecto más allá de sí misma. Cada uno con su `.test.ts`:

| Archivo | Resuelve |
|---|---|
| `lib/utils/paginar.ts` | #6 |
| `lib/utils/items-pedido.ts` | #4 |
| `lib/utils/clave-linea.ts` | #9 |
| `lib/utils/stock-check.ts` | #8 |
| `lib/utils/remito-edicion.ts` | #4, #9 |
| `lib/utils/caja-desglose.ts` | #2 |
| `lib/utils/conversion-pago.ts` | #5 |
| `lib/utils/anulacion-pedido.ts` | #10 |
| `lib/utils/diff-items.ts` | #11 |
| `lib/utils/health-checks.ts` | detección de todos |
| `lib/utils/ts-baseline.ts` | herramienta |
| `scripts/health-check.ts` | `npm run health` |
| `scripts/ts-check.ts` | `npm run typecheck` |
| `scripts/run-ts.mjs` | corre TS del proyecto sin sumar dependencias |

`aplicarAjustesAItems()` (#1) vive en `lib/utils/stock-remito.ts`, junto a la lógica de stock
que ya existía.

---

## Orden sugerido

1. **#6 y #7** (paginación) — si están, todo lo demás se mide sobre datos incompletos
2. **#3** (mapper) — el #2 depende de que esos campos existan
3. **#2** (caja informa lo cobrado) — deja de esconder descuadres
4. **#5** (residuos) — hacelo junto con el #2; sin él, el #2 puede mover plata de columna
5. **#1 y #4** (ajuste por renglón y duplicados) — el bug de dinero y su causa
6. **#8, #9, #12** — operativos
7. **#10 y #11** — trazabilidad
8. Correr `npm run health` y corregir los datos que queden

---

## Recomendaciones generales

**Validar el invariante al guardar.** Los dos bugs de dinero compartían firma: la suma de los
items no coincidía con el total y nadie se enteraba.

```
suma(items) == total                          → bloquear si no
total == efectivo + transferencia + crédito   → avisar si no
```

**No confiar en el conteo total de errores de TypeScript.** Si el proyecto usa
`ignoreBuildErrors`, congelá el baseline **por archivo**. Con el total, un error nuevo queda
tapado por otro resuelto: pasó acá, 99 errores antes y 99 después.

**Cuidado con los errores tragados.** `.catch(() => {})` en flujos de cobro esconde fallas de
guardado. Que al menos loguee.

**Extraer la lógica de negocio a funciones puras.** Todo lo de este documento se pudo testear
sin base ni React porque salió del componente. Los archivos del kit son la prueba: 373 tests
que corren en un segundo y medio.
