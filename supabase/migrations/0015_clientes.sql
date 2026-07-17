-- Clientes é a fonte de verdade: editar nome/telefone reflete em TODOS os orçamentos via trigger, inclusive aprovados (decisão de spec).

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  -- só dígitos do telefone: permite busca por telefone independente da formatação
  phone_digits text generated always as (regexp_replace(phone, '\D', '', 'g')) stored,
  created_at timestamptz not null default now()
);
create index clients_phone_digits_idx on clients(phone_digits);

alter table quotes add column client_id uuid references clients(id) on delete set null;
create index quotes_client_idx on quotes(client_id);

alter table clients enable row level security;
create policy cl_all on clients
  for all to authenticated
  using (true)
  with check (true);

create or replace function public.sync_client_to_quotes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update quotes
     set customer_name = new.name,
         customer_phone = new.phone,
         updated_at = now()
   where client_id = new.id;

  return new;
end;
$$;

create trigger clients_sync_quotes
  after update of name, phone on clients
  for each row execute function sync_client_to_quotes();

with grouped as (
  select trim(lower(customer_name)) as norm_name,
         regexp_replace(customer_phone, '\D', '', 'g') as norm_phone,
         (array_agg(customer_name order by created_at desc))[1] as latest_name,
         (array_agg(customer_phone order by created_at desc))[1] as latest_phone
  from quotes where trim(customer_name) <> ''
  group by 1, 2
),
inserted as (
  insert into clients (name, phone)
  select latest_name, latest_phone from grouped
  returning id, name, phone
)
update quotes q set client_id = i.id
  from inserted i
 where trim(lower(q.customer_name)) = trim(lower(i.name))
   and regexp_replace(q.customer_phone, '\D', '', 'g') = regexp_replace(i.phone, '\D', '', 'g');

create or replace function public.save_quote_atomic(
  p_quote_id uuid,
  p_quote jsonb,
  p_items jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  v_client_id := nullif(p_quote->>'client_id', '')::uuid;

  if v_client_id is null and trim(coalesce(p_quote->>'customer_name', '')) <> '' then
    insert into clients (name, phone)
    values (trim(p_quote->>'customer_name'), coalesce(p_quote->>'customer_phone', ''))
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

  if not found then
    raise exception 'Orçamento não encontrado';
  end if;

  delete from quote_items where quote_id = p_quote_id;

  insert into quote_items (quote_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price, selected_options,
    unit_total, line_total, extra_value, note, sort_order)
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
    (ord - 1)::int
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);
end;
$$;

revoke execute on function public.save_quote_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote_atomic(uuid, jsonb, jsonb) to authenticated;

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
    subtotal, total, multiplier, status, created_by, valid_until, delivery_date, client_id)
  select 'Cópia de — ' || customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, 'rascunho', auth.uid(),
    (now() + make_interval(days => v_days))::date, null, client_id
  from quotes where id = p_source_id
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'Orçamento não encontrado';
  end if;

  insert into quote_items (quote_id, product_type_id, product_name, model_id,
    model_name, model_photo_url, width_m, height_m, area_m2, qty, unit_base_price,
    selected_options, unit_total, line_total, extra_value, note, sort_order)
  select v_new_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price,
    selected_options, unit_total, line_total, extra_value, note, sort_order
  from quote_items where quote_id = p_source_id;

  return v_new_id;
end;
$$;

revoke execute on function public.clone_quote(uuid) from public, anon;
grant execute on function public.clone_quote(uuid) to authenticated;
