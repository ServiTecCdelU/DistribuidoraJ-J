-- Numeración de recibos + día de cobro por cliente.
-- Ejecutar en Supabase SQL Editor.

-- 1. Día de visita/cobro del cliente (lunes..domingo, NULL = sin asignar)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS dia_cobro text;

-- 2. Numeración atómica y consecutiva de recibos: RC-2026-00001, RC-2026-00002, ...
CREATE SEQUENCE IF NOT EXISTS recibo_number_seq;

CREATE OR REPLACE FUNCTION next_recibo_number() RETURNS text AS $$
  SELECT 'RC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('recibo_number_seq')::text, 5, '0');
$$ LANGUAGE sql;
