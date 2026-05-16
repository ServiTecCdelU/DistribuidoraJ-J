-- Migración: Cuenta Corriente + Cobranzas
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar vendedor asignado a clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS seller_id TEXT REFERENCES vendedores(id);
CREATE INDEX IF NOT EXISTS idx_clientes_seller_id ON clientes(seller_id);

-- 2. Tabla de comprobantes de pago
CREATE TABLE IF NOT EXISTS comprobantes_pago (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clientes(id),
  seller_id TEXT NOT NULL REFERENCES vendedores(id),
  amount NUMERIC(12,2) NOT NULL,
  notes TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  transaction_id TEXT REFERENCES transacciones(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comprobantes_status ON comprobantes_pago(status);
CREATE INDEX IF NOT EXISTS idx_comprobantes_seller ON comprobantes_pago(seller_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_client ON comprobantes_pago(client_id);

-- 3. Bucket de storage (crear manualmente en Supabase Dashboard):
-- Nombre: comprobantes
-- Public: false (acceso via signed URLs)
-- Allowed MIME types: image/jpeg, image/png, image/webp, application/pdf
