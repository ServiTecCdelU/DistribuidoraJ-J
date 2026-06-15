-- Sprint 3 — Índices de performance (consumo de BD / velocidad)
-- Ejecutar en Supabase (SQL Editor). Todos son idempotentes (IF NOT EXISTS).
-- No bloquean: en Postgres CREATE INDEX toma lock de escritura breve; para tablas
-- muy grandes usar CONCURRENTLY (no dentro de una transacción).

-- ── Comisiones (getAllCommissions / getCommissionsBySeller) ──────────────────
-- Ventas por vendedor ordenadas por fecha.
CREATE INDEX IF NOT EXISTS idx_ventas_seller_fecha
  ON ventas (seller_id, created_at DESC);

-- Pagos de comisiones: último pago por vendedor (cutoff de "pagado").
CREATE INDEX IF NOT EXISTS idx_pagos_comisiones_seller_fecha
  ON pagos_comisiones (seller_id, created_at DESC);

-- Devoluciones por vendedor.
CREATE INDEX IF NOT EXISTS idx_devoluciones_seller
  ON devoluciones (seller_id);

-- ── Pedidos y ventas (listados y filtros por estado) ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_ventas_status_fecha
  ON ventas (status, created_at DESC);

-- ── Clientes asignados a un vendedor (página clientes / cuenta corriente) ─────
CREATE INDEX IF NOT EXISTS idx_clientes_seller
  ON clientes (seller_id);

-- ── Auditoría (orden por fecha en /auditoria) ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha
  ON auditoria (created_at DESC);

-- Filtro por entidad en auditoría (getAuditByEntity).
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad
  ON auditoria (entity_type, entity_id);

-- ── Stock (ya creado en Sprint 1; se repite por idempotencia) ────────────────
CREATE INDEX IF NOT EXISTS idx_stock_mov_producto_fecha
  ON stock_movimientos (mayorista_producto_id, created_at DESC);
