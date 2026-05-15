# Plan de Migración: Firebase → Supabase (100% — Auth + DB + Storage)

## Estado: EN PROGRESO — Fase 1 (migración de datos)

### Progreso al 2026-05-14
- [x] **Fase 0.2** — `@supabase/supabase-js` instalado
- [x] **Fase 0.3** — Clientes Supabase creados (`lib/supabase.ts`, `lib/supabase-admin.ts`)
- [x] **Fase 0.5** — Schema PostgreSQL ejecutado en Supabase (sin RLS)
- [x] **Fase 1 parcial** — `productos`: 1836/1838 migrados (2 fallaron por dato corrupto, se recargan desde Excel)
- [ ] **Fase 1 pendiente** — Resto de colecciones: cuota diaria Firestore Spark agotada. Relanzar `npx tsx scripts/migrate-to-supabase.ts` mañana.
- [ ] **Fase 1 pendiente** — `mayorista_productos`: se recarga desde Excel directo a Supabase (8000 docs, no migrar desde Firestore)
- [ ] **Fase 0.1** — Configurar Google OAuth provider en Supabase Dashboard (pendiente)
- [ ] **Fase 0.4** — Crear bucket `facturas` en Supabase Storage (pendiente)
- [ ] **Fases 2-6** — Pendientes

### Notas
- El script está en `scripts/migrate-to-supabase.ts`, ya salta `productos` y `mayorista_productos`
- Env vars de Supabase ya están en `.env`
- Branch: `migrate/supabase`

---

## Resumen Ejecutivo

Eliminar Firebase completamente. Migrar todo a Supabase:
- **Auth**: Firebase Auth (Google OAuth) → Supabase Auth (Google OAuth)
- **Database**: Firestore (14 colecciones) → PostgreSQL (14 tablas)
- **Storage**: Firebase Storage (PDFs facturación) → Supabase Storage

No se usa `onSnapshot` en ningún lugar — todo son lecturas únicas. El login actual es solo Google (no hay email/password en el UI).

### Beneficios
- Una sola plataforma, una sola consola, un solo SDK
- Operaciones masivas en SQL (8000 productos)
- Transacciones ACID (processSale atómico)
- Joins reales (mayorista + productos)
- Costos predecibles

### Qué NO cambia
- **Frontend** — componentes React, UI, rutas, estilos
- **lib/api.ts** — la fachada mantiene la misma interfaz
- **Lógica de negocio** — mismas reglas, mismos flujos
- **AFIP** — `@afipsdk/afip.js` no depende de Firebase

---

## Arquitectura Destino

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (sin cambios)                │
│         componentes, hooks, lib/api.ts (fachada)        │
└──────────────────────┬──────────────────────────────────┘
                       │
              ┌────────┴────────┐
              │    Supabase     │
              ├─────────────────┤
              │  Auth (Google)  │
              │  PostgreSQL     │
              │  Storage (PDFs) │
              └─────────────────┘
```

---

## Fase 0: Setup Supabase

### 0.1 — Crear proyecto Supabase
- Crear proyecto en supabase.com
- Configurar Google OAuth provider en Supabase Dashboard → Authentication → Providers → Google
  - Usar las mismas credenciales OAuth de Google Cloud Console que usa Firebase hoy
- Obtener: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### 0.2 — Instalar dependencia
```bash
npm install @supabase/supabase-js
```
Desinstalar después de migrar:
```bash
npm uninstall firebase firebase-admin @firebase/app @firebase/auth @firebase/firestore @firebase/storage
```

### 0.3 — Crear clientes Supabase

**`lib/supabase.ts`** (client-side — reemplaza `lib/firebase.ts`):
```ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

**`lib/supabase-admin.ts`** (server-side — reemplaza `lib/firebase-admin.ts`):
```ts
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
```

### 0.4 — Crear bucket de Storage
- Crear bucket `facturas` en Supabase Storage (para PDFs de facturación)
- Política: lectura pública, escritura solo con service_role

### 0.5 — Schema PostgreSQL

```sql
-- =============================================
-- USUARIOS
-- =============================================
CREATE TABLE usuarios (
  id TEXT PRIMARY KEY,                    -- ID legible: usuario_juanperez_1
  auth_uid UUID UNIQUE,                  -- Supabase Auth UUID (de auth.users)
  email TEXT,
  name TEXT,
  role TEXT CHECK (role IN ('admin', 'seller', 'customer')) DEFAULT 'customer',
  seller_id TEXT,
  employee_type TEXT CHECK (employee_type IN ('vendedor', 'transportista', 'ambos')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- PRODUCTOS
-- =============================================
CREATE TABLE productos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  brand TEXT,
  code TEXT,
  price NUMERIC(12,2) DEFAULT 0,
  selling_price NUMERIC(12,2) DEFAULT 0,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  image_url TEXT,
  disabled BOOLEAN DEFAULT false,
  unidades_por_bulto INTEGER,
  se_divide_en TEXT,
  precio_venta NUMERIC(12,2),
  ganancia_global NUMERIC(8,2),
  ganancia_individual NUMERIC(8,2),
  codigo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_productos_category ON productos(category);
CREATE INDEX idx_productos_code ON productos(code);
CREATE INDEX idx_productos_disabled ON productos(disabled);

-- =============================================
-- MAYORISTA_PRODUCTOS
-- =============================================
CREATE TABLE mayorista_productos (
  id TEXT PRIMARY KEY,
  codigo TEXT,
  descripcion TEXT,
  precio_lista NUMERIC(12,2),
  habilitado BOOLEAN DEFAULT false,
  producto_id TEXT REFERENCES productos(id),
  stock_local INTEGER DEFAULT 0,
  stock_transito INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_mp_codigo ON mayorista_productos(codigo);
CREATE INDEX idx_mp_habilitado ON mayorista_productos(habilitado);
CREATE INDEX idx_mp_producto_id ON mayorista_productos(producto_id);

-- =============================================
-- CLIENTES
-- =============================================
CREATE TABLE clientes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  dni TEXT,
  cuit TEXT,
  tax_category TEXT,
  credit_limit NUMERIC(12,2) DEFAULT 0,
  current_balance NUMERIC(12,2) DEFAULT 0,
  addresses JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_clientes_dni ON clientes(dni);
CREATE INDEX idx_clientes_cuit ON clientes(cuit);
CREATE INDEX idx_clientes_email ON clientes(email);

-- =============================================
-- VENDEDORES
-- =============================================
CREATE TABLE vendedores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  employee_type TEXT CHECK (employee_type IN ('vendedor', 'transportista', 'ambos')),
  commission_rate NUMERIC(5,2) DEFAULT 10,            -- % vendedor (ej: 10 = 10%)
  transportista_commission_rate NUMERIC(5,2) DEFAULT 10, -- % transportista
  total_sales NUMERIC(12,2) DEFAULT 0,
  total_commission NUMERIC(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- VENTAS
-- =============================================
CREATE TABLE ventas (
  id TEXT PRIMARY KEY,
  sale_number TEXT,
  client_id TEXT REFERENCES clientes(id),
  client_name TEXT,
  client_phone TEXT,
  seller_id TEXT REFERENCES vendedores(id),
  seller_name TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) DEFAULT 0,
  tax NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  payment_type TEXT CHECK (payment_type IN ('cash', 'credit', 'mixed')),
  cash_amount NUMERIC(12,2),
  credit_amount NUMERIC(12,2),
  status TEXT DEFAULT 'completed',
  source TEXT DEFAULT 'direct',
  order_id TEXT,
  delivery_method TEXT DEFAULT 'pickup',
  delivery_address TEXT,
  invoice_emitted BOOLEAN DEFAULT false,
  invoice_number TEXT,
  invoice_status TEXT,
  invoice_pdf_base64 TEXT,
  invoice_pdf_url TEXT,
  invoice_whatsapp_url TEXT,
  afip_data JSONB,
  remito_number TEXT,
  remito_pdf_base64 TEXT,
  remito_pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ventas_client ON ventas(client_id);
CREATE INDEX idx_ventas_seller ON ventas(seller_id);
CREATE INDEX idx_ventas_created ON ventas(created_at DESC);

-- =============================================
-- TRANSACCIONES
-- =============================================
CREATE TABLE transacciones (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clientes(id),
  type TEXT CHECK (type IN ('debt', 'payment')),
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  sale_id TEXT REFERENCES ventas(id),
  date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_transacciones_client ON transacciones(client_id);

-- =============================================
-- PEDIDOS
-- =============================================
CREATE TABLE pedidos (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clientes(id),
  client_name TEXT,
  seller_id TEXT REFERENCES vendedores(id),
  seller_name TEXT,
  transportista_id TEXT REFERENCES vendedores(id),
  transportista_name TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  checked_items JSONB DEFAULT '[]'::jsonb,
  status TEXT CHECK (status IN ('pending', 'preparation', 'delivery', 'completed')) DEFAULT 'pending',
  address TEXT,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  source TEXT,
  sale_id TEXT,
  invoice_number TEXT,
  invoice_pdf_base64 TEXT,
  remito_number TEXT,
  remito_pdf_base64 TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_pedidos_status ON pedidos(status);
CREATE INDEX idx_pedidos_transportista ON pedidos(transportista_id);
CREATE INDEX idx_pedidos_created ON pedidos(created_at DESC);

-- =============================================
-- COMISIONES
-- =============================================
CREATE TABLE comisiones (
  id TEXT PRIMARY KEY,
  seller_id TEXT REFERENCES vendedores(id),
  seller_name TEXT,
  sale_id TEXT REFERENCES ventas(id),
  sale_total NUMERIC(12,2),
  commission_rate NUMERIC(5,4),
  commission_amount NUMERIC(12,2),
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_comisiones_seller ON comisiones(seller_id);
CREATE INDEX idx_comisiones_paid ON comisiones(is_paid);

-- =============================================
-- CAJA
-- =============================================
CREATE TABLE caja (
  id TEXT PRIMARY KEY,
  date TEXT,
  type TEXT,
  amount NUMERIC(12,2),
  description TEXT,
  user_id TEXT,
  user_name TEXT,
  sale_id TEXT,
  payment_method TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_caja_date ON caja(date);
CREATE INDEX idx_caja_type ON caja(type);

-- =============================================
-- AUDITORIA
-- =============================================
CREATE TABLE auditoria (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  user_id TEXT,
  user_email TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_auditoria_entity ON auditoria(entity_type, entity_id);
CREATE INDEX idx_auditoria_created ON auditoria(created_at DESC);

-- =============================================
-- LISTAS DE PRECIOS
-- =============================================
CREATE TABLE listas_precios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  multiplier NUMERIC(6,4) DEFAULT 1.0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- STOCK MOVIMIENTOS
-- =============================================
CREATE TABLE stock_movimientos (
  id SERIAL PRIMARY KEY,
  mayorista_producto_id TEXT REFERENCES mayorista_productos(id),
  tipo TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  stock_anterior INTEGER,
  stock_posterior INTEGER,
  motivo TEXT,
  venta_id TEXT,
  usuario_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_stock_mov_mp ON stock_movimientos(mayorista_producto_id);

-- =============================================
-- PEDIDOS MAYORISTA
-- =============================================
CREATE TABLE pedidos_mayorista (
  id TEXT PRIMARY KEY,
  estado TEXT CHECK (estado IN ('borrador', 'enviado', 'recibido_parcial', 'cerrado')),
  productos JSONB DEFAULT '[]'::jsonb,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- CONFIGURACION
-- =============================================
CREATE TABLE configuracion (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- TRIGGERS: updated_at automático
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_productos BEFORE UPDATE ON productos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_mp BEFORE UPDATE ON mayorista_productos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clientes BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_vendedores BEFORE UPDATE ON vendedores FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ventas BEFORE UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pedidos BEFORE UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_listas BEFORE UPDATE ON listas_precios FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pm BEFORE UPDATE ON pedidos_mayorista FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_usuarios BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- RPC: processSale atómico
-- =============================================
CREATE OR REPLACE FUNCTION process_sale(sale_data JSONB)
RETURNS JSONB AS $$
DECLARE
  v_sale_id TEXT;
  v_item JSONB;
  v_total NUMERIC;
  v_credit_amount NUMERIC;
BEGIN
  v_sale_id := sale_data->>'id';
  v_total := (sale_data->>'total')::NUMERIC;

  -- 1. Insertar venta
  INSERT INTO ventas (id, sale_number, client_id, client_name, client_phone,
    seller_id, seller_name, items, subtotal, tax, total,
    payment_type, cash_amount, credit_amount, status, source,
    order_id, delivery_method, delivery_address)
  VALUES (
    v_sale_id, sale_data->>'sale_number', sale_data->>'client_id',
    sale_data->>'client_name', sale_data->>'client_phone',
    sale_data->>'seller_id', sale_data->>'seller_name',
    sale_data->'items', (sale_data->>'subtotal')::NUMERIC,
    (sale_data->>'tax')::NUMERIC, v_total,
    sale_data->>'payment_type', (sale_data->>'cash_amount')::NUMERIC,
    (sale_data->>'credit_amount')::NUMERIC,
    COALESCE(sale_data->>'status', 'completed'),
    COALESCE(sale_data->>'source', 'direct'),
    sale_data->>'order_id',
    COALESCE(sale_data->>'delivery_method', 'pickup'),
    sale_data->>'delivery_address'
  );

  -- 2. Descontar stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(sale_data->'items')
  LOOP
    UPDATE productos
    SET stock = stock - (v_item->>'quantity')::INTEGER
    WHERE id = v_item->'product'->>'id';
  END LOOP;

  -- 3. Crédito del cliente
  v_credit_amount := COALESCE((sale_data->>'credit_amount')::NUMERIC, 0);
  IF v_credit_amount > 0 AND sale_data->>'client_id' IS NOT NULL THEN
    UPDATE clientes
    SET current_balance = current_balance + v_credit_amount
    WHERE id = sale_data->>'client_id';

    INSERT INTO transacciones (id, client_id, type, amount, description, sale_id)
    VALUES ('trans_' || v_sale_id, sale_data->>'client_id', 'debt',
            v_credit_amount, 'Venta a crédito', v_sale_id);
  END IF;

  -- 4. Comisión del vendedor
  IF sale_data->>'seller_id' IS NOT NULL THEN
    INSERT INTO comisiones (id, seller_id, seller_name, sale_id, sale_total,
      commission_rate, commission_amount)
    VALUES ('com_' || v_sale_id, sale_data->>'seller_id',
            sale_data->>'seller_name', v_sale_id, v_total, 0.1, v_total * 0.1);

    UPDATE vendedores
    SET total_sales = total_sales + v_total,
        total_commission = total_commission + (v_total * 0.1)
    WHERE id = sale_data->>'seller_id';
  END IF;

  RETURN jsonb_build_object('sale_id', v_sale_id, 'success', true);
END;
$$ LANGUAGE plpgsql;
```

---

## Fase 1: Migración de datos

### 1.1 — Script de migración (`scripts/migrate-to-supabase.ts`)
- Leer cada colección de Firestore con firebase-admin
- Transformar camelCase → snake_case
- Upsert en Supabase por batches
- Validar conteos

### 1.2 — Orden (por dependencias FK)
1. `productos` → `mayorista_productos`
2. `clientes`
3. `vendedores` → `usuarios`
4. `ventas` → `transacciones` → `comisiones`
5. `pedidos`
6. `caja`, `auditoria`, `listas_precios`, `configuracion`
7. `stock_movimientos`, `pedidos_mayorista`

### 1.3 — Migrar Storage
- Descargar PDFs de Firebase Storage
- Subir a Supabase Storage bucket `facturas`
- Actualizar URLs en tabla `ventas`

### 1.4 — Validación post-migración
- Conteos por tabla
- Integridad referencial
- Spot-check 10 docs por colección

---

## Fase 2: Migrar Auth

### 2.1 — Reescribir `services/auth-service.ts`
| Firebase | Supabase |
|----------|----------|
| `signInWithPopup(auth, GoogleProvider)` | `supabase.auth.signInWithOAuth({ provider: 'google' })` |
| `firebaseSignOut(auth)` | `supabase.auth.signOut()` |
| `onAuthStateChanged(auth, cb)` | `supabase.auth.onAuthStateChange((event, session) => cb(session?.user))` |
| `currentUser.getIdToken()` | `supabase.auth.getSession()` → `session.access_token` |

### 2.2 — Reescribir `hooks/use-auth.ts`
- `onAuthChange` → `supabase.auth.onAuthStateChange`
- `firebaseUser.uid` → `session.user.id` (UUID)
- `firebaseUser.email` → `session.user.email`
- `firebaseUser.displayName` → `session.user.user_metadata.full_name`
- Mantener caché en sessionStorage (misma lógica)

### 2.3 — Reescribir verificación en API routes
| Firebase | Supabase |
|----------|----------|
| `adminAuth.verifyIdToken(token)` | `supabaseAdmin.auth.getUser(token)` |

Rutas afectadas (8 archivos):
- `app/api/facturacion/route.ts`
- `app/api/facturacion/reimprimir/route.ts`
- `app/api/facturacion/comprobantes/route.ts`
- `app/api/facturacion/consultar-cuit/route.ts`
- `app/api/facturacion/pdf/[saleId]/route.tsx`
- `app/api/ventas/emitir/route.ts`
- `app/api/afip/test/route.ts`
- `app/api/afip/cuit/route.ts`
- `app/api/remitos/route.ts`
- `app/api/drive/route.ts`

### 2.4 — Reescribir `app/login/page.tsx`
- `signInWithGoogle()` → `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`
- Nota: Supabase OAuth usa redirect (no popup). El flujo cambia ligeramente: el usuario sale de la app y vuelve. El `onAuthStateChange` captura el retorno.

### 2.5 — Token en hooks client-side
Archivos que usan `getIdToken()` / `getAuth()` directamente:
- `hooks/useVentas.ts` (líneas 370, 526) → `supabase.auth.getSession()`
- `app/pedidos/page.tsx` (línea 207-211) → `supabase.auth.getSession()`
- `app/clientes/page.tsx` (línea 88) → `supabase.auth.getSession()`

---

## Fase 3: Reescribir servicios (DB)

Cada servicio se reescribe internamente pero **mantiene la misma interfaz pública**. `lib/api.ts` no cambia.

### Orden por complejidad:

| # | Servicio | Complejidad | Cambio principal |
|---|----------|-------------|------------------|
| 1 | `transfer-config-service.ts` | Baja | 2 funciones. Validar que el setup funciona |
| 2 | `price-list-service.ts` | Baja | CRUD simple |
| 3 | `audit-service.ts` | Baja | Insert + queries |
| 4 | `commissions-service.ts` | Baja | 2 funciones |
| 5 | `payments-service.ts` | Baja | 1 función, increment → `current_balance = current_balance - amount` |
| 6 | `pedidos-mayorista-service.ts` | Baja | CRUD simple |
| 7 | `products-service.ts` | Media | CRUD + paginación. Eliminar caché localStorage |
| 8 | `clients-service.ts` | Media | CRUD + addresses JSONB |
| 9 | `sellers-service.ts` | Media | CRUD + comisiones |
| 10 | `orders-service.ts` | Media | CRUD + status updates |
| 11 | `users-service.ts` | Media | Lookup por id + authUid, sync con vendedores |
| 12 | `stock-service.ts` | Media | Movimientos + increment atómico |
| 13 | `dashboard-service.ts` | Media | Queries agregados SQL. Eliminar caché |
| 14 | `mayorista-service.ts` | **Alta** | Joins, batch upsert, import Excel. Mayor beneficio |
| 15 | `sales-service.ts` | **Alta** | processSale() → RPC `process_sale()` atómico |

### API Routes server-side (adminFirestore → supabaseAdmin):

| # | Ruta | Operación |
|---|------|-----------|
| 16 | `app/api/public/productos/route.ts` | SELECT productos |
| 17 | `app/api/public/pedidos/route.ts` | UPSERT clientes + INSERT pedidos |
| 18 | `app/api/public/clientes/route.ts` | SELECT clientes WHERE |
| 19 | `app/api/public/vendedores/route.ts` | SELECT vendedores WHERE |
| 20 | `app/api/public/mas-vendidos/route.ts` | SELECT ventas + productos |
| 21 | `app/api/import-productos/route.ts` | Batch INSERT productos |
| 22 | `app/api/facturacion/reimprimir/route.ts` | SELECT + UPDATE ventas |
| 23 | `app/api/remitos/route.ts` | SELECT + UPDATE ventas |
| 24 | `app/api/facturacion/pdf/[saleId]/route.tsx` | SELECT ventas + Storage upload |

---

## Fase 4: Migrar Storage

### 4.1 — `app/api/facturacion/pdf/[saleId]/route.tsx`
| Firebase | Supabase |
|----------|----------|
| `adminStorage.bucket()` | `supabaseAdmin.storage.from('facturas')` |
| `bucket.file(path).save(buffer)` | `.upload(path, buffer)` |
| `https://storage.googleapis.com/...` | `supabaseAdmin.storage.from('facturas').getPublicUrl(path)` |

---

## Fase 5: Limpieza

### 5.1 — Eliminar archivos Firebase
- `lib/firebase.ts` → eliminar (reemplazado por `lib/supabase.ts`)
- `lib/firebase-admin.ts` → eliminar (reemplazado por `lib/supabase-admin.ts`)
- `services/firestore-helpers.ts` → mover `slugify()` a `lib/supabase-helpers.ts`, eliminar el resto

### 5.2 — Desinstalar paquetes Firebase
```bash
npm uninstall firebase firebase-admin
```

### 5.3 — Eliminar variables de entorno Firebase
Eliminar de `.env.local` y Vercel:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Agregar:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### 5.4 — Eliminar caché manual
- `products-service.ts` — caché localStorage 30 min (innecesario con PostgreSQL)
- `mayorista-service.ts` — caché localStorage 2 horas (innecesario)
- `dashboard-service.ts` — caché localStorage 5 min (innecesario)

### 5.5 — Actualizar `lib/api.ts`
- Eliminar imports de `firebase/firestore` (líneas 55-56: `doc`, `updateDoc`, `firestore`)
- Las funciones `emitInvoice` y `createRemito` que hacen `updateDoc` directo → mover al servicio

### 5.6 — Actualizar `CLAUDE.md`

---

## Fase 6: Validación

### Checklist funcional
- [ ] Login con Google (flujo redirect Supabase)
- [ ] Auto-role: primer usuario → admin, email vendedor → seller
- [ ] Crear/editar/eliminar producto
- [ ] Importar lista de precios Excel (8000 productos)
- [ ] Habilitar/deshabilitar producto mayorista
- [ ] Aplicar ganancia masiva
- [ ] Crear venta (cash, crédito, mixta) — transacción atómica
- [ ] Descontar stock automáticamente
- [ ] Crear pedido desde tienda pública (sin auth)
- [ ] Asignar transportista
- [ ] Registrar pago de cliente
- [ ] Ver/pagar comisiones
- [ ] Emitir factura AFIP + PDF a Storage
- [ ] Generar remito PDF
- [ ] Dashboard con estadísticas
- [ ] Caja diaria
- [ ] Auditoría

### Objetivos de rendimiento
- Carga 8000 productos: < 2s
- Actualización masiva de precios: < 5s
- Import Excel 8000 filas: < 10s
- processSale: < 1s

---

## Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Google OAuth redirect vs popup | Bajo | Supabase soporta redirect nativo, UX similar |
| Usuarios existentes en Firebase Auth | Alto | Los usuarios se recrean al hacer login con Google en Supabase (mismo email = mismo usuario) |
| PDFs en Firebase Storage | Medio | Script de migración descarga y resube |
| IDs de auth cambian (Firebase UID → Supabase UUID) | Alto | Tabla `usuarios` usa ID legible como PK, `auth_uid` se actualiza al primer login |
| Downtime | Medio | Migrar datos primero, switchear código después |

---

## Decisiones pendientes del usuario

1. **¿Ya tenés proyecto Supabase creado?** Necesito URL + keys.
2. **¿Las credenciales Google OAuth están en Google Cloud Console?** Se reusan para Supabase.
3. **¿Migrar los PDFs existentes o solo los nuevos?**
