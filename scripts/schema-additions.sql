-- Columnas adicionales que el codigo necesita y no estan en el schema original

-- productos: campos extra
ALTER TABLE productos ADD COLUMN IF NOT EXISTS base TEXT DEFAULT 'crema';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT 'Sin identificar';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS sin_tacc BOOLEAN DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS notes TEXT;

-- clientes: campo address y notes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS address TEXT;

-- ventas: campos adicionales del flujo de ventas
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS client_cuit TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS client_dni TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS client_address TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS client_tax_category TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'efectivo';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS overpayment NUMERIC(12,2);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS discount_type TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS delivery_method TEXT DEFAULT 'pickup';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS invoice_emitted BOOLEAN DEFAULT false;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS invoice_drive_url TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS invoice_drive_file_id TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS remito_drive_url TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS remito_drive_file_id TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS seller_name TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'direct';

-- comisiones: campos adicionales
ALTER TABLE comisiones ADD COLUMN IF NOT EXISTS sale_number TEXT;
ALTER TABLE comisiones ADD COLUMN IF NOT EXISTS client_name TEXT;

-- pedidos: campos adicionales
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS delivery_method TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS discount_type TEXT;

-- mayorista_productos: campos adicionales
ALTER TABLE mayorista_productos ADD COLUMN IF NOT EXISTS codigo_barras TEXT;
ALTER TABLE mayorista_productos ADD COLUMN IF NOT EXISTS nombre TEXT;
ALTER TABLE mayorista_productos ADD COLUMN IF NOT EXISTS rubro TEXT;
ALTER TABLE mayorista_productos ADD COLUMN IF NOT EXISTS subrubro TEXT;
ALTER TABLE mayorista_productos ADD COLUMN IF NOT EXISTS categoria TEXT;

-- caja: columnas del flujo apertura/cierre
ALTER TABLE caja ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE caja ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE caja ADD COLUMN IF NOT EXISTS opened_by TEXT;
ALTER TABLE caja ADD COLUMN IF NOT EXISTS closed_by TEXT;
ALTER TABLE caja ADD COLUMN IF NOT EXISTS initial_amount NUMERIC(12,2);
ALTER TABLE caja ADD COLUMN IF NOT EXISTS final_amount NUMERIC(12,2);
ALTER TABLE caja ADD COLUMN IF NOT EXISTS expected_amount NUMERIC(12,2);
ALTER TABLE caja ADD COLUMN IF NOT EXISTS difference NUMERIC(12,2);
ALTER TABLE caja ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE caja ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE caja ADD COLUMN IF NOT EXISTS sales_count INTEGER;
ALTER TABLE caja ADD COLUMN IF NOT EXISTS total_sales NUMERIC(12,2);
ALTER TABLE caja ADD COLUMN IF NOT EXISTS cash_total NUMERIC(12,2);
ALTER TABLE caja ADD COLUMN IF NOT EXISTS credit_total NUMERIC(12,2);
ALTER TABLE caja ADD COLUMN IF NOT EXISTS transfer_total NUMERIC(12,2);

-- ventas: columnas PDF
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS invoice_pdf_base64 TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS invoice_pdf_generated_at TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS invoice_filename TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS invoice_pdf_size INTEGER;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS remito_pdf_base64 TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS remito_pdf_generated_at TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS remito_filename TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS remito_pdf_size INTEGER;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS client_data JSONB;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS invoice_status TEXT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS afip_data JSONB;

-- Permitir status adicionales en ventas (pendiente, listo para mayorista)
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_status_check;

-- Permitir status adicionales en pedidos
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_status_check;
