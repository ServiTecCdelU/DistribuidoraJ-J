# Código de vendedor y vínculo cliente↔vendedor — Diseño

Fecha: 2026-06-09

## Problema

Los vendedores se identifican con un número que hoy está embebido en el `name`
(ej. `ADRIAN (3)`). No existe un campo de código propio. Además, la relación
cliente↔vendedor (`clientes.seller_id`) está incompleta: hay un CSV externo
(`clientes_Nueva Zona.csv`) que indica qué cliente pertenece a qué vendedor vía
un `codigo_vendedor` (`03`, `04`, `07`), pero ese dato nunca se cargó al sistema.

Se necesita:
1. Un `codigo_vendedor` legible y propio en cada vendedor.
2. Asignar el vendedor correcto a cada cliente existente, tomando el CSV como fuente.
3. Que ventas, caja, pedidos, cuenta corriente y comisiones queden ligados al
   vendedor correcto (ya se relacionan por `seller_id`; basta con poblarlo bien).
4. Que un cliente creado por un vendedor quede automáticamente ligado solo a él.

## Decisiones de diseño

- **El vínculo interno sigue siendo `seller_id`** (FK a `vendedores.id`). NO se
  reemplaza por `codigo_vendedor`. `codigo_vendedor` es un atributo legible y la
  clave de cruce con datos externos. Evita refactor de ventas/pedidos/caja/comisiones.
- **`codigo_externo` en `clientes`**: guarda el código del CSV (`106`, `121`...),
  estable en el tiempo. Es el código "real" del cliente en el sistema viejo; sirve
  como llave durable para futuras reimportaciones (los nombres cambian, el código no).
- **El `codigo` interno de BD (`C-0077`) NO se toca** — es una secuencia autogenerada
  distinta del código del CSV.

### Hallazgo que condicionó el diseño

El `codigo` de BD (`C-NNNN`) NO coincide con el `codigo` del CSV: son numeraciones
independientes (match numérico = 0 nombres correctos). El único cruce CSV↔BD posible
hoy es **por nombre normalizado**, que matchea **274 de 276** clientes. Por eso el
import inicial cruza por nombre una sola vez y, de paso, persiste `codigo_externo`
para que a futuro el cruce sea por código.

## Componentes

### 1. Migración SQL (la ejecuta el usuario antes de mergear código)

```sql
ALTER TABLE vendedores ADD COLUMN codigo_vendedor text;
ALTER TABLE clientes  ADD COLUMN codigo_externo  text;
CREATE INDEX IF NOT EXISTS idx_clientes_codigo_externo ON clientes(codigo_externo);
```

### 2. Scripts de carga única (`scripts/`, ejecución manual con node)

**`backfill-codigo-vendedor.cjs`**
- Lee todos los vendedores. Extrae el primer número entre paréntesis del `name`
  (`/\((\d+)\)/`) → `codigo_vendedor` (sin ceros a la izquierda, ej. `3`).
- `ADRIAN (3)`→`3`, `NICOLAS (4)`→`4`, `LEONARDO (7)`→`7`. Sin número
  (`JOAQUIN (REPARTO)`, `ServiTec`) → queda `null`.
- **El `name` no se modifica.** Reporta el resultado por vendedor.

**`import-clientes-vendedor.cjs`**
- Carga el mapa `codigo_vendedor(num) → vendedor.id` (parseInt para comparar `03`=`3`).
- Lee `clientes_Nueva Zona.csv` (encoding `latin1`, separador `;`, campos entre comillas).
- Por fila: normaliza nombre (lowercase, sin acentos, sin no-alfanum) y matchea
  contra clientes de BD por nombre. Si matchea, setea `codigo_externo` = `codigo`
  del CSV y `seller_id` = id del vendedor cuyo `codigo_vendedor` == `codigo_vendedor`
  del CSV (comparación numérica).
- Imprime: clientes no encontrados por nombre (los ~2) y códigos de vendedor del CSV
  sin vendedor en BD (no debería haber: 3, 4, 7 existen). No crea clientes.

### 3. Capa de datos

- **`lib/types.ts`**: `Seller.codigoVendedor?: string`, `Client.codigoExterno?: string`.
- **`services/sellers-service.ts`**: `mapSeller` lee `codigo_vendedor`; `createSeller`
  y `updateSeller` lo persisten.
- **`services/clients-service.ts`**: `mapClient` lee `codigo_externo`; `updateClient`
  ya maneja `seller_id` — se agrega `codigo_externo`. **`createClient` pasa a guardar
  `seller_id` y `codigo_externo`** (hoy no guarda `seller_id`).

### 4. UI

- **Form de vendedor** (`app/empleados`): input "Código de vendedor" (texto).
- **Modal de cliente** (`components/clientes/client-modal.tsx`): input "Código externo"
  **y selector de vendedor** (hoy no existe). Permite asignar/cambiar el `seller_id`
  de un cliente desde la UI — necesario para los ~19 clientes que no están en el CSV
  y quedan "sin asignar" tras el import. Solo visible/operable para admin.
- **Carrito** (`hooks/useCart.ts`): efecto sobre `selectedClientData` — si el cliente
  tiene `sellerId` y `role === "admin"`, se autocompleta `selectedSeller` con ese id.
  El Select sigue editable (se puede cambiar en esa venta). Para `role === "seller"`
  se mantiene la resolución por email actual.
- **Alta de cliente por vendedor**: en `registerClientFromDni` y `registerClientFromModal`
  (`useCart.ts`) y en `app/clientes/page.tsx`, si `role === "seller"` se pasa
  `sellerId` = id del vendedor logueado → el cliente queda ligado solo a él.
- **Mostrar el código** junto al nombre del vendedor en el select del carrito y en el
  filtro de vendedores de pedidos (ej. `LEONARDO (7)` ya lo trae el name; se asegura
  consistencia mostrando `codigo_vendedor` donde el name no lo incluya).

### 5. Filtros por vendedor

Ya existen en Ventas (admin), Pedidos, Cuenta corriente; Cobranzas está acotada al
vendedor logueado. **Solo Caja** suma un filtro por vendedor sobre el listado de
ventas del día (`app/caja/page.tsx`).

## Flujo de datos

```
CSV (codigo, nombre, codigo_vendedor)
  │  import-clientes-vendedor.cjs (match por nombre, 1 sola vez)
  ▼
clientes.seller_id  +  clientes.codigo_externo
  │
  ├─ venta nueva → toma seller_id del cliente (editable) → ventas.seller_id/seller_name
  │     └─ caja / cuenta corriente / comisiones (ya leen seller_id)
  └─ pedidos.seller_id (ya existente)

vendedores.name "ADRIAN (3)"
  │  backfill-codigo-vendedor.cjs
  ▼
vendedores.codigo_vendedor "3"  ← clave de cruce con CSV (03)
```

## Errores y casos borde

- Hoy 242/293 clientes están "sin asignar" (`seller_id` null). El import resuelve
  ~255 (los que están en el CSV). Quedan ~19 fuera del CSV (o con nombre corrupto por
  encoding, ej. `MONTAÑANA ALDO`, `DOÑA CHOLA`) que se asignan a mano vía el selector
  del modal de cliente. Cuenta corriente ya muestra el vendedor derivándolo de
  `seller_id` (`getDebtClients`), así que se actualiza solo tras el import.
- Clientes del CSV sin match por nombre (~2): el script los reporta; se asignan a mano.
- Vendedores sin número en el name: `codigo_vendedor` queda `null` (no rompe nada).
- Admin crea cliente sin elegir vendedor: `seller_id` queda `null` (igual que hoy).
- Cambiar el vendedor en una venta puntual no altera el `seller_id` del cliente.
- El import es idempotente: re-correrlo vuelve a setear los mismos valores.

## Fuera de alcance (YAGNI)

- Reasignación masiva de vendedores desde la UI.
- Migrar `seller_id` de ventas/pedidos históricos (ya tienen el suyo).
- Reemplazar el `codigo` interno (`C-NNNN`) por el `codigo_externo`.
- Reescritura de la lógica de selección de vendedor por email para rol seller.

## Verificación

- Tras los scripts: contar clientes con `seller_id` por vendedor y comparar con el CSV.
- `npm run build` sin errores.
- Alta de cliente como vendedor → verificar `seller_id` = ese vendedor.
- Venta admin a un cliente con vendedor → el Select aparece precargado y editable.
- Filtro de Caja por vendedor muestra solo las ventas de ese vendedor en el día.
