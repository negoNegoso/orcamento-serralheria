-- Observações gerais do orçamento: visíveis no editor, na página pública e no PDF.

alter table quotes add column general_note text not null default '';

create or replace function public.save_quote_atomic(
  p_quote_id uuid, p_quote jsonb, p_items jsonb
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_client_id uuid;
  v_company_id uuid;
begin
  -- RLS filtra: orçamento de outra empresa é invisível aqui
  select company_id into v_company_id from quotes where id = p_quote_id;
  if v_company_id is null then
    raise exception 'Orçamento não encontrado';
  end if;

  v_client_id := nullif(p_quote->>'client_id', '')::uuid;
  if v_client_id is not null
     and not exists (select 1 from clients where id = v_client_id) then
    raise exception 'Cliente inválido';
  end if;
  if v_client_id is null and trim(coalesce(p_quote->>'customer_name', '')) <> '' then
    insert into clients (name, phone, company_id)
    values (trim(p_quote->>'customer_name'), coalesce(p_quote->>'customer_phone', ''), v_company_id)
    returning id into v_client_id;
  end if;

  update quotes set
    client_id      = v_client_id,
    customer_name  = p_quote->>'customer_name',
    customer_phone = coalesce(p_quote->>'customer_phone', ''),
    site_address   = coalesce(p_quote->>'site_address', ''),
    discount       = (p_quote->>'discount')::numeric,
    subtotal       = (p_quote->>'subtotal')::numeric,
    total          = (p_quote->>'total')::numeric,
    multiplier     = coalesce((p_quote->>'multiplier')::int, 1),
    delivery_date  = nullif(p_quote->>'delivery_date', '')::date,
    general_note   = coalesce(p_quote->>'general_note', ''), -- novo
    updated_at     = now()
  where id = p_quote_id;

  delete from quote_items where quote_id = p_quote_id;

  insert into quote_items (quote_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price, selected_options,
    unit_total, line_total, extra_value, note, sort_order, company_id)
  select p_quote_id,
    nullif(i->>'product_type_id', '')::uuid,
    i->>'product_name',
    nullif(i->>'model_id', '')::uuid,
    i->>'model_name',
    i->>'model_photo_url',
    (i->>'width_m')::numeric,
    (i->>'height_m')::numeric,
    (i->>'area_m2')::numeric,
    (i->>'qty')::int,
    (i->>'unit_base_price')::numeric,
    coalesce(i->'selected_options', '[]'::jsonb),
    (i->>'unit_total')::numeric,
    (i->>'line_total')::numeric,
    coalesce((i->>'extra_value')::numeric, 0),
    coalesce(i->>'note', ''),
    (ord - 1)::int,
    v_company_id
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);
end;
$$;
revoke execute on function public.save_quote_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote_atomic(uuid, jsonb, jsonb) to authenticated;

create or replace function public.clone_quote(p_source_id uuid)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_new_id uuid;
  v_days int;
  v_company_id uuid;
begin
  select company_id into v_company_id from quotes where id = p_source_id;
  if v_company_id is null then
    raise exception 'Orçamento não encontrado';
  end if;

  select coalesce(default_validity_days, 15) into v_days
    from companies where id = v_company_id;

  insert into quotes (customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, status, created_by, valid_until, delivery_date,
    client_id, company_id, general_note) -- general_note novo
  select 'Cópia de — ' || customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, 'rascunho', auth.uid(),
    (now() + make_interval(days => v_days))::date, null, client_id, company_id,
    general_note -- novo
  from quotes where id = p_source_id
  returning id into v_new_id;

  insert into quote_items (quote_id, product_type_id, product_name, model_id,
    model_name, model_photo_url, width_m, height_m, area_m2, qty, unit_base_price,
    selected_options, unit_total, line_total, extra_value, note, sort_order, company_id)
  select v_new_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price,
    selected_options, unit_total, line_total, extra_value, note, sort_order, company_id
  from quote_items where quote_id = p_source_id;

  return v_new_id;
end;
$$;
revoke execute on function public.clone_quote(uuid) from public, anon;
grant execute on function public.clone_quote(uuid) to authenticated;
