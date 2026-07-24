-- Ordem de Serviço: registro do ciclo pós-aprovação, com custo planejado
-- (clone congelado do orçamento) e custo real lançado durante a produção.
-- Não altera quotes: production_stage/archived_at migram na 0033/0034.

create table work_orders (
  id                uuid primary key default gen_random_uuid(),
  quote_id          uuid not null unique references quotes(id) on delete cascade,
  company_id        uuid not null references companies(id),
  number            int  not null,
  status            text not null default 'planejada'
                      check (status in ('planejada','em_andamento','concluida','cancelada')),
  production_stage  text check (production_stage in
                      ('pendente','a_produzir','em_producao','pronto','instalado')),
  archived_at       timestamptz,
  -- congelados na criação: o planejado é a foto do momento da aprovação
  quote_total       numeric(12,2) not null,
  quote_snapshot_at timestamptz not null,
  closed_at         timestamptz,
  closed_by         uuid references profiles(id) on delete set null,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, number)
);
create index work_orders_company_idx on work_orders(company_id);
create index work_orders_stage_idx on work_orders(production_stage) where archived_at is null;

create table work_order_costs (
  id                uuid primary key default gen_random_uuid(),
  work_order_id     uuid not null references work_orders(id) on delete cascade,
  company_id        uuid not null references companies(id),
  source            text not null check (source in ('orcamento','manual','terceiro')),
  description       text not null,
  -- rótulo do item de origem, congelado: agrupa a UI mesmo se o item sumir
  item_label        text not null default '',
  quote_item_id     uuid references quote_items(id) on delete set null,
  price_category_id uuid references price_categories(id),
  qty               numeric(10,2) not null default 1 check (qty >= 0),
  unit_value        numeric(12,2) not null default 0,
  -- gerada: um caminho único de edição (qty, unit_value), sem chance de divergir
  actual_value      numeric(12,2) not null
                      generated always as (round(qty * unit_value, 2)) stored,
  planned_value     numeric(12,2) not null default 0,
  supplier          text not null default '',
  note              text not null default '',
  sort_order        int not null default 0,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index work_order_costs_wo_idx on work_order_costs(work_order_id);
create index work_order_costs_company_idx on work_order_costs(company_id);
create index work_order_costs_category_idx on work_order_costs(price_category_id);

-- security_invoker: herdam as policies do usuário. Vendedor não vê custo nenhum,
-- então as views devolvem zero pra ele — mesmo padrão de quote_financials (0027).
create view work_order_totals with (security_invoker = on) as
  select
    wo.id         as work_order_id,
    wo.company_id,
    wo.quote_total,
    coalesce(sum(c.planned_value), 0) as planned_total,
    coalesce(sum(c.actual_value), 0)  as actual_total,
    coalesce(sum(c.actual_value), 0) - coalesce(sum(c.planned_value), 0) as variance,
    wo.quote_total - coalesce(sum(c.actual_value), 0) as margin
  from work_orders wo
  left join work_order_costs c on c.work_order_id = wo.id
  group by wo.id;

create view work_order_category_totals with (security_invoker = on) as
  select
    c.work_order_id,
    c.company_id,
    c.price_category_id,
    sum(c.planned_value) as planned_total,
    sum(c.actual_value)  as actual_total,
    sum(c.actual_value) - sum(c.planned_value) as variance
  from work_order_costs c
  group by c.work_order_id, c.company_id, c.price_category_id;

alter table work_orders enable row level security;

-- Leitura para qualquer membro da empresa: o board de produção precisa da etapa.
create policy wo_read on work_orders for select to authenticated
  using (company_id = current_company_id());

-- Escrita direta só de admin. Vendedor mexe na OS pelas RPCs security definer
-- (create_work_order, cancel_work_order, set_production_stage) — ver 0032.
create policy wo_write on work_orders for update to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

alter table work_order_costs enable row level security;

-- Custo é dado de admin: sem policy de leitura para vendedor.
create policy woc_all on work_order_costs for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

-- Concluir a OS congela os lançamentos. Regra que nenhuma policy expressa.
create or replace function public.woc_closed_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_wo     uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then v_wo := old.work_order_id; else v_wo := new.work_order_id; end if;
  select status into v_status from work_orders where id = v_wo;
  if v_status in ('concluida','cancelada') then
    raise exception 'Ordem de serviço encerrada: lançamentos bloqueados';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger woc_closed_guard
  before insert or update or delete on work_order_costs
  for each row execute function public.woc_closed_guard();
