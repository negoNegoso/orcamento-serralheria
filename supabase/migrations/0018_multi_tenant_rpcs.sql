-- RPCs multi-tenant. security invoker confia na RLS; security definer filtra
-- explicitamente por current_company_id().

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
    client_id, company_id)
  select 'Cópia de — ' || customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, 'rascunho', auth.uid(),
    (now() + make_interval(days => v_days))::date, null, client_id, company_id
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

-- Dashboard: security definer → filtro explícito por empresa obrigatório
create or replace function public.dashboard_metrics(
  p_start timestamptz default null,
  p_end timestamptz default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
  v_company uuid;
begin
  if not public.is_company_admin() then
    raise exception 'not authorized';
  end if;
  v_company := public.current_company_id();

  with periodo as (
    select q.* from quotes q
    where q.company_id = v_company
      and (p_start is null or q.created_at >= p_start)
      and (p_end is null or q.created_at < p_end)
  )
  select jsonb_build_object(
    'kpis', (
      select jsonb_build_object(
        'total_count', count(*),
        'approved_value', coalesce(sum(total) filter (where status = 'aprovado'), 0),
        'open_value', coalesce(sum(total) filter (where status = 'enviado'), 0),
        'avg_ticket', coalesce(avg(total), 0),
        'conversion_rate', coalesce(
          count(*) filter (where status = 'aprovado')::numeric
          / nullif(count(*) filter (where status in ('aprovado','recusado')), 0),
          0)
      ) from periodo
    ),
    'funnel', (
      select coalesce(jsonb_agg(
        jsonb_build_object('status', s.status, 'count', coalesce(c.cnt, 0), 'value', coalesce(c.val, 0))
        order by s.ord), '[]'::jsonb)
      from (values ('rascunho', 1), ('enviado', 2), ('aprovado', 3), ('recusado', 4)) as s(status, ord)
      left join (
        select status, count(*) as cnt, sum(total) as val from periodo group by status
      ) c on c.status = s.status
    ),
    'expiring', (
      select jsonb_build_object(
        'due_7_days', count(*) filter (where status = 'enviado' and valid_until >= current_date and valid_until <= current_date + 7),
        'overdue', count(*) filter (where status = 'enviado' and valid_until < current_date)
      ) from quotes where company_id = v_company
    ),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('month', m, 'value', v) order by m), '[]'::jsonb)
      from (
        select date_trunc('month', created_at) as m, sum(total) as v
        from periodo group by 1
      ) t
    ),
    'sellers', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'approved_value', av, 'count', cnt) order by av desc), '[]'::jsonb)
      from (
        select coalesce(p.name, 'Sem vendedor') as name,
               coalesce(sum(q.total) filter (where q.status = 'aprovado'), 0) as av,
               count(*) as cnt
        from periodo q left join profiles p on p.id = q.created_by
        group by 1
        order by av desc
        limit 10
      ) t
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object('product_name', product_name, 'times', times, 'qty', qty) order by times desc), '[]'::jsonb)
      from (
        select qi.product_name, count(*) as times, coalesce(sum(qi.qty), 0) as qty
        from quote_items qi
        join periodo q on q.id = qi.quote_id
        group by qi.product_name
        order by times desc
        limit 10
      ) t
    ),
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'customer_name', customer_name, 'total', total, 'status', status, 'created_at', created_at
      ) order by created_at desc), '[]'::jsonb)
      from (
        select id, customer_name, total, status, created_at
        from quotes where company_id = v_company
        order by created_at desc limit 8
      ) t
    )
  ) into result;

  return result;
end;
$$;
grant execute on function public.dashboard_metrics(timestamptz, timestamptz) to authenticated;

-- Trigger de sync cliente→orçamentos: security definer → restringe à empresa do cliente
create or replace function public.sync_client_to_quotes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update quotes
     set customer_name = new.name,
         customer_phone = new.phone,
         updated_at = now()
   where client_id = new.id
     and company_id = new.company_id;
  return new;
end;
$$;

-- Visão geral para /sistema/empresas (só admin_system)
create or replace function public.system_companies_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not public.is_admin_system() then
    raise exception 'not authorized';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'status', c.status, 'created_at', c.created_at,
      'accent_color', c.accent_color,
      'users', (select count(*) from profiles p where p.company_id = c.id),
      'quotes', (select count(*) from quotes q where q.company_id = c.id)
    ) order by c.created_at), '[]'::jsonb)
  into result
  from companies c;
  return result;
end;
$$;
revoke execute on function public.system_companies_overview() from public, anon;
grant execute on function public.system_companies_overview() to authenticated;

-- is_admin() single-tenant morre; is_company_admin() é o substituto.
-- As policies de company_settings dependem de is_admin(); a tabela morre na Task 11,
-- então derrubamos as policies antes de remover a função.
drop policy cfg_write on company_settings;
drop policy cfg_read on company_settings;
drop function public.is_admin();
