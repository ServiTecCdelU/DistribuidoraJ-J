-- Saldo por remito/venta en cuenta corriente de clientes.
-- Ejecutar en Supabase SQL Editor ANTES de usar la imputación de pagos.

-- 1. Columnas nuevas
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS saldo numeric;
ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS debt_id text;

-- 2. Trigger: toda deuda nueva arranca con saldo = amount
--    (cubre process_sale y cualquier insert sin tocar la RPC)
CREATE OR REPLACE FUNCTION set_debt_saldo() RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'debt' AND NEW.saldo IS NULL THEN
    NEW.saldo := NEW.amount;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_debt_saldo ON transacciones;
CREATE TRIGGER trg_set_debt_saldo
  BEFORE INSERT ON transacciones
  FOR EACH ROW EXECUTE FUNCTION set_debt_saldo();

-- 3. Backfill: distribuir los pagos históricos FIFO (deuda más antigua primero)
--    por cliente y cuenta, para que cada deuda quede con su saldo pendiente real.
WITH deudas AS (
  SELECT id, client_id, COALESCE(cuenta, 'minorista') AS cta, amount,
         COALESCE(SUM(amount) OVER (
           PARTITION BY client_id, COALESCE(cuenta, 'minorista')
           ORDER BY date, created_at
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ), 0) AS acumulado_previo
  FROM transacciones
  WHERE type = 'debt'
),
pagos AS (
  SELECT client_id, COALESCE(cuenta, 'minorista') AS cta, SUM(amount) AS pagado
  FROM transacciones
  WHERE type = 'payment' AND client_id IS NOT NULL
  GROUP BY client_id, COALESCE(cuenta, 'minorista')
)
UPDATE transacciones t
SET saldo = GREATEST(0, LEAST(d.amount, d.acumulado_previo + d.amount - COALESCE(p.pagado, 0)))
FROM deudas d
LEFT JOIN pagos p ON p.client_id = d.client_id AND p.cta = d.cta
WHERE t.id = d.id AND t.saldo IS NULL;
