-- Tabla para registrar los pagos/reseteos de comisiones
CREATE TABLE IF NOT EXISTS pagos_comisiones (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES vendedores(id),
  seller_name TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  cantidad_comisiones INTEGER NOT NULL DEFAULT 0,
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_comisiones_seller ON pagos_comisiones(seller_id);
