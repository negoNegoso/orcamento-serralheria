-- supabase/migrations/0027_receipts.sql
-- Recibos persistidos por orçamento. Um orçamento pode ter vários recibos
-- (parcelas/entradas); a soma dos amounts não pode exceder quotes.total.

create table receipts (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references quotes(id) on delete cascade,
  company_id      uuid not null references companies(id),
  amount          numeric(12,2) not null check (amount >= 0),
  receipt_date    date not null default current_date,
  payer_doc       text not null default '',
  payment_method  text not null default '',
  receiver_name   text not null default '',
  receiver_doc    text not null default '',
  receiver_method text not null default '',
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index receipts_quote_idx on receipts(quote_id);
create index receipts_company_idx on receipts(company_id);

alter table receipts enable row level security;

-- Dados operacionais: qualquer membro da empresa (mesmo padrão de quotes).
create policy re_all on receipts for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- View de números financeiros por orçamento (recebido/saldo/quitado).
-- security_invoker = on → respeita as policies do usuário (não vaza entre empresas).
create view quote_financials
  with (security_invoker = on) as
  select
    q.id                                          as quote_id,
    q.company_id,
    q.status,
    q.total,
    coalesce(sum(r.amount), 0)                    as received,
    q.total - coalesce(sum(r.amount), 0)          as balance,
    (q.total - coalesce(sum(r.amount), 0)) <= 0   as settled
  from quotes q
  left join receipts r on r.quote_id = q.id
  group by q.id;

-- Grava recibo (insert ou update) validando soma ≤ total na transação.
-- security invoker → o select em quotes respeita RLS (isolamento por empresa).
create or replace function public.save_receipt(
  p_id uuid,
  p_quote_id uuid,
  p_data jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company_id uuid;
  v_total      numeric(12,2);
  v_others     numeric(12,2);
  v_amount     numeric(12,2);
  v_id         uuid;
begin
  select company_id, total into v_company_id, v_total
  from quotes where id = p_quote_id
  for update;
  if v_company_id is null then
    raise exception 'Orçamento não encontrado';
  end if;

  if (p_data->>'amount') is null or (p_data->>'amount') !~ '^-?[0-9]+(\.[0-9]+)?$' then
    raise exception 'Valor do recibo inválido';
  end if;
  v_amount := (p_data->>'amount')::numeric;
  if v_amount < 0 then
    raise exception 'Valor do recibo inválido';
  end if;

  -- soma dos demais recibos (exclui o próprio no update)
  select coalesce(sum(amount), 0) into v_others
  from receipts
  where quote_id = p_quote_id
    and (p_id is null or id <> p_id);

  if v_others + v_amount > v_total then
    raise exception 'Recibos excedem o total do orçamento (saldo disponível: %)',
      (v_total - v_others);
  end if;

  if p_id is null then
    insert into receipts (
      quote_id, company_id, amount, receipt_date, payer_doc, payment_method,
      receiver_name, receiver_doc, receiver_method, created_by
    ) values (
      p_quote_id, v_company_id, v_amount,
      coalesce((p_data->>'receipt_date')::date, current_date),
      coalesce(p_data->>'payer_doc', ''),
      coalesce(p_data->>'payment_method', ''),
      coalesce(p_data->>'receiver_name', ''),
      coalesce(p_data->>'receiver_doc', ''),
      coalesce(p_data->>'receiver_method', ''),
      auth.uid()
    ) returning id into v_id;
  else
    update receipts set
      amount          = v_amount,
      receipt_date    = coalesce((p_data->>'receipt_date')::date, receipt_date),
      payer_doc       = coalesce(p_data->>'payer_doc', payer_doc),
      payment_method  = coalesce(p_data->>'payment_method', payment_method),
      receiver_name   = coalesce(p_data->>'receiver_name', receiver_name),
      receiver_doc    = coalesce(p_data->>'receiver_doc', receiver_doc),
      receiver_method = coalesce(p_data->>'receiver_method', receiver_method),
      updated_at      = now()
    where id = p_id and quote_id = p_quote_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Recibo não encontrado';
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_receipt(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_receipt(uuid, uuid, jsonb) to authenticated;
