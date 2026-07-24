-- Funções da OS. As três alcançáveis por vendedor (create/cancel/set_stage) são
-- security definer porque ele não tem policy de escrita; cada uma valida a
-- empresa explicitamente, já que em definer a RLS não protege mais nada.

-- Clona a composição de preços do orçamento como custo planejado.
-- Interna: quem chama já validou a empresa. Espelha decomposeItem() em TS.
create or replace function public.work_order_clone_costs(
  p_work_order_id uuid,
  p_quote_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_mult    int;
  it        record;
  o         jsonb;
  v_label   text;
  v_val     numeric(12,2);
  v_sum     numeric(12,2);
  v_total   numeric(12,2);
  v_cat     uuid;
  v_opt_id  text;
  v_sort    int := 0;
begin
  select company_id, coalesce(multiplier, 1) into v_company, v_mult
    from quotes where id = p_quote_id;

  for it in
    select qi.*, pt.price_category_id as product_category_id
      from quote_items qi
      left join product_types pt on pt.id = qi.product_type_id
     where qi.quote_id = p_quote_id
     order by qi.sort_order
  loop
    v_label := it.product_name || case
      when it.width_m is not null and it.height_m is not null
      then ' ' || replace(to_char(it.width_m, 'FM999990D00'), '.', ',')
           || '×' || replace(to_char(it.height_m, 'FM999990D00'), '.', ',')
      else '' end;
    v_sum := 0;

    -- preço base, com a categoria do produto
    v_val := round(it.unit_base_price * it.qty * v_mult, 2);
    insert into work_order_costs (work_order_id, company_id, source, description,
      item_label, quote_item_id, price_category_id, qty, unit_value, planned_value, sort_order)
    values (p_work_order_id, v_company, 'orcamento', 'Preço base',
      v_label, it.id, it.product_category_id, 1, v_val, v_val, v_sort);
    v_sum := v_sum + v_val;
    v_sort := v_sort + 1;

    -- uma linha por opção do snapshot, inclusive as de valor zero
    for o in select value from jsonb_array_elements(it.selected_options)
    loop
      v_opt_id := o->>'optionId';
      v_cat := null;
      if v_opt_id ~ '^[0-9a-fA-F-]{36}$' then
        select coalesce(op.price_category_id, g.price_category_id) into v_cat
          from options op
          join option_groups g on g.id = op.group_id
         where op.id = v_opt_id::uuid;
      end if;

      v_val := round((case when o->>'surchargeType' = 'por_m2'
                           then (o->>'surchargeValue')::numeric * coalesce(it.area_m2, 0)
                           else (o->>'surchargeValue')::numeric end)
                     * it.qty * v_mult, 2);

      insert into work_order_costs (work_order_id, company_id, source, description,
        item_label, quote_item_id, price_category_id, qty, unit_value, planned_value, sort_order)
      values (p_work_order_id, v_company, 'orcamento',
        coalesce(o->>'group', '') || ' — ' || coalesce(o->>'label', ''),
        v_label, it.id, v_cat, 1, v_val, v_val, v_sort);
      v_sum := v_sum + v_val;
      v_sort := v_sort + 1;
    end loop;

    -- ajuste livre da linha
    if coalesce(it.extra_value, 0) <> 0 then
      v_val := round(it.extra_value * v_mult, 2);
      insert into work_order_costs (work_order_id, company_id, source, description,
        item_label, quote_item_id, price_category_id, qty, unit_value, planned_value, sort_order)
      values (p_work_order_id, v_company, 'orcamento', 'Ajuste do item',
        v_label, it.id, null, 1, v_val, v_val, v_sort);
      v_sum := v_sum + v_val;
      v_sort := v_sort + 1;
    end if;

    -- resíduo: surcharge do modelo (não persistido em quote_items) + arredondamento
    v_total := round(it.line_total * v_mult, 2);
    v_val := round(v_total - v_sum, 2);
    if v_val <> 0 then
      insert into work_order_costs (work_order_id, company_id, source, description,
        item_label, quote_item_id, price_category_id, qty, unit_value, planned_value, sort_order)
      values (p_work_order_id, v_company, 'orcamento',
        case when it.model_name is not null then 'Modelo ' || it.model_name
             else 'Ajuste de arredondamento' end,
        v_label, it.id, null, 1, v_val, v_val, v_sort);
      v_sort := v_sort + 1;
    end if;
  end loop;
end;
$$;

-- Cria (ou revive) a OS de um orçamento aprovado. Idempotente.
create or replace function public.create_work_order(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  q     record;
  v_id  uuid;
  v_num int;
begin
  select * into q from quotes where id = p_quote_id for update;
  if q.id is null then
    raise exception 'Orçamento não encontrado';
  end if;
  if q.company_id is distinct from current_company_id() then
    raise exception 'not authorized';
  end if;
  if q.status <> 'aprovado' then
    raise exception 'Orçamento não está aprovado';
  end if;

  select id into v_id from work_orders where quote_id = p_quote_id;
  if v_id is not null then
    -- reaprovação: a mesma OS volta, com os custos já lançados
    update work_orders set status = 'planejada', updated_at = now()
     where id = v_id and status = 'cancelada';
    return v_id;
  end if;

  -- serializa a numeração da empresa; unique(company_id, number) é a rede
  perform pg_advisory_xact_lock(hashtext(q.company_id::text));
  select coalesce(max(number), 0) + 1 into v_num
    from work_orders where company_id = q.company_id;

  insert into work_orders (quote_id, company_id, number, production_stage,
    quote_total, quote_snapshot_at, created_by)
  values (p_quote_id, q.company_id, v_num, 'pendente',
    q.total, q.updated_at, auth.uid())
  returning id into v_id;

  perform work_order_clone_costs(v_id, p_quote_id);
  return v_id;
end;
$$;

-- Orçamento saiu de aprovado: cancela a OS, preservando os custos lançados.
create or replace function public.cancel_work_order(p_quote_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  select company_id into v_company from quotes where id = p_quote_id;
  if v_company is null or v_company is distinct from current_company_id() then
    raise exception 'not authorized';
  end if;
  update work_orders set status = 'cancelada', updated_at = now()
   where quote_id = p_quote_id and status <> 'cancelada';
end;
$$;

-- Único caminho de escrita do vendedor: etapa (e arquivamento). Toca só essas
-- colunas, mais a promoção automática para em_andamento.
create or replace function public.set_production_stage(
  p_quote_id uuid,
  p_stage text,
  p_archive boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare wo record;
begin
  if p_stage not in ('pendente','a_produzir','em_producao','pronto','instalado') then
    raise exception 'Etapa inválida';
  end if;

  select * into wo from work_orders where quote_id = p_quote_id for update;
  if wo.id is null then
    raise exception 'Ordem de serviço não encontrada';
  end if;
  if wo.company_id is distinct from current_company_id() then
    raise exception 'not authorized';
  end if;
  if wo.status = 'cancelada' then
    raise exception 'Ordem de serviço cancelada';
  end if;

  update work_orders set
    production_stage = p_stage,
    archived_at = case when p_archive then now() else archived_at end,
    status = case when status = 'planejada' and p_stage not in ('pendente','a_produzir')
                  then 'em_andamento' else status end,
    updated_at = now()
   where id = wo.id;
end;
$$;

-- Encerramento financeiro. Não calcula total: o CPreal é work_order_totals.
-- security invoker: só admin chama, e admin já tem a policy de update.
create or replace function public.close_work_order(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not is_company_admin() then
    raise exception 'not authorized';
  end if;
  update work_orders set status = 'concluida', closed_at = now(),
    closed_by = auth.uid(), updated_at = now()
   where id = p_id and status in ('planejada','em_andamento');
  if not found then
    raise exception 'Ordem de serviço não pode ser concluída';
  end if;
end;
$$;

create or replace function public.reopen_work_order(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not is_company_admin() then
    raise exception 'not authorized';
  end if;
  update work_orders set status = 'em_andamento', closed_at = null,
    closed_by = null, updated_at = now()
   where id = p_id and status = 'concluida';
  if not found then
    raise exception 'Ordem de serviço não está concluída';
  end if;
end;
$$;

revoke execute on function public.work_order_clone_costs(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.create_work_order(uuid) from public, anon;
revoke execute on function public.cancel_work_order(uuid) from public, anon;
revoke execute on function public.set_production_stage(uuid, text, boolean) from public, anon;
revoke execute on function public.close_work_order(uuid) from public, anon;
revoke execute on function public.reopen_work_order(uuid) from public, anon;

grant execute on function public.create_work_order(uuid) to authenticated;
grant execute on function public.cancel_work_order(uuid) to authenticated;
grant execute on function public.set_production_stage(uuid, text, boolean) to authenticated;
grant execute on function public.close_work_order(uuid) to authenticated;
grant execute on function public.reopen_work_order(uuid) to authenticated;
