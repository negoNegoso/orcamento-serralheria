-- supabase/migrations/0028_dashboard_financeiro.sql
-- Adiciona o bloco 'financeiro' ao dashboard_metrics: recebido (por receipt_date
-- no período), a receber (saldo de aprovados) e nº de aprovados em aberto.
-- IMPORTANTE: baseado na versão MULTI-TENANT do 0018 (is_company_admin() +
-- escopo por current_company_id()), não na versão single-tenant do 0006.
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
    ),
    'financeiro', jsonb_build_object(
      'received_total', (
        select coalesce(sum(r.amount), 0)
        from receipts r
        where r.company_id = v_company
          and (p_start is null or r.receipt_date >= p_start::date)
          and (p_end is null or r.receipt_date < p_end::date)
      ),
      'receivable_total', (
        select coalesce(sum(f.balance), 0)
        from quote_financials f
        where f.status = 'aprovado'
          and f.company_id = v_company
      ),
      'overdue_count', (
        select count(*)
        from quote_financials f
        where f.status = 'aprovado' and f.balance > 0
          and f.company_id = v_company
      )
    )
  ) into result;

  return result;
end;
$$;
grant execute on function public.dashboard_metrics(timestamptz, timestamptz) to authenticated;
