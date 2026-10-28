-- Cobro de un pedido en UNA sola transacción (antes: 12-15 consultas sueltas desde el navegador,
-- y si se cortaba a la mitad la venta quedaba a medias).
-- Hace todo o nada: venta (con el remito del pedido copiado tal cual), movimientos de stock del
-- cobro, deuda en cuenta corriente, totales del vendedor, pérdidas/faltantes/rechazos y el pedido
-- en 'completed'. Idempotente: si un intento anterior dejó la venta grabada, la retoma (mismo id
-- y número), y stock/vendedor usan las mismas claves que el código JS que reemplaza.
-- Re-ejecutable.

-- Mismo resultado que slugify() de services/supabase-helpers.ts.
create or replace function slug_legible(p text) returns text
language sql immutable
as $$
  select regexp_replace(
    translate(lower(coalesce(p, '')),
      'áàäâãéèëêíìïîóòöôõúùüûñç',
      'aaaaaeeeeiiiiooooouuuunc'),
    '[^a-z0-9]', '', 'g')
$$;

-- Id legible libre `prefijo_slug_N` (como generateReadableId). El advisory lock evita que dos
-- cobros simultáneos del mismo cliente elijan el mismo N.
create or replace function id_legible(p_tabla text, p_prefijo text, p_nombre text) returns text
language plpgsql
as $$
declare
  v_base text := p_prefijo || '_' || slug_legible(p_nombre);
  v_id   text;
  v_n    int := 1;
  v_hay  boolean;
begin
  perform pg_advisory_xact_lock(hashtext(p_tabla || ':' || v_base));
  loop
    v_id := v_base || '_' || v_n;
    execute format('select exists(select 1 from %I where id = $1)', p_tabla) into v_hay using v_id;
    exit when not v_hay;
    v_n := v_n + 1;
  end loop;
  return v_id;
end;
$$;

-- p (jsonb):
--   order_id, client_id?, seller_id?, seller_name?
--   items: [{productId, name, price, quantity, itemDiscount?, codigo?}]  (ya con los ajustes aplicados)
--   payment_type 'cash'|'credit'|'mixed', payment_method 'efectivo'|'transferencia'
--   cash_amount?, credit_amount?, efectivo?, transferencia?
--   delivery_method, delivery_address
--   movimientos_stock: [{productId, tipo, cantidad, referencia, clave}]  (reconciliarCobro)
--   items_no_entregados: [...]
--   perdida?: {monto, detalle}   faltante?: {detalle}   rechazo?: {detalle}
-- Devuelve {sale_id, sale_number, total}.
create or replace function cobrar_pedido(p jsonb) returns jsonb
language plpgsql
as $$
declare
  v_order        pedidos%rowtype;
  v_items        jsonb := coalesce(p->'items', '[]'::jsonb);
  v_it           jsonb;
  v_i            int := 0;
  v_base         numeric;
  v_subtotal     numeric := 0;
  v_disc         numeric;
  v_disc_type    text;
  v_total        numeric;
  v_sale_id      text;
  v_sale_number  text;
  v_previa       boolean := false;
  v_client_id    text := nullif(p->>'client_id', '');
  v_client_name  text;
  v_address      text := p->>'delivery_address';
  v_cli          record;
  v_phone        text;
  v_pay          text := coalesce(p->>'payment_type', 'cash');
  v_credit       numeric;
  v_deuda_previa numeric;
  v_stock_movido boolean := false;
  v_rate         numeric;
  v_tx_id        text;
  v_now          timestamptz := now();
  v_recibo       text;
begin
  select * into v_order from pedidos where id = p->>'order_id' for update;
  if not found then
    raise exception 'El pedido no existe';
  end if;
  if v_order.status = 'completed' then
    raise exception 'Este pedido ya fue cobrado. Recargá la lista (F5).';
  end if;
  if v_order.status not in ('pending', 'preparation', 'delivery') then
    raise exception 'El pedido está %: no se puede cobrar.', v_order.status;
  end if;
  if v_order.status = 'delivery' and v_order.remito_number is null then
    raise exception 'Este pedido no tiene remito. En reparto solo se cobra lo del remito.';
  end if;
  if jsonb_array_length(v_items) = 0 then
    raise exception 'No hay productos para cobrar';
  end if;

  -- Total: misma fórmula que processSale (ítems − descuento por ítem − descuento global).
  for v_it in select * from jsonb_array_elements(v_items) loop
    v_base := (v_it->>'price')::numeric * (v_it->>'quantity')::numeric;
    v_subtotal := v_subtotal + v_base - coalesce(v_base * nullif(v_it->>'itemDiscount', '')::numeric / 100, 0);
  end loop;
  v_disc := coalesce(v_order.discount, 0);
  v_disc_type := v_order.discount_type;
  v_total := round(greatest(0, v_subtotal - case
    when v_disc <= 0 then 0
    when v_disc_type = 'percent' then v_subtotal * v_disc / 100
    else v_disc end), 2);

  -- Cliente
  v_client_name := coalesce(nullif(v_order.client_name, ''), 'Venta directa');
  if v_client_id is not null then
    select name, address, phone into v_cli from clientes where id = v_client_id;
    if found then
      v_client_name := coalesce(v_cli.name, v_client_name);
      v_phone := v_cli.phone;
      if p->>'delivery_method' = 'delivery' and coalesce(v_address, '') = '' then
        v_address := v_cli.address;
      end if;
    end if;
  end if;

  -- 1 pedido = 1 venta: retomar la de un intento anterior.
  select id, sale_number into v_sale_id, v_sale_number
    from ventas where order_id = v_order.id order by created_at desc limit 1;
  v_previa := v_sale_id is not null;
  if not v_previa then
    v_sale_number := 'N' || next_venta_number() || '-'
      || to_char(v_now at time zone 'America/Argentina/Buenos_Aires', 'DD-MM-YYYY');
    v_sale_id := id_legible('ventas', 'venta', v_client_name);
  end if;

  if v_previa then
    update ventas set
      client_id = v_client_id, client_name = v_client_name, client_phone = v_phone,
      seller_id = nullif(p->>'seller_id', ''), seller_name = p->>'seller_name',
      items = v_items, subtotal = v_subtotal, total = v_total,
      payment_type = v_pay, payment_method = coalesce(p->>'payment_method', 'efectivo'),
      cash_amount = nullif(p->>'cash_amount', '')::numeric,
      credit_amount = nullif(p->>'credit_amount', '')::numeric,
      delivery_method = coalesce(p->>'delivery_method', 'pickup'), delivery_address = v_address,
      hoja_ruta_number = v_order.hoja_ruta_number,
      remito_number = v_order.remito_number, remito_pdf_base64 = v_order.remito_pdf_base64,
      discount = nullif(v_disc, 0), discount_type = case when v_disc > 0 then v_disc_type end
    where id = v_sale_id;
  else
    insert into ventas (
      id, sale_number, client_id, client_name, client_phone, seller_id, seller_name, source,
      items, subtotal, total, payment_type, payment_method, cash_amount, credit_amount,
      status, invoice_emitted, delivery_method, delivery_address, order_id, hoja_ruta_number,
      remito_number, remito_pdf_base64, discount, discount_type, created_at
    ) values (
      v_sale_id, v_sale_number, v_client_id, v_client_name, v_phone,
      nullif(p->>'seller_id', ''), p->>'seller_name', 'order',
      v_items, v_subtotal, v_total, v_pay, coalesce(p->>'payment_method', 'efectivo'),
      nullif(p->>'cash_amount', '')::numeric, nullif(p->>'credit_amount', '')::numeric,
      'completed', false, coalesce(p->>'delivery_method', 'pickup'), v_address, v_order.id,
      v_order.hoja_ruta_number, v_order.remito_number, v_order.remito_pdf_base64,
      nullif(v_disc, 0), case when v_disc > 0 then v_disc_type end, v_now
    );
  end if;

  update ventas set
    efectivo_amount = nullif(coalesce((p->>'efectivo')::numeric, 0), 0),
    transferencia_amount = nullif(coalesce((p->>'transferencia')::numeric, 0), 0),
    items_no_entregados = case when jsonb_array_length(coalesce(p->'items_no_entregados', '[]'::jsonb)) > 0
                               then p->'items_no_entregados' else items_no_entregados end
  where id = v_sale_id;

  -- Ajustes de stock del cobro (rotura / faltante / no quiere), con clave = idempotentes.
  for v_it in select * from jsonb_array_elements(coalesce(p->'movimientos_stock', '[]'::jsonb)) loop
    perform mover_stock(v_it->>'productId', v_it->>'tipo', (v_it->>'cantidad')::numeric,
                        v_it->>'referencia', v_it->>'clave');
  end loop;

  -- Stock de la venta: solo si el remito no lo descontó ya.
  if not coalesce(v_order.stock_descontado, false) then
    if v_previa then
      select exists(select 1 from stock_movimientos where motivo = v_sale_id and clave is null)
        into v_stock_movido;
    end if;
    if not v_stock_movido then
      for v_it in select * from jsonb_array_elements(v_items) loop
        if coalesce(v_it->>'productId', '') <> '' then
          perform mover_stock(v_it->>'productId', 'venta', -(v_it->>'quantity')::numeric, v_sale_id,
                              'venta:' || v_sale_id || ':' || v_i || ':' || (v_it->>'productId'));
        end if;
        v_i := v_i + 1;
      end loop;
    end if;
  end if;

  -- Cuenta corriente
  v_credit := case v_pay
    when 'credit' then v_total
    when 'mixed' then coalesce(nullif(p->>'credit_amount', '')::numeric, 0)
    else 0 end;
  if v_credit > 0 and v_client_id is null then
    raise exception 'Debe seleccionar un cliente para cuenta corriente';
  end if;
  if v_previa then
    select amount into v_deuda_previa from transacciones
     where sale_id = v_sale_id and type = 'debt' limit 1;
    if found and abs(v_deuda_previa - v_credit) > 0.01 then
      raise exception 'Este pedido ya tiene la venta #% con $% a cuenta corriente. Revisá la cuenta corriente del cliente antes de cobrarlo distinto.',
        v_sale_number, v_deuda_previa;
    end if;
  end if;
  if v_credit > 0 and v_deuda_previa is null then
    v_tx_id := id_legible('transacciones', 'transaccion', v_client_name);
    insert into transacciones (id, client_id, type, amount, description, date, sale_id)
    values (v_tx_id, v_client_id, 'debt', v_credit, 'Venta #' || v_sale_number, v_now, v_sale_id);
    perform mover_saldo_cliente(v_client_id, v_credit, 'minorista');
  end if;

  -- Vendedor (clave por venta: nunca dos veces)
  if nullif(p->>'seller_id', '') is not null then
    select commission_rate into v_rate from vendedores where id = p->>'seller_id';
    if found then
      perform mover_totales_vendedor(p->>'seller_id', v_total,
        v_total * coalesce(v_rate, 10) / 100, 'vendedor-venta:' || v_sale_id);
    end if;
  end if;

  -- Pérdidas, faltantes y rechazos (ids fijos por venta: un reintento no duplica)
  if p ? 'perdida' then
    insert into transacciones (id, client_id, type, amount, description, sale_id, date)
    values ('perdida_' || v_sale_id, null, 'payment', -(p->'perdida'->>'monto')::numeric,
            '[ROTURA] #' || v_sale_number || ' — ' || (p->'perdida'->>'detalle'), v_sale_id, v_now)
    on conflict (id) do update set amount = excluded.amount, description = excluded.description;
  end if;
  if p ? 'faltante' then
    insert into transacciones (id, client_id, type, amount, description, sale_id, date)
    values ('faltante_' || v_sale_id, null, 'payment', 0,
            '[FALTANTE] #' || v_sale_number || ' — ' || (p->'faltante'->>'detalle'), v_sale_id, v_now)
    on conflict (id) do update set description = excluded.description;
  end if;
  if p ? 'rechazo' then
    v_recibo := 'DEV-' || coalesce(v_order.remito_number, v_sale_number, v_sale_id);
    insert into transacciones (id, client_id, type, amount, description, sale_id, date, cuenta)
    values ('no_quiere_' || v_sale_id, v_client_id, 'payment', 0,
            '[RECHAZO] ' || v_recibo || ' — ' || (p->'rechazo'->>'detalle'), v_sale_id, v_now, 'minorista')
    on conflict (id) do update set description = excluded.description;
  end if;

  update pedidos set status = 'completed', sale_id = v_sale_id where id = v_order.id;

  return jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_sale_number, 'total', v_total);
end;
$$;
