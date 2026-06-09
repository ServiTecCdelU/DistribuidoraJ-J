-- migrations/2026-06-09-codigo-vendedor.sql
-- Agrega codigo_vendedor a vendedores y codigo_externo a clientes.
-- Ejecutar en el SQL Editor de Supabase ANTES de correr los scripts de carga
-- (scripts/backfill-codigo-vendedor.cjs y scripts/import-clientes-vendedor.cjs).

ALTER TABLE vendedores ADD COLUMN IF NOT EXISTS codigo_vendedor text;
ALTER TABLE clientes  ADD COLUMN IF NOT EXISTS codigo_externo  text;
CREATE INDEX IF NOT EXISTS idx_clientes_codigo_externo ON clientes(codigo_externo);
