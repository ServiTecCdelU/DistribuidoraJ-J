# Patrones React/Next del proyecto

## Server vs Client Component
```tsx
// Server (default): sin "use client". Puede ser async, fetch directo.
export default async function ProductosPage() {
  const productos = await api.products.getAll();
  return <ListaProductos data={productos} />;
}

// Client: solo cuando hace falta interactividad.
"use client";
import { useState } from "react";
```

## Form con react-hook-form + zod
```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({ nombre: z.string().min(1), precio: z.number().positive() });
type Form = z.infer<typeof schema>;

const { register, handleSubmit, formState: { errors } } = useForm<Form>({
  resolver: zodResolver(schema),
});
```

## Acceso a datos vía fachada
```tsx
import { api } from "@/lib/api";          // ✅ siempre desde la fachada
// import { getProducts } from "@/services/products-service"; ❌ no directo
```

## Formato de moneda y fecha
```tsx
import { formatCurrency } from "@/lib/utils/format";
import { toDate } from "@/services/supabase-helpers";
formatCurrency(1500);          // "$ 1.500"
toDate(venta.created_at);      // Date desde valor legacy
```

## Toast de error
```tsx
import { toast } from "sonner";
try { await api.sales.create(data); }
catch (e) { toast.error("No se pudo registrar la venta"); }
```

## Dynamic import para libs pesadas (cliente)
```tsx
const RouteMap = dynamic(() => import("@/components/pedidos/route-map-view"), { ssr: false });
```

## Carrito (no reimplementar)
```tsx
import { useCart } from "@/hooks/useCart";
// UnifiedCart se adapta por rol: "admin" | "seller" | null
```

## Listas grandes (mayorista ~7400)
- Paginar o virtualizar. Memoizar filtros/derivados con `useMemo`.
- Keys estables (id del producto), nunca el índice.
