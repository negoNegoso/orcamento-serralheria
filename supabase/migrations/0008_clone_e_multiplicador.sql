-- Multiplicador de unidades iguais (ex.: condomínio com N casas) e clonagem de orçamento.

alter table quotes
  add column multiplier int not null default 1 check (multiplier >= 1);

-- Recria save_quote_atomic para gravar também o multiplicador no cabeçalho.
create or replace function public.save_quote_atomic(
  p_quote_id uuid,
  p_quote jsonb,
  p_items jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update quotes set
    customer_name  = p_quote->>'customer_name',
    customer_phone = coalesce(p_quote->>'customer_phone', ''),
    site_address   = coalesce(p_quote->>'site_address', ''),
    discount       = (p_quote->>'discount')::numeric,
    subtotal       = (p_quote->>'subtotal')::numeric,
    total          = (p_quote->>'total')::numeric,
    multiplier     = coalesce((p_quote->>'multiplier')::int, 1),
    updated_at     = now()
  where id = p_quote_id;

  if not found then
    raise exception 'Orçamento não encontrado';
  end if;

  delete from quote_items where quote_id = p_quote_id;

  insert into quote_items (quote_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price, selected_options,
    unit_total, line_total, sort_order)
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
    (ord - 1)::int
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);
end;
$$;

revoke execute on function public.save_quote_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote_atomic(uuid, jsonb, jsonb) to authenticated;

-- Clona um orçamento (cabeçalho + itens) numa transação. Retorna o id da cópia.
create or replace function public.clone_quote(p_source_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new_id uuid;
  v_days int;
begin
  select coalesce(default_validity_days, 15) into v_days
    from company_settings where id = 1;

  insert into quotes (customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, status, created_by, valid_until)
  select 'Cópia de — ' || customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, 'rascunho', auth.uid(),
    (now() + make_interval(days => v_days))::date
  from quotes where id = p_source_id
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'Orçamento não encontrado';
  end if;

  insert into quote_items (quote_id, product_type_id, product_name, model_id,
    model_name, model_photo_url, width_m, height_m, area_m2, qty, unit_base_price,
    selected_options, unit_total, line_total, sort_order)
  select v_new_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price,
    selected_options, unit_total, line_total, sort_order
  from quote_items where quote_id = p_source_id;

  return v_new_id;
end;
$$;

revoke execute on function public.clone_quote(uuid) from public, anon;
grant execute on function public.clone_quote(uuid) to authenticated;
