-- Agregar clasificación de deuda a clientes
-- Valores: 'normal' (default), 'moroso', 'incobrable'
ALTER TABLE clientes
ADD COLUMN IF NOT EXISTS debt_classification TEXT DEFAULT 'normal';
