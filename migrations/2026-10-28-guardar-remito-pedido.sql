-- Generar el remito de un pedido en UNA transacción: descuenta el stock de lo que sale (si el
-- pedido no lo tenía descontado), marca stock_descontado y graba número + PDF del remito.
-- Antes era una llamada a mover_stock por producto desde el navegador (20 productos = 20 viajes)
-- y, si algo fallaba, una reversión manual a mano que también podía fallar.
-- El remito es inmodificable: si el pedido ya tiene uno, no se toca nada.
-- Re-ejecutable.

-- p_movs: [{productId, cantidad}]  (cantidad negativa = salida; ver salidasRemito)
create or replace function guardar_remito_pedido(
  p_order_id      text,
  p_remito_number text,
  p_pdf_base64    text,
  p_movs          jsonb
) returns void
language plpgsql
as $$
declare
  v_order pedidos%rowtype;
  v_mov   jsonb;
  v_i     int := 0;
begin
  select * into v_order from pedidos where id = p_order_id for update;
  if not found then
    raise exception 'El pedido no existe';
  end if;
  if v_order.remito_number is not null then
    raise exception 'El pedido ya tiene el remito %: no se puede generar otro', v_order.remito_number;
  end if;
  if v_order.status not in ('pending', 'preparation', 'delivery') then
    raise exception 'El pedido está %: no se puede generar el remito.', v_order.status;
  end if;

  -- La mercadería sale del depósito al generar el remito. Una sola vez por pedido.
  if not coalesce(v_order.stock_descontado, false) then
    for v_mov in select * from jsonb_array_elements(coalesce(p_movs, '[]'::jsonb)) loop
      perform mover_stock(v_mov->>'productId', 'venta', (v_mov->>'cantidad')::numeric,
        'Remito ' || p_remito_number || ' pedido #' || p_order_id,
        'remito:' || p_remito_number || ':' || v_i || ':' || (v_mov->>'productId'));
      v_i := v_i + 1;
    end loop;
  end if;

  update pedidos
     set remito_number = p_remito_number,
         remito_pdf_base64 = p_pdf_base64,
         stock_descontado = true
   where id = p_order_id;
end;
$$;
