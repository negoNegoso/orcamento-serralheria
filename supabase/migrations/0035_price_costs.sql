-- Custo esperado por natureza, pendurado no preço de venda (produto ou opção).
-- Fecha a "Limitação conhecida" da OS: o planejado passa a ser custo, não venda,
-- então a margem nasce prevista em vez de zero.

create table price_costs (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id),
  product_type_id   uuid references product_types(id) on delete cascade,
  option_id         uuid references options(id) on delete cascade,
  price_category_id uuid not null references price_categories(id),
  -- na unidade da venda: R$/m² quando o preço é por m², R$ quando é fixo
  value             numeric(12,2) not null check (value >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- dono é exatamente um dos dois
  check ((product_type_id is null) <> (option_id is null)),
  unique (product_type_id, price_category_id),
  unique (option_id, price_category_id)
);
create index price_costs_company_idx on price_costs(company_id);
create index price_costs_product_idx on price_costs(product_type_id);
create index price_costs_option_idx  on price_costs(option_id);

alter table price_costs enable row level security;

-- Diferente de product_types/options (que o vendedor lê para montar orçamento):
-- custo é dado de admin, então nem leitura o vendedor tem.
create policy pcost_all on price_costs for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

-- 'custo' = planejado veio de custo cadastrado; 'venda' = preço sem custo
-- cadastrado (fallback pela venda); 'estrutural' = linha sem preço cadastrável
-- (modelo, ajuste do item, arredondamento) — nunca conta como pendência.
-- Default 'venda' deixa as linhas já existentes semanticamente corretas.
alter table work_order_costs add column planned_kind text not null default 'venda'
  check (planned_kind in ('custo','venda','estrutural'));

-- planned_kind entra no congelamento: é parte da foto da aprovação.
create or replace function public.woc_frozen_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.planned_value is distinct from old.planned_value then
    raise exception 'planned_value é congelado e não pode ser alterado';
  end if;
  if new.planned_kind is distinct from old.planned_kind then
    raise exception 'planned_kind é congelado e não pode ser alterado';
  end if;
  if new.work_order_id is distinct from old.work_order_id then
    raise exception 'Lançamento não pode mudar de ordem de serviço';
  end if;
  return new;
end;
$$;

-- Margem prevista: o que sobra se o real fechar no custo esperado.
create or replace view work_order_totals with (security_invoker = on) as
  select
    wo.id         as work_order_id,
    wo.company_id,
    wo.quote_total,
    coalesce(sum(c.planned_value), 0) as planned_total,
    coalesce(sum(c.actual_value), 0)  as actual_total,
    coalesce(sum(c.actual_value), 0) - coalesce(sum(c.planned_value), 0) as variance,
    wo.quote_total - coalesce(sum(c.actual_value), 0)  as margin,
    wo.quote_total - coalesce(sum(c.planned_value), 0) as predicted_margin
  from work_orders wo
  left join work_order_costs c on c.work_order_id = wo.id
  group by wo.id;
