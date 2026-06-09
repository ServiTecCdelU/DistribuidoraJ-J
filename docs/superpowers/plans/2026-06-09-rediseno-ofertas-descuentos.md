# Rediseño de Ofertas/Descuentos — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El % del producto pasa a ser el máximo de descuento que el vendedor aplica (0..máx), los regalos (mismo/otro) los da el vendedor en cantidad libre con tope opcional, y se elimina el sistema de cupos y el tope global de descuento por vendedor.

**Architecture:** El admin configura por producto en Ofertas (`productos.descuento` = máx %, `regalo_mismo`/`regalo_mismo_max`, `regalo_producto_id`/`regalo_otro_max`). El vendedor decide al vender: cada `CartItem` lleva `itemDiscount` (% elegido), `regalo` (unidades del mismo) y `regaloOtroCantidad` (unidades del producto fijado). `sales-service` arma las líneas de venta y descuenta stock a partir de esos valores manuales, no de ratios. Se borra la tabla `descuento_vendedor` (ya dropeada) y su service, y el campo `maxDiscount` de vendedores.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase JS. Verificación por `npm run build` (el proyecto no tiene tests). **Un solo commit al final** (regla del proyecto). SQL ya ejecutado por el usuario.

**Convención:** sin commits intermedios; cada tarea deja el árbol compilable; commit único en la última tarea.

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `lib/types.ts` | Modificar | `Product`: quitar campos ratio/cupo, agregar `regaloMismo`/`regaloMismoMax`/`regaloOtroMax`. `CartItem`: quitar `adminDiscount`, agregar `regalo`/`regaloOtroCantidad`. `Seller`: quitar `maxDiscount`. |
| `services/products-service.ts` | Modificar | map/update de campos nuevos; quitar `descontarOferta` y campos viejos; ajustar `getProductosConOfertas`. |
| `app/descuentos/page.tsx` | Modificar | Config nueva; eliminar cupos. |
| `hooks/useCart.ts` | Modificar | Descuento=máx por producto; regalos manuales; quitar cupos/maxDiscount. |
| `components/cart/UnifiedCart.tsx` | Modificar | Inputs de descuento (cap producto) y regalos; quitar `sellerMaxDiscount`. |
| `services/sales-service.ts` | Modificar | Regalos desde valores manuales (2 paths). |
| `lib/utils/promo.ts` | Borrar/reducir | Eliminar helpers de ratio. |
| `services/descuento-vendedor-service.ts` | Borrar | Service de cupos. |
| `services/mayorista-service.ts` | Modificar | Quitar dependencia de cupos. |
| `services/sellers-service.ts` | Modificar | Quitar `maxDiscount`. |
| `app/empleados/page.tsx` | Modificar | Quitar campo `maxDiscount`. |
| `app/api/public/vendedores/route.ts` | Modificar | Quitar `sellerMaxDiscount`. |
| `app/ventas/nueva/page.tsx` | Modificar | Card "hasta X% dto."; quitar `descuentoCantidad`. |

---

## FASE 1 — Modelo de datos y tipos

### Tarea 1: Tipos (`lib/types.ts`)

**Files:** Modify `lib/types.ts` (interface `Product` ~35-43, `CartItem`, `Seller`)

- [ ] **Step 1: Reemplazar los campos de oferta en `Product`**

Reemplazar el bloque (líneas ~35-43):
```ts
  descuento?: number;          // % de descuento del producto fijado por admin (se suma al del vendedor)
  descuentoCantidad?: number | null; // unidades disponibles en oferta; null = sin límite, 0 = oferta agotada
  regaloCada?: number | null;  // promo "cada X comprados +N gratis"; null/0 = sin promo
  regaloCantidad?: number | null; // unidades gratis por cada bloque de regaloCada (default 1)
```
y los dos de `regaloProductoCada`/`regaloProductoCantidad`, por:
```ts
  descuento?: number;          // % MÁXIMO de descuento que el vendedor puede aplicar; 0 = no admite
  regaloMismo?: boolean;       // permite regalar unidades del mismo producto
  regaloMismoMax?: number | null;   // tope de unidades a regalar (mismo); null = libre
  regaloOtroMax?: number | null;    // tope de unidades a regalar (otro); null = libre
```
Mantener `regaloProductoId` y `regaloProductoNombre`. **Eliminar** las líneas `regaloProductoCada` y `regaloProductoCantidad`.

- [ ] **Step 2: Ajustar `CartItem`**

Reemplazar la interfaz `CartItem`:
```ts
export interface CartItem {
  product: Product;
  quantity: number;
  itemDiscount?: number; // % elegido por el vendedor (0..product.descuento)
  regalo?: number;       // unidades gratis del mismo producto (manual)
  regaloOtroCantidad?: number; // unidades del producto fijado a regalar (manual)
  cantidadStockLocal?: number;
  cantidadPendienteMayorista?: number;
}
```

- [ ] **Step 3: Quitar `maxDiscount` de `Seller`**

En `export interface Seller`, eliminar la línea `maxDiscount: number;`.

- [ ] **Step 4: Build (marcará usos viejos a corregir en tareas siguientes)**

Run: `npm run build`
Expected: FALLA con errores de tipos en los archivos que usan los campos viejos (esperado; se corrigen en las tareas siguientes). Anotar la lista para no olvidar ninguno.

### Tarea 2: Service de productos (`services/products-service.ts`)

**Files:** Modify `services/products-service.ts` (`mapRow` ~26-33, `descontarOferta` ~37-49, `getProductosConOfertas` ~95-101, `update` ~285-290)

- [ ] **Step 1: `mapRow` — leer campos nuevos**

Reemplazar (líneas ~26-33):
```ts
    descuento: d.descuento != null ? Number(d.descuento) : 0,
    descuentoCantidad: d.descuento_cantidad != null ? Number(d.descuento_cantidad) : null,
    regaloCada: d.regalo_cada != null ? Number(d.regalo_cada) : null,
    regaloCantidad: d.regalo_cantidad != null ? Number(d.regalo_cantidad) : null,
    regaloProductoId: d.regalo_producto_id ?? null,
    regaloProductoNombre: d.regalo_producto_nombre ?? null,
    regaloProductoCada: d.regalo_producto_cada != null ? Number(d.regalo_producto_cada) : null,
    regaloProductoCantidad: d.regalo_producto_cantidad != null ? Number(d.regalo_producto_cantidad) : null,
```
por:
```ts
    descuento: d.descuento != null ? Number(d.descuento) : 0,
    regaloMismo: d.regalo_mismo ?? false,
    regaloMismoMax: d.regalo_mismo_max != null ? Number(d.regalo_mismo_max) : null,
    regaloOtroMax: d.regalo_otro_max != null ? Number(d.regalo_otro_max) : null,
    regaloProductoId: d.regalo_producto_id ?? null,
    regaloProductoNombre: d.regalo_producto_nombre ?? null,
```

- [ ] **Step 2: Eliminar `descontarOferta`**

Borrar la función `descontarOferta` completa (~líneas 37-49) y su comentario. Si está exportada y se importa en otro lado, buscar usos: `grep -rn "descontarOferta" .` y eliminarlos (no debería usarse tras el rediseño).

- [ ] **Step 3: `getProductosConOfertas` — nuevo criterio**

Reemplazar la línea del `.or(...)`:
```ts
    .or('descuento.gt.0,regalo_cada.gt.0,regalo_producto_id.not.is.null')
```
por:
```ts
    .or('descuento.gt.0,regalo_mismo.eq.true,regalo_producto_id.not.is.null')
```

- [ ] **Step 4: `update` — persistir campos nuevos**

Reemplazar las líneas (~286-290) de `descuentoCantidad`/`regaloCada`/`regaloCantidad`/`regaloProductoCada`/`regaloProductoCantidad` por:
```ts
  if (updates.regaloMismo !== undefined) mapped.regalo_mismo = updates.regaloMismo
  if (updates.regaloMismoMax !== undefined) mapped.regalo_mismo_max = updates.regaloMismoMax
  if (updates.regaloOtroMax !== undefined) mapped.regalo_otro_max = updates.regaloOtroMax
```
Mantener `descuento`, `regaloProductoId`, `regaloProductoNombre`.

- [ ] **Step 5: Build parcial**

Run: `npm run build`
Expected: siguen errores en descuentos/useCart/sales-service/mayorista (se corrigen luego); products-service sin errores propios.

---

## FASE 2 — Página de Ofertas

### Tarea 3: Config nueva y eliminación de cupos (`app/descuentos/page.tsx`)

**Files:** Modify `app/descuentos/page.tsx`

- [ ] **Step 1: Quitar imports y estado de cupos**

- Quitar el import `import { getAsignacionesProducto, setAsignacion, getTotalesCupos } from "@/services/descuento-vendedor-service";`.
- Eliminar estados: `vendedores`, `cuposOpenId`, `cupos`, `loadingCupos`, `savingCuposId`, `cuposTotales`.
- Eliminar el `useEffect` que carga `sellersApi.getAll()` para `vendedores`.
- Eliminar funciones: `toggleCupos`, `setCupo`, `aplicarATodos`, `handleSaveCupos`.
- En `fetchProducts`, quitar el bloque que llama `getTotalesCupos` (líneas ~90-95).
- En `guardarDescuento`, quitar el bloque que recarga `getTotalesCupos` (~201-204).

- [ ] **Step 2: Reemplazar drafts de regalo**

Reemplazar:
```ts
  const [mismoDraft, setMismoDraft] = useState<Record<string, { cada: string; cantidad: string }>>({});
  const [comboDraft, setComboDraft] = useState<Record<string, { productoId: string | null; nombre: string; cada: string; cantidad: string }>>({});
```
por:
```ts
  const [mismoDraft, setMismoDraft] = useState<Record<string, { max: string }>>({});
  const [comboDraft, setComboDraft] = useState<Record<string, { productoId: string | null; nombre: string; max: string }>>({});
```

- [ ] **Step 3: Detección de ofertas y descripciones**

Reemplazar:
```ts
  const tieneRegaloMismo = (p: Product) => (p.regaloCada ?? 0) > 0;
  const tieneRegaloOtro = (p: Product) => !!p.regaloProductoId && (p.regaloProductoCada ?? 0) > 0;
```
por:
```ts
  const tieneRegaloMismo = (p: Product) => !!p.regaloMismo;
  const tieneRegaloOtro = (p: Product) => !!p.regaloProductoId;
```
En `ofertasDe`, reemplazar los `text`:
```ts
    if (tieneDescuento(p)) arr.push({ tipo: "descuento", text: `Descuento máx ${p.descuento}%`, estado: p.stock > 0 ? "activa" : "sin_stock" });
    if (tieneRegaloMismo(p)) arr.push({ tipo: "regalo_mismo", text: p.regaloMismoMax != null ? `Regala mismo (máx ${p.regaloMismoMax})` : `Regala mismo (libre)`, estado: p.stock > 0 ? "activa" : "sin_stock" });
    if (tieneRegaloOtro(p)) arr.push({ tipo: "regalo_otro", text: p.regaloOtroMax != null ? `Regala ${p.regaloProductoNombre} (máx ${p.regaloOtroMax})` : `Regala ${p.regaloProductoNombre} (libre)`, estado: estadoRegaloOtro(p) });
```

- [ ] **Step 4: `abrirEdicion` — drafts nuevos**

Reemplazar las ramas `regalo_mismo` y `else` (regalo_otro):
```ts
    } else if (tipo === "regalo_mismo") {
      setMismoDraft((prev) => ({ ...prev, [p.id]: { max: p.regaloMismoMax != null ? String(p.regaloMismoMax) : "" } }));
    } else {
      setComboSearch("");
      setComboResults([]);
      setComboDraft((prev) => ({ ...prev, [p.id]: {
        productoId: p.regaloProductoId ?? null,
        nombre: p.regaloProductoNombre ?? "",
        max: p.regaloOtroMax != null ? String(p.regaloOtroMax) : "",
      } }));
    }
```

- [ ] **Step 5: `guardarRegaloMismo` y `guardarRegaloOtro` nuevos**

Reemplazar `guardarRegaloMismo`:
```ts
  const guardarRegaloMismo = async (p: Product) => {
    const d = mismoDraft[p.id] ?? { max: "" };
    const max = d.max.trim() === "" ? null : Math.max(1, Math.floor(Number(d.max) || 0));
    setSavingId(p.id);
    try {
      await productsApi.update(p.id, { regaloMismo: true, regaloMismoMax: max });
      patchLocal(p.id, { regaloMismo: true, regaloMismoMax: max });
      toast.success(`Regalo del mismo habilitado en "${p.name}"`);
      cerrarEdicion();
      cargarOfertasActivas();
    } catch { toast.error("Error al guardar"); } finally { setSavingId(null); }
  };
```
Reemplazar `guardarRegaloOtro`:
```ts
  const guardarRegaloOtro = async (p: Product) => {
    const d = comboDraft[p.id];
    if (!d) return;
    if (!d.productoId) { toast.error("Elegí el producto a regalar"); return; }
    const max = d.max.trim() === "" ? null : Math.max(1, Math.floor(Number(d.max) || 0));
    setSavingId(p.id);
    try {
      await productsApi.update(p.id, {
        regaloProductoId: d.productoId,
        regaloProductoNombre: d.nombre,
        regaloOtroMax: max,
      });
      patchLocal(p.id, { regaloProductoId: d.productoId, regaloProductoNombre: d.nombre, regaloOtroMax: max });
      const b = await productsApi.getByIds([d.productoId]);
      if (b[0]) setStockB((prev) => ({ ...prev, [d.productoId!]: b[0].stock }));
      toast.success(`Combo guardado en "${p.name}"`);
      cerrarEdicion();
      cargarOfertasActivas();
    } catch { toast.error("Error al guardar"); } finally { setSavingId(null); }
  };
```

- [ ] **Step 6: `quitarOferta` — regalo mismo/otro nuevos**

En `quitarOferta`, reemplazar las ramas:
```ts
      } else if (tipo === "regalo_mismo") {
        await productsApi.update(p.id, { regaloMismo: false, regaloMismoMax: null });
        patchLocal(p.id, { regaloMismo: false, regaloMismoMax: null });
      } else {
        await productsApi.update(p.id, { regaloProductoId: null, regaloProductoNombre: null, regaloOtroMax: null });
        patchLocal(p.id, { regaloProductoId: null, regaloProductoNombre: null, regaloOtroMax: null });
      }
```

- [ ] **Step 7: `elegirComboProducto` — sin `cada`/`cantidad`**

Reemplazar:
```ts
  const elegirComboProducto = (pId: string, prod: Product) => {
    setComboDraft((prev) => ({ ...prev, [pId]: { ...(prev[pId] || { max: "" }), productoId: prod.id, nombre: prod.name } }));
    setStockB((prev) => ({ ...prev, [prod.id]: prod.stock }));
    setComboSearch("");
    setComboResults([]);
  };
```

- [ ] **Step 8: JSX — descuento (label) , regalo mismo, regalo otro, quitar panel cupos**

- En el panel de edición `editing.tipo === "descuento"`, cambiar el label `% de descuento` por `% máximo de descuento`.
- Reemplazar el bloque `editing.tipo === "regalo_mismo"` por un único input opcional:
```tsx
                      {editing.tipo === "regalo_mismo" && (
                        <div className="flex items-end gap-3 flex-wrap">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground mb-0.5">máx a regalar (vacío = libre)</span>
                            <Input type="number" min={1}
                              value={mismoDraft[p.id]?.max ?? ""}
                              onChange={(e) => setMismoDraft((prev) => ({ ...prev, [p.id]: { max: e.target.value } }))}
                              className="h-8 w-28 text-center text-sm" placeholder="libre" />
                          </div>
                          <Button size="sm" disabled={savingId === p.id} onClick={() => guardarRegaloMismo(p)} className="h-8 gap-1 ml-auto">
                            {savingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
                          </Button>
                        </div>
                      )}
```
- En el bloque `editing.tipo === "regalo_otro"`, reemplazar el `<div className="flex items-end gap-3 flex-wrap">` con los inputs `cada`/`regala` por un único input `max`:
```tsx
                          <div className="flex items-end gap-3 flex-wrap">
                            <div className="flex flex-col">
                              <span className="text-[9px] text-muted-foreground mb-0.5">máx a regalar (vacío = libre)</span>
                              <Input type="number" min={1}
                                value={comboDraft[p.id]?.max ?? ""}
                                onChange={(e) => setComboDraft((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] || { productoId: null, nombre: "" }), max: e.target.value } }))}
                                className="h-8 w-28 text-center text-sm" placeholder="libre" />
                            </div>
                            <Button size="sm" disabled={savingId === p.id} onClick={() => guardarRegaloOtro(p)} className="h-8 gap-1 ml-auto">
                              {savingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
                            </Button>
                          </div>
```
- Eliminar el bloque "Panel de cupos por vendedor" completo (`{cuposOpenId === p.id && (...)}`) y, en la `OfferRow` de descuento, quitar `onCupos`/`cuposActive`. Eliminar el bloque de aviso "Sin cupos asignados" (`{cuposTotales[p.id] === 0 && ...}`).
- En `OfferRow` (sub-componente), quitar props `onCupos`/`cuposActive` y el `<Button>` de cupos (icono `Users`).
- Actualizar el texto de la tarjeta info (`Cada producto puede tener hasta 3 ofertas...`) a la nueva semántica (máx %, regala mismo libre/tope, regala otro libre/tope).

- [ ] **Step 9: Build**

Run: `npm run build`
Expected: descuentos sin errores; quedan errores en useCart/sales-service/mayorista.

---

## FASE 3 — Carrito

### Tarea 4: Lógica del carrito (`hooks/useCart.ts`)

**Files:** Modify `hooks/useCart.ts`

- [ ] **Step 1: Quitar imports y estado de cupos/maxDiscount**

- Quitar `import { descontarVendedor } from "@/services/descuento-vendedor-service";`.
- Cambiar `import { unidadesRegalo, maxQtyPagable } from "@/lib/utils/promo";` → eliminar (ya no se usan; ver Tarea 8).
- Eliminar el estado `sellerMaxDiscount` y su `set` (líneas ~214), y todas sus apariciones en dependencias `[sellerMaxDiscount]`.
- En la respuesta de `/api/public/vendedores` (donde hace `setSellerMaxDiscount(data.sellerMaxDiscount ...)`, ~386), eliminar esa línea.
- Eliminar el `useEffect` "Re-aplica el tope de descuento del vendedor" (líneas ~398-415) completo.
- En la sección de carga de datos donde hace `setSellerMaxDiscount(seller?.maxDiscount ?? 100)` (~1165), eliminarla.
- Quitar `sellerMaxDiscount` del objeto `state` retornado (~67, ~1147).

- [ ] **Step 2: `addToCart` sin descuento base ni cupo**

Reemplazar `addToCart` (~533-567) por:
```ts
  const addToCart = useCallback((product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        const regalo = existing.regalo ?? 0;
        if (existing.quantity + 1 + regalo > product.stock) {
          toast.error("Stock insuficiente");
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);
```

- [ ] **Step 3: `updateQuantity` y `setQuantityDirect` sin ratio/cupo**

Reemplazar `updateQuantity` (~569-591):
```ts
  const updateQuantity = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return { ...item, quantity: 0 };
          if (newQty + (item.regalo ?? 0) > item.product.stock) {
            toast.error("Stock insuficiente");
            return item;
          }
          return { ...item, quantity: newQty };
        })
        .filter((item) => item.quantity > 0),
    );
  }, []);
```
Reemplazar `setQuantityDirect` (~593-609):
```ts
  const setQuantityDirect = useCallback((productId: string, value: number) => {
    setCart((prev) => {
      const item = prev.find((i) => i.product.id === productId);
      if (!item) return prev;
      const maxPagable = Math.max(1, item.product.stock - (item.regalo ?? 0));
      const newQty = Math.max(1, Math.min(value, maxPagable));
      return prev.map((i) => (i.product.id === productId ? { ...i, quantity: newQty } : i));
    });
  }, []);
```

- [ ] **Step 4: `setItemDiscount` con tope del producto**

Reemplazar `setItemDiscount` (~614-627):
```ts
  // El máximo es el % configurado en el producto (product.descuento). 0 = no admite.
  const setItemDiscount = useCallback((productId: string, discount: number) => {
    setCart((prev) => prev.map((item) => {
      if (item.product.id !== productId) return item;
      const max = item.product.descuento ?? 0;
      if (discount > max) toast.error(`Descuento máximo del producto: ${max}%`);
      const clamped = Math.max(0, Math.min(max, discount));
      return { ...item, itemDiscount: clamped || undefined };
    }));
  }, []);
```

- [ ] **Step 5: Nuevos `setItemRegaloMismo` y `setItemRegaloOtro`**

Agregar junto a `setItemDiscount`:
```ts
  const setItemRegaloMismo = useCallback((productId: string, n: number) => {
    setCart((prev) => prev.map((item) => {
      if (item.product.id !== productId) return item;
      const max = item.product.regaloMismoMax ?? Infinity;
      let val = Math.max(0, Math.floor(n || 0));
      if (val > max) { toast.error(`Máximo a regalar: ${max}`); val = max; }
      if (item.quantity + val > item.product.stock) {
        toast.error("Stock insuficiente para ese regalo");
        val = Math.max(0, item.product.stock - item.quantity);
      }
      return { ...item, regalo: val || undefined };
    }));
  }, []);

  const setItemRegaloOtro = useCallback((productId: string, n: number) => {
    setCart((prev) => prev.map((item) => {
      if (item.product.id !== productId) return item;
      const max = item.product.regaloOtroMax ?? Infinity;
      let val = Math.max(0, Math.floor(n || 0));
      if (val > max) { toast.error(`Máximo a regalar: ${max}`); val = max; }
      return { ...item, regaloOtroCantidad: val || undefined };
    }));
  }, []);
```
Exponerlas en `actions` (junto a `setItemDiscount` en el objeto retornado y en su tipo `CartActions`).

- [ ] **Step 6: `handleProcessSale` — quitar `descontarOfertasVendidas`**

Eliminar la función interna `descontarOfertasVendidas` (~803-816) y su invocación (buscar `descontarOfertasVendidas()` y borrar la llamada). El stock de regalo lo maneja `sales-service` con los valores manuales.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: useCart sin errores; quedan errores en UnifiedCart (props), sales-service, mayorista.

### Tarea 5: UI del carrito (`components/cart/UnifiedCart.tsx`)

**Files:** Modify `components/cart/UnifiedCart.tsx`

- [ ] **Step 1: Quitar `sellerMaxDiscount` y `unidadesRegalo`**

- Quitar `import { unidadesRegalo } from "@/lib/utils/promo";`.
- Reemplazar `const maxDiscountAllowed = state.sellerMaxDiscount;` por nada (se usa por ítem).
- En el render del ítem (~225-227) reemplazar:
```ts
              const lineFinal = item.itemDiscount ? lineTotal * (1 - item.itemDiscount / 100) : lineTotal;
              const regalo = unidadesRegalo(item.quantity, item.product.regaloCada, item.product.regaloCantidad);
              const regaloCruzadoCant = unidadesRegalo(item.quantity, item.product.regaloProductoCada, item.product.regaloProductoCantidad);
```
por:
```ts
              const lineFinal = item.itemDiscount ? lineTotal * (1 - item.itemDiscount / 100) : lineTotal;
              const regalo = item.regalo ?? 0;
              const regaloCruzadoCant = item.regaloOtroCantidad ?? 0;
```

- [ ] **Step 2: `ItemDiscountRow` con tope del producto**

- Donde se renderiza `<ItemDiscountRow ... maxDiscountAllowed={maxDiscountAllowed} />` (~309-312), cambiar a `maxDiscountAllowed={item.product.descuento ?? 0}` y renderizarlo solo si `(item.product.descuento ?? 0) > 0`.
- En el sub-componente `ItemDiscountRow` (~757-768): `adminDto` ya no existe; `const adminDto = 0;` o eliminar su uso. `maxSeller = maxDiscountAllowed`. La función que calcula el % por precio (`pctTotal - adminDto`) pasa a `pctTotal`. El `onChange` (~807) `actions.setItemDiscount(item.product.id, Number(e.target.value) || 0)` queda igual (el clamp lo hace useCart).

- [ ] **Step 3: Inputs de regalo por ítem**

Debajo del `ItemDiscountRow` de cada ítem (dentro del bloque del ítem, ~309), agregar:
```tsx
                  {item.product.regaloMismo && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">Regalar (mismo):</span>
                      <input type="number" min={0}
                        value={item.regalo ?? ""}
                        onChange={(e) => actions.setItemRegaloMismo(item.product.id, Number(e.target.value) || 0)}
                        className="h-7 w-16 rounded-lg border border-input bg-background px-2 text-center text-xs" />
                    </div>
                  )}
                  {item.product.regaloProductoId && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">Regalar {item.product.regaloProductoNombre}:</span>
                      <input type="number" min={0}
                        value={item.regaloOtroCantidad ?? ""}
                        onChange={(e) => actions.setItemRegaloOtro(item.product.id, Number(e.target.value) || 0)}
                        className="h-7 w-16 rounded-lg border border-input bg-background px-2 text-center text-xs" />
                    </div>
                  )}
```
Las etiquetas de regalo existentes (~293-308, "+{regalo} de regalo" y "Regala {regaloCruzadoCant}×") se mantienen y ahora reflejan los valores manuales.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: UnifiedCart sin errores; quedan sales-service y mayorista.

---

## FASE 4 — Build de venta

### Tarea 6: `sales-service.ts` — regalos manuales (2 paths)

**Files:** Modify `services/sales-service.ts`

- [ ] **Step 1: Quitar import de helpers de ratio**

Cambiar `import { unidadesRegalo, calcularRegalosCruzados } from '@/lib/utils/promo'` → eliminar la línea.

- [ ] **Step 2: Path 1 (processSale, ~183-200) — usar valores manuales**

Reemplazar:
```ts
  const regalosCruzados = calcularRegalosCruzados(data.items)
  const saleItems: Record<string, any>[] = data.items.map((item) => {
    const regalo = unidadesRegalo(item.quantity, item.product.regaloCada, item.product.regaloCantidad)
    return {
```
por:
```ts
  const regalosCruzados = data.items
    .filter((it) => (it.regaloOtroCantidad ?? 0) > 0 && it.product.regaloProductoId)
    .map((it) => ({ productoId: it.product.regaloProductoId as string, nombre: it.product.regaloProductoNombre ?? 'Regalo', cantidad: it.regaloOtroCantidad as number }))
  const saleItems: Record<string, any>[] = data.items.map((item) => {
    const regalo = item.regalo ?? 0
    return {
```

- [ ] **Step 3: Path 1 — stock (~233)**

Reemplazar `const regaloMismo = unidadesRegalo(item.quantity, item.product.regaloCada, item.product.regaloCantidad)` por:
```ts
    const regaloMismo = item.regalo ?? 0
```
El bloque que descuenta `regalosCruzados` (más abajo) ya itera sobre el array nuevo: queda igual.

- [ ] **Step 4: Path 2 (modo, ~533 y ~549) — usar valores manuales**

Reemplazar `const regalo = unidadesRegalo(cantidadPedida, item.product.regaloCada, item.product.regaloCantidad)` por:
```ts
    const regalo = item.regalo ?? 0
```
Reemplazar:
```ts
  const regalosCruzados = calcularRegalosCruzados(data.items)
```
por:
```ts
  const regalosCruzados = data.items
    .filter((it) => (it.regaloOtroCantidad ?? 0) > 0 && it.product.regaloProductoId)
    .map((it) => ({ productoId: it.product.regaloProductoId as string, nombre: it.product.regaloProductoNombre ?? 'Regalo', cantidad: it.regaloOtroCantidad as number }))
```
El resto (`itemsRegaloMismo` usa `i.regalo`, `itemsRegaloCruzado` usa `regalosCruzados`) queda igual.

- [ ] **Step 5: Verificar el tipo de `data.items`**

`grep -n "items:" services/sales-service.ts` para ubicar el tipo del parámetro. Asegurar que el tipo de cada item incluya `regalo?: number` y `regaloOtroCantidad?: number` (si el tipo es `CartItem[]` ya quedan por Tarea 1; si es un tipo local, agregarlos).

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: sales-service sin errores; queda mayorista y limpieza.

---

## FASE 5 — Limpieza transversal

### Tarea 7: Eliminar cupos y `maxDiscount` del resto

**Files:** Delete `services/descuento-vendedor-service.ts`; Modify `services/mayorista-service.ts`, `services/sellers-service.ts`, `app/empleados/page.tsx`, `app/api/public/vendedores/route.ts`, `app/ventas/nueva/page.tsx`, `lib/utils/promo.ts`

- [ ] **Step 1: `mayorista-service.ts`**

- Quitar `import { getAsignacionesVendedor, getProductosConOfertaVendedor } from '@/services/descuento-vendedor-service'`.
- En el filtro `soloDescuento` para `vendedorId` (~173-175), reemplazar el uso de `getProductosConOfertaVendedor` por filtrar `descuento > 0` directamente en la query (igual que admin). Concretamente, eliminar la rama que usa `ofertaIds` y dejar el filtro de descuento común a admin y vendedor.
- Quitar `const asignaciones = vendedorId && prodIds.length > 0 ? await getAsignacionesVendedor(...) : {}` (~207-208).
- Reemplazar (~228) `descuentoCantidad: descuento > 0 ? (vendedorId ? (asignaciones[mp.producto_id] ?? 0) : null) : null,` por `descuentoCantidad: descuento > 0 ? null : null,` (o quitar el campo si el tipo lo permite; el tipo `MayoristaProducto.descuentoCantidad` puede quedar siempre null).

- [ ] **Step 2: `sellers-service.ts` — quitar `maxDiscount`**

- En `mapSeller`, quitar `maxDiscount: d.descuento_maximo != null ? Number(d.descuento_maximo) : 30,`.
- En `createSeller`, quitar `descuento_maximo: seller.maxDiscount ?? 30,`.
- En `updateSeller`, quitar `if (updates.maxDiscount !== undefined) mapped.descuento_maximo = updates.maxDiscount`.

- [ ] **Step 3: `app/empleados/page.tsx` — quitar campo `maxDiscount`**

- En `formData` quitar `maxDiscount: 30,` (estado, reset y `handleEdit`).
- En `handleSave`/`payload` quitar `maxDiscount: formData.isVendedor ? formData.maxDiscount : 0,`.
- En el JSX quitar el input de `formData.maxDiscount` (campo "Descuento máximo").

- [ ] **Step 4: `app/api/public/vendedores/route.ts`**

Quitar de la respuesta JSON el campo `sellerMaxDiscount` (y cualquier lectura de `maxDiscount`/`descuento_maximo`). `grep -n "maxDiscount\|descuento_maximo\|sellerMaxDiscount" app/api/public/vendedores/route.ts` y eliminar esas líneas.

- [ ] **Step 5: `app/ventas/nueva/page.tsx`**

- Quitar `descuentoCantidad: p.descuentoCantidad ?? null,` (~140) del armado del producto.
- En el sub-componente del card (~487-507), reemplazar:
```ts
  const descuento = (product as any).descuento ?? 0;
  const descuentoCantidad = (product as any).descuentoCantidad;
  const ofertaActiva = descuento > 0 && (descuentoCantidad == null || descuentoCantidad > 0);
```
por:
```ts
  const descuento = (product as any).descuento ?? 0;
  const ofertaActiva = descuento > 0;
```
- Reemplazar el texto `{descuento}% dto.{descuentoCantidad != null ? ` · ${descuentoCantidad}u` : ""}` por `hasta {descuento}% dto.`.
- El precio mostrado con descuento (`product.price * (1 - descuento / 100)`) ahora es "precio con el máximo": dejarlo o cambiar el rótulo a "desde". Mantener el cálculo, cambiar contexto si hace falta (opcional).

- [ ] **Step 6: `lib/utils/promo.ts` — eliminar helpers de ratio**

Borrar el archivo `lib/utils/promo.ts` (ya no se importa en ningún lado tras las tareas previas). Verificar: `grep -rn "utils/promo" .` → sin resultados. Si queda alguna referencia, eliminarla.

- [ ] **Step 7: Eliminar `services/descuento-vendedor-service.ts`**

Borrar el archivo. Verificar: `grep -rn "descuento-vendedor-service" .` → sin resultados.

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: compila sin errores. Si quedan, son referencias residuales a campos viejos; corregirlas.

---

## FASE 6 — Verificación y commit

### Tarea 8: Build final y commit único

- [ ] **Step 1: Grep de residuos**

Run:
```bash
grep -rn "descuento_vendedor\|descontarVendedor\|getAsignaciones\|getTotalesCupos\|sellerMaxDiscount\|maxDiscount\|descuentoCantidad\|regaloCada\|regaloCantidad\|regaloProductoCada\|regaloProductoCantidad\|unidadesRegalo\|calcularRegalosCruzados\|maxQtyPagable" app components hooks services lib
```
Expected: sin resultados (o solo en docs).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit y push**

```bash
git add lib/types.ts services/products-service.ts app/descuentos/page.tsx \
  hooks/useCart.ts components/cart/UnifiedCart.tsx services/sales-service.ts \
  services/mayorista-service.ts services/sellers-service.ts app/empleados/page.tsx \
  app/api/public/vendedores/route.ts app/ventas/nueva/page.tsx
git rm lib/utils/promo.ts services/descuento-vendedor-service.ts
git commit -m "feat: rediseno de ofertas — % como maximo, regalos libres, sin cupos ni tope global por vendedor"
git push origin main
```

---

## Notas de ejecución

- **SQL ya ejecutado** (columnas `regalo_mismo`/`regalo_mismo_max`/`regalo_otro_max`, tabla `descuento_vendedor` dropeada).
- **Orden:** Fase 1 rompe el build a propósito (cambia tipos); las fases siguientes lo van arreglando. No commitear hasta Fase 6.
- **Riesgo alto:** `sales-service.ts` toca stock y líneas de venta — probar una venta con descuento + regalo mismo + regalo otro y verificar stock descontado y líneas `esRegalo`.
- **Datos viejos:** las promos viejas (ratio `regalo_cada`) ya no se leen; el admin reconfigura las que quiera con la nueva UI.
