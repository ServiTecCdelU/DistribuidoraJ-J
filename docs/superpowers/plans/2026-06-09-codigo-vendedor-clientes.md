# Código de vendedor y vínculo cliente↔vendedor — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada vendedor un `codigo_vendedor` propio, asignar el vendedor correcto a cada cliente (vía CSV externo y vía UI), y que las ventas creadas para un cliente tomen su vendedor automáticamente.

**Architecture:** El vínculo interno sigue siendo `clientes.seller_id` (FK a `vendedores.id`). `codigo_vendedor` (en `vendedores`) y `codigo_externo` (en `clientes`) son atributos nuevos: el primero es legible y clave de cruce con el CSV; el segundo es el código estable del cliente del sistema viejo. Dos scripts de carga única pueblan los datos; el código de la app suma los campos a tipos/services/UI y la auto-asignación.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase JS, Tailwind/shadcn. Verificación por `npm run build` (el proyecto no tiene tests; convención de scripts `node scripts/*.cjs`). **Un solo commit al final** (regla del proyecto en CLAUDE.md).

**Convención de commits del proyecto:** NO hacer commits intermedios. Cada tarea deja el árbol en estado verificable; el commit único va en la Tarea 13, tras `npm run build` OK.

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `migrations/2026-06-09-codigo-vendedor.sql` | Crear | Registro del DDL (lo ejecuta el usuario en Supabase) |
| `lib/types.ts` | Modificar | `Seller.codigoVendedor?`, `Client.codigoExterno?` |
| `services/sellers-service.ts` | Modificar | map/create/update de `codigo_vendedor` |
| `services/clients-service.ts` | Modificar | map de `codigo_externo`; `createClient` guarda `seller_id`+`codigo_externo`; `updateClient` guarda `codigo_externo` |
| `app/empleados/page.tsx` | Modificar | Input "Código de vendedor" + payload |
| `components/clientes/client-modal.tsx` | Modificar | Input "Código externo" + selector de vendedor opcional |
| `app/clientes/page.tsx` | Modificar | Cargar vendedores y pasarlos al modal |
| `hooks/useCart.ts` | Modificar | Auto-asignar vendedor del cliente (admin); alta por vendedor → `sellerId` propio |
| `components/cart/UnifiedCart.tsx` | Modificar | Mostrar código junto al nombre en el select de vendedor |
| `app/caja/page.tsx` | Modificar | Filtro por vendedor en "Ventas del día" |
| `scripts/backfill-codigo-vendedor.cjs` | Crear | Extrae `(N)` del name → `codigo_vendedor` |
| `scripts/import-clientes-vendedor.cjs` | Crear | CSV → `codigo_externo` + `seller_id` por nombre |

---

## Tarea 1: Migración SQL (la ejecuta el usuario)

**Files:**
- Create: `migrations/2026-06-09-codigo-vendedor.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- migrations/2026-06-09-codigo-vendedor.sql
ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS codigo_vendedor text;
ALTER TABLE clientes  ADD COLUMN IF NOT EXISTS codigo_externo  text;
CREATE INDEX IF NOT EXISTS idx_clientes_codigo_externo ON clientes(codigo_externo);
```

- [ ] **Step 2: Avisar al usuario que ejecute el SQL en Supabase**

Indicar: "Ejecutá `migrations/2026-06-09-codigo-vendedor.sql` en el SQL Editor de Supabase antes de correr los scripts (Tareas 11-12)." El resto del código no rompe si las columnas aún no existen (campos opcionales en TS), pero los scripts sí las necesitan.

---

## Tarea 2: Tipos

**Files:**
- Modify: `lib/types.ts` (interface `Seller` ~172, interface `Client` ~47)

- [ ] **Step 1: Agregar `codigoVendedor` a `Seller`**

En `lib/types.ts`, dentro de `export interface Seller`, después de `phone: string;`:

```ts
  codigoVendedor?: string;
```

- [ ] **Step 2: Agregar `codigoExterno` a `Client`**

En `export interface Client`, después de `codigo?: string;`:

```ts
  codigoExterno?: string;
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: compila sin errores nuevos.

---

## Tarea 3: Service de vendedores

**Files:**
- Modify: `services/sellers-service.ts` (`mapSeller` ~6, `createSeller` ~44, `updateSeller` ~71)

- [ ] **Step 1: Leer `codigo_vendedor` en `mapSeller`**

En el objeto que retorna `mapSeller`, después de `phone: d.phone ?? '',`:

```ts
    codigoVendedor: d.codigo_vendedor ?? undefined,
```

- [ ] **Step 2: Persistir en `createSeller`**

En `createSeller`, dentro del objeto `row`, después de `phone: seller.phone || null,`:

```ts
    codigo_vendedor: seller.codigoVendedor || null,
```

- [ ] **Step 3: Persistir en `updateSeller`**

En `updateSeller`, junto a los otros `if (updates.X !== undefined)`, agregar:

```ts
  if (updates.codigoVendedor !== undefined) mapped.codigo_vendedor = updates.codigoVendedor || null
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: compila sin errores.

---

## Tarea 4: Service de clientes

**Files:**
- Modify: `services/clients-service.ts` (`mapClient` ~5, `createClient` ~48, `updateClient` ~75)

- [ ] **Step 1: Leer `codigo_externo` en `mapClient`**

En `mapClient`, después de `codigo: d.codigo ?? undefined,`:

```ts
    codigoExterno: d.codigo_externo ?? undefined,
```

- [ ] **Step 2: `createClient` guarda `seller_id` y `codigo_externo`**

En `createClient`, dentro del objeto pasado a `.insert({...})`, después de `notes: client.notes ?? '',`:

```ts
    seller_id: client.sellerId || null,
    codigo_externo: client.codigoExterno || null,
```

- [ ] **Step 3: `updateClient` guarda `codigo_externo`**

En `updateClient`, junto a los otros mapeos (ya existe `if (updates.sellerId !== undefined) ...`), agregar:

```ts
  if (updates.codigoExterno !== undefined) mapped.codigo_externo = updates.codigoExterno || null
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: compila sin errores.

---

## Tarea 5: Form de vendedor (empleados)

**Files:**
- Modify: `app/empleados/page.tsx` (`formData` ~96, `handleEdit` ~157, `handleSave` payload ~241, JSX name input ~819)

- [ ] **Step 1: Agregar `codigoVendedor` al estado `formData`**

En el `useState` de `formData` (~96), después de `phone: '',`:

```ts
    codigoVendedor: '',
```

Y en el reset de `handleSave`/nuevo (objeto `setFormData({...})` ~141), agregar también `codigoVendedor: '',` después de `phone: '',`.

- [ ] **Step 2: Cargar el valor al editar**

En `handleEdit` (~157), dentro de `setFormData({...})`, después de `phone: seller.phone,`:

```ts
      codigoVendedor: seller.codigoVendedor ?? '',
```

- [ ] **Step 3: Incluir en el payload de guardado**

En `handleSave`, dentro de `const payload`, después de `phone: formData.phone,`:

```ts
      codigoVendedor: formData.codigoVendedor.trim() || undefined,
```

- [ ] **Step 4: Agregar el input en el form**

En el JSX, justo después del bloque `<div className="grid gap-2">` del campo "Nombre Completo" (cierra ~826), insertar:

```tsx
              <div className="grid gap-2">
                <Label htmlFor="codigoVendedor">Código de vendedor</Label>
                <Input
                  id="codigoVendedor"
                  value={formData.codigoVendedor}
                  onChange={(e) => setFormData({ ...formData, codigoVendedor: e.target.value })}
                  placeholder="Ej: 3"
                />
              </div>
```

- [ ] **Step 5: Verificar build y prueba manual**

Run: `npm run build`
Expected: compila. Manual: abrir Empleados → editar ADRIAN → ver/editar "Código de vendedor", guardar, reabrir y confirmar persistencia.

---

## Tarea 6: Modal de cliente (código externo + selector de vendedor)

**Files:**
- Modify: `components/clientes/client-modal.tsx` (props ~22, `formData` ~37, effect ~49, `handleSubmit` ~109, JSX)

- [ ] **Step 1: Extender props con `sellers` opcional**

En `ClientModalProps`, agregar:

```ts
  sellers?: { id: string; name: string }[]
```

Y en la firma del componente: `export function ClientModal({ open, onOpenChange, client, onSave, showCreditLimit = true, showNotes = true, defaultValues, sellers }: ClientModalProps) {`

- [ ] **Step 2: Agregar `codigoExterno` y `sellerId` al `formData`**

En el `useState` de `formData` (~37), después de `notes: '',`:

```ts
    codigoExterno: '',
    sellerId: '',
```

- [ ] **Step 3: Inicializar en el `useEffect`**

En la rama `if (client)` del effect, después de `notes: client.notes || '',`:

```ts
        codigoExterno: client.codigoExterno || '',
        sellerId: client.sellerId || '',
```

En la rama `else`, después de `notes: defaultValues?.notes || '',`:

```ts
        codigoExterno: '',
        sellerId: '',
```

- [ ] **Step 4: Pasar los campos en `onSave`**

`handleSubmit` (~109) ya hace `await onSave({ ...formData, cuit: formatCuit(formData.cuit) })`. Ajustar para normalizar `sellerId` vacío a undefined:

```ts
      await onSave({
        ...formData,
        cuit: formatCuit(formData.cuit),
        sellerId: formData.sellerId || undefined,
        codigoExterno: formData.codigoExterno.trim() || undefined,
      })
```

- [ ] **Step 5: Agregar input "Código externo" en el JSX**

Después del bloque del DNI/CUIT (antes del bloque `taxCategory`, ~178), insertar:

```tsx
              <div className="grid gap-2">
                <Label htmlFor="codigoExterno" className="text-foreground">Código externo</Label>
                <Input
                  id="codigoExterno"
                  value={formData.codigoExterno}
                  onChange={(e) => setFormData({ ...formData, codigoExterno: e.target.value })}
                  placeholder="Ej: 106"
                />
              </div>
```

- [ ] **Step 6: Agregar selector de vendedor (solo si llegan `sellers`)**

Después del input "Código externo", insertar:

```tsx
              {sellers && sellers.length > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor="sellerId" className="text-foreground">Vendedor</Label>
                  <select
                    id="sellerId"
                    className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                    value={formData.sellerId}
                    onChange={(e) => setFormData({ ...formData, sellerId: e.target.value })}
                  >
                    <option value="">Sin asignar</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
```

- [ ] **Step 7: Verificar build**

Run: `npm run build`
Expected: compila sin errores.

---

## Tarea 7: Página de clientes (cargar vendedores y pasarlos al modal)

**Files:**
- Modify: `app/clientes/page.tsx` (imports ~22, estado/carga ~115, uso de `<ClientModal>` ~830)

- [ ] **Step 1: Importar `sellersApi`**

Cambiar `import { clientsApi } from '@/lib/api'` por:

```ts
import { clientsApi, sellersApi } from '@/lib/api'
```

- [ ] **Step 2: Estado de vendedores y carga**

Junto al estado de clientes, agregar:

```ts
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([])
```

En el `useEffect`/función que ya hace `clientsApi.getAll()` (~117), agregar en paralelo:

```ts
      sellersApi.getAll().then((data) =>
        setSellers(data.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name })))
      )
```

- [ ] **Step 3: Pasar `sellers` al modal**

En `<ClientModal ... />` (~830), agregar la prop:

```tsx
        sellers={sellers}
```

- [ ] **Step 4: Verificar build y prueba manual**

Run: `npm run build`
Expected: compila. Manual: Clientes → editar un cliente "sin asignar" → elegir vendedor → guardar → confirmar que queda asignado.

---

## Tarea 8: Carrito — auto-asignación y alta por vendedor

**Files:**
- Modify: `hooks/useCart.ts` (effect `selectedClientData` ~282, `registerClientFromDni` ~700, `registerClientFromModal` ~726)

- [ ] **Step 1: Auto-asignar el vendedor del cliente (rol admin)**

En el `useEffect` que depende de `[selectedClientData?.id]` (~282), antes del `}` de cierre, agregar:

```ts
    // Auto-asignar el vendedor del cliente (admin); el Select queda editable
    if (role === "admin" && selectedClientData.sellerId) {
      setSelectedSeller(selectedClientData.sellerId);
    }
```

- [ ] **Step 2: Alta desde DNI ligada al vendedor logueado**

En `registerClientFromDni` (~703), en el objeto de `clientsApi.create({...})`, después de `notes: "",`:

```ts
        sellerId: role === "seller" && selectedSeller && selectedSeller !== "none" ? selectedSeller : undefined,
```

- [ ] **Step 3: Ampliar el tipo del parámetro `form`**

`registerClientFromModal` (~726) declara su parámetro inline. Agregar los dos campos nuevos al tipo:

```ts
  const registerClientFromModal = useCallback(async (form: { name: string; dni: string; cuit: string; email: string; phone: string; address: string; taxCategory: string; creditLimit: number; notes: string; sellerId?: string; codigoExterno?: string }) => {
```

- [ ] **Step 4: Alta desde modal ligada al vendedor logueado**

En `registerClientFromModal`, en `clientsApi.create({...})`, después de `notes: form.notes || "",`:

```ts
      sellerId: role === "seller" && selectedSeller && selectedSeller !== "none" ? selectedSeller : (form.sellerId || undefined),
      codigoExterno: form.codigoExterno || undefined,
```

- [ ] **Step 5: Verificar build y prueba manual**

Run: `npm run build`
Expected: compila. Manual (admin): en venta nueva, elegir un cliente con vendedor → el Select de Vendedor aparece precargado y editable. Manual (vendedor): crear un cliente desde la vista vendedor → confirmar en BD que `seller_id` = ese vendedor.

---

## Tarea 9: Select de vendedor del carrito — mostrar código

**Files:**
- Modify: `components/cart/UnifiedCart.tsx` (`sellers.map` ~460)

- [ ] **Step 1: Mostrar el código junto al nombre cuando el name no lo incluya**

Reemplazar el contenido del `<SelectItem>` de vendedores (~461-463):

```tsx
                {sellers.map((seller) => (
                  <SelectItem key={seller.id} value={seller.id} className="text-sm">
                    {seller.codigoVendedor && !seller.name.includes(seller.codigoVendedor)
                      ? `${seller.name} · #${seller.codigoVendedor}`
                      : seller.name}
                  </SelectItem>
                ))}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: compila. (`seller.codigoVendedor` existe en el tipo `Seller` por Tarea 2.)

---

## Tarea 10: Filtro por vendedor en Caja

**Files:**
- Modify: `app/caja/page.tsx` (estado ~405, bloque "Ventas del dia" ~1222-1232)

- [ ] **Step 1: Estado del filtro**

Junto a los otros `useState` del componente (~405), agregar:

```ts
  const [filtroVendedorCaja, setFiltroVendedorCaja] = useState<string>("all");
```

- [ ] **Step 2: Derivar vendedores presentes y lista filtrada**

Antes del `return`/render del bloque de ventas del día (puede ir cerca de otros `useMemo`/derivados, o inline antes del JSX de "Ventas del dia"), agregar:

```ts
  const vendedoresEnCaja = Array.from(
    new Map(
      sales
        .filter((s) => s.sellerId)
        .map((s) => [s.sellerId as string, s.sellerName || "Vendedor"]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  const salesFiltradas = filtroVendedorCaja === "all"
    ? sales
    : sales.filter((s) => s.sellerId === filtroVendedorCaja);
```

- [ ] **Step 3: Render del Select de filtro encima de la lista**

En el JSX, justo antes del título `Ventas del dia ({sales.length})` (~1222), insertar (solo si hay más de un vendedor):

```tsx
                      {vendedoresEnCaja.length > 1 && (
                        <select
                          className="mb-2 h-9 w-full rounded-2xl border border-input bg-background px-3 text-sm"
                          value={filtroVendedorCaja}
                          onChange={(e) => setFiltroVendedorCaja(e.target.value)}
                        >
                          <option value="all">Todos los vendedores</option>
                          {vendedoresEnCaja.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      )}
```

- [ ] **Step 4: Usar la lista filtrada en el map**

Cambiar `{sales.map((sale) => {` (~1232) por `{salesFiltradas.map((sale) => {`. Actualizar el contador del título a `Ventas del dia ({salesFiltradas.length})`.

- [ ] **Step 5: Verificar build y prueba manual**

Run: `npm run build`
Expected: compila. Manual: abrir Caja con ventas de varios vendedores en el día → el Select filtra la lista.

---

## Tarea 11: Script backfill de `codigo_vendedor`

**Files:**
- Create: `scripts/backfill-codigo-vendedor.cjs`

- [ ] **Step 1: Crear el script**

```js
/**
 * Extrae el número entre paréntesis del name de cada vendedor → codigo_vendedor.
 * No modifica el name. Ejecutar tras correr la migración SQL.
 * Uso: node scripts/backfill-codigo-vendedor.cjs
 */
const { createClient } = require('@supabase/supabase-js')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data, error } = await supabase.from('vendedores').select('id, name, codigo_vendedor')
  if (error) { console.error('✗', error.message); process.exit(1) }

  let updated = 0
  for (const v of data) {
    const m = String(v.name).match(/\((\d+)\)/)
    const codigo = m ? String(parseInt(m[1], 10)) : null
    console.log(`${v.name} -> ${codigo ?? '(sin codigo)'}`)
    if (codigo && codigo !== v.codigo_vendedor) {
      const { error: e } = await supabase.from('vendedores').update({ codigo_vendedor: codigo }).eq('id', v.id)
      if (e) console.error(`  ✗ ${v.name}:`, e.message)
      else updated++
    }
  }
  console.log(`\n✓ Actualizados: ${updated}`)
}
main().catch(console.error)
```

- [ ] **Step 2: Ejecutar (requiere SQL de Tarea 1 ya corrido)**

Run: `node scripts/backfill-codigo-vendedor.cjs`
Expected: imprime `ADRIAN (3) -> 3`, `NICOLAS (4) -> 4`, `LEONARDO (7) -> 7`, `JOAQUIN (REPARTO) -> (sin codigo)`, `ServiTec -> (sin codigo)`, y `✓ Actualizados: 3`.

---

## Tarea 12: Script import CSV → `codigo_externo` + `seller_id`

**Files:**
- Create: `scripts/import-clientes-vendedor.cjs`

- [ ] **Step 1: Crear el script**

```js
/**
 * Lee clientes_Nueva Zona.csv y, matcheando cliente por NOMBRE, setea:
 *   codigo_externo = codigo del CSV
 *   seller_id      = vendedor cuyo codigo_vendedor coincide con codigo_vendedor del CSV
 * No crea clientes. Reporta no-matcheados.
 * Ejecutar tras la migración SQL y el backfill de vendedores.
 * Uso: node scripts/import-clientes-vendedor.cjs
 */
const { createClient } = require('@supabase/supabase-js')
const path = require('path')
const fs = require('fs')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const numOf = (v) => { const m = String(v).match(/\d+/); return m ? parseInt(m[0], 10) : null }

async function main() {
  // 1) Mapa numero -> seller_id
  const { data: vends, error: ev } = await supabase.from('vendedores').select('id, codigo_vendedor')
  if (ev) { console.error('✗', ev.message); process.exit(1) }
  const vendByNum = new Map()
  vends.forEach((v) => { const n = numOf(v.codigo_vendedor); if (n != null) vendByNum.set(n, v.id) })
  console.log('Vendedores por codigo:', [...vendByNum.entries()].map(([n, id]) => `${n}->${id}`).join(', '))

  // 2) Clientes por nombre normalizado
  const { data: clients, error: ec } = await supabase.from('clientes').select('id, name')
  if (ec) { console.error('✗', ec.message); process.exit(1) }
  const clientByName = new Map()
  clients.forEach((c) => clientByName.set(norm(c.name), c))

  // 3) CSV
  const csvPath = path.resolve(__dirname, '..', 'clientes_Nueva Zona.csv')
  const raw = fs.readFileSync(csvPath, 'latin1').split(/\r?\n/).filter(Boolean)
  const rows = raw.slice(1).map((l) => l.split(';').map((x) => x.replace(/^"|"$/g, '')))

  let updated = 0
  const sinCliente = []
  const sinVendedor = []
  for (const r of rows) {
    const [codigo, nombre, , codVend] = r
    const c = clientByName.get(norm(nombre))
    if (!c) { sinCliente.push(`${codigo} ${nombre}`); continue }
    const sellerId = vendByNum.get(numOf(codVend))
    if (!sellerId) { sinVendedor.push(`${nombre} (codVend ${codVend})`); }
    const { error: e } = await supabase
      .from('clientes')
      .update({ codigo_externo: String(codigo), seller_id: sellerId ?? null })
      .eq('id', c.id)
    if (e) console.error(`  ✗ ${nombre}:`, e.message)
    else updated++
  }

  console.log(`\n✓ Clientes actualizados: ${updated}`)
  console.log(`✗ Sin match por nombre (${sinCliente.length}):`)
  sinCliente.forEach((x) => console.log('   ' + x))
  if (sinVendedor.length) {
    console.log(`⚠ Filas con codigo_vendedor sin vendedor (${sinVendedor.length}):`)
    sinVendedor.forEach((x) => console.log('   ' + x))
  }
}
main().catch(console.error)
```

- [ ] **Step 2: Ejecutar**

Run: `node scripts/import-clientes-vendedor.cjs`
Expected: `Vendedores por codigo: 3->vendedor_adriangange_1, 4->vendedor_saldivianicolas_1, 7->vendedor_lucasbenitez_1`; `✓ Clientes actualizados: ~274`; lista de ~2 sin match por nombre; sin filas con codVend sin vendedor.

- [ ] **Step 3: Verificación de datos**

Run:
```bash
node -e "const{createClient}=require('@supabase/supabase-js');require('dotenv').config({path:'.env'});const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});(async()=>{const{data}=await s.from('clientes').select('seller_id');const c={};data.forEach(x=>{const k=x.seller_id||'sin';c[k]=(c[k]||0)+1});console.log(c)})()"
```
Expected: ~111 a `vendedor_adriangange_1`, ~91 a `vendedor_saldivianicolas_1`, ~74 a `vendedor_lucasbenitez_1`, ~19 en `sin`.

---

## Tarea 13: Build final y commit único

**Files:**
- N/A (verificación + commit de todo lo anterior)

- [ ] **Step 1: Build de producción**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 2: Commit único de todos los cambios**

```bash
git add lib/types.ts services/sellers-service.ts services/clients-service.ts \
  app/empleados/page.tsx components/clientes/client-modal.tsx app/clientes/page.tsx \
  hooks/useCart.ts components/cart/UnifiedCart.tsx app/caja/page.tsx \
  migrations/2026-06-09-codigo-vendedor.sql \
  scripts/backfill-codigo-vendedor.cjs scripts/import-clientes-vendedor.cjs
git commit -m "feat: codigo_vendedor en vendedores y vinculo cliente-vendedor (auto-asignacion + filtro caja + import CSV)"
```

- [ ] **Step 3: Push**

Run: `git push origin main`
Expected: push OK.

---

## Notas de ejecución

- **Orden de datos:** SQL (Tarea 1) → backfill vendedores (Tarea 11) → import clientes (Tarea 12). Los scripts fallan si las columnas no existen.
- **Idempotencia:** ambos scripts se pueden re-correr; vuelven a setear los mismos valores.
- **Los ~19 clientes "sin asignar"** post-import (fuera del CSV o nombre corrupto) se asignan a mano con el selector del modal de cliente (Tarea 6-7).
- **Cuenta corriente / caja / pedidos / comisiones** no requieren cambios de relación: ya leen `seller_id`; se actualizan solos al poblarlo.
