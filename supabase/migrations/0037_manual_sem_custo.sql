-- Fix wave pós-revisão final do custo esperado (2026-07-24). Duas mudanças
-- nesta migration:
--
-- 1. `work_order_clone_costs` é recriada idêntica à 0036, exceto:
--    a) o `v_has_cost` da BASE do item agora também exige
--       `pricing_mode <> 'manual'` — espelha a mudança feita em decomposeItem
--       (TS): produto manual não tem preço tabelado, então também não tem
--       custo de catálogo, mesmo que existam linhas antigas de price_costs
--       de quando o produto era fixo/m². (Não muda a opção: opções não têm
--       pricing_mode.)
--    b) os dois `order by cat.sort_order` (base e opção) ganham o tiebreaker
--       `, cat.id` — espelha `sortByCategoryRank` em quote-preview.ts, que
--       agora desempata por priceCategoryId quando o sort_order é igual.
--
-- 2. Backfill único: linhas anteriores a esta feature nasceram todas com o
--    default 'venda' (inclusive as estruturais), então reclassifica as
--    estruturais por descrição — ver comentário abaixo do corpo da função.

create or replace function public.work_order_clone_costs(
  p_work_order_id uuid,
  p_quote_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company   uuid;
  v_mult      int;
  it          record;
  o           jsonb;
  cc          record;
  v_label     text;
  v_venda     numeric(12,2);
  v_sum_venda numeric(12,2);
  v_total     numeric(12,2);
  v_res       numeric(12,2);
  v_cat       uuid;
  v_opt_id    text;
  v_opt_uuid  uuid;
  v_sort      int := 0;
  v_raw       text;
  v_factor    numeric(12,4);
  v_has_cost  boolean;
begin
  select company_id, coalesce(multiplier, 1) into v_company, v_mult
    from quotes where id = p_quote_id;

  for it in
    select qi.*, pt.price_category_id as product_category_id,
           pt.id as pt_id, pt.pricing_mode
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
    v_sum_venda := 0;

    ----------------------------------------------------------------- preço base
    v_venda := round(it.unit_base_price * it.qty * v_mult, 2);
    v_sum_venda := v_sum_venda + v_venda;
    -- custo da base é R$/m² quando o produto vende por m²
    v_factor := case when it.pricing_mode in ('m2','m2_direto')
                     then coalesce(it.area_m2, 0) else 1 end;

    -- 'manual' não tem preço tabelado, então também não tem custo de catálogo
    select coalesce(it.pricing_mode, '') <> 'manual'
       and exists (select 1 from price_costs where product_type_id = it.pt_id)
      into v_has_cost;

    if v_has_cost then
      for cc in
        select pc.value, pc.price_category_id, coalesce(cat.name, 'Sem categoria') as cat_name
          from price_costs pc
          left join price_categories cat on cat.id = pc.price_category_id
         where pc.product_type_id = it.pt_id
         order by cat.sort_order, cat.id
      loop
        insert into work_order_costs (work_order_id, company_id, source, description,
          item_label, quote_item_id, price_category_id, qty, unit_value, planned_value,
          planned_kind, sort_order)
        values (p_work_order_id, v_company, 'orcamento', 'Preço base — ' || cc.cat_name,
          v_label, it.id, cc.price_category_id, 1,
          round(cc.value * v_factor * it.qty * v_mult, 2),
          round(cc.value * v_factor * it.qty * v_mult, 2), 'custo', v_sort);
        v_sort := v_sort + 1;
      end loop;
    else
      insert into work_order_costs (work_order_id, company_id, source, description,
        item_label, quote_item_id, price_category_id, qty, unit_value, planned_value,
        planned_kind, sort_order)
      values (p_work_order_id, v_company, 'orcamento', 'Preço base',
        v_label, it.id, it.product_category_id, 1, v_venda, v_venda, 'venda', v_sort);
      v_sort := v_sort + 1;
    end if;

    -------------------------------------------------------------------- opções
    for o in select value from jsonb_array_elements(it.selected_options)
    loop
      v_opt_id := o->>'optionId';
      v_opt_uuid := null;
      v_cat := null;
      if v_opt_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        v_opt_uuid := v_opt_id::uuid;
        select coalesce(op.price_category_id, g.price_category_id) into v_cat
          from options op
          join option_groups g on g.id = op.group_id
         where op.id = v_opt_uuid;
      end if;

      v_raw := o->>'surchargeValue';
      if v_raw is null or v_raw !~ '^-?[0-9]+(\.[0-9]+)?$' then
        v_raw := '0';
      end if;

      v_venda := round((case when o->>'surchargeType' = 'por_m2'
                             then v_raw::numeric * coalesce(it.area_m2, 0)
                             else v_raw::numeric end)
                       * it.qty * v_mult, 2);
      v_sum_venda := v_sum_venda + v_venda;
      v_factor := case when o->>'surchargeType' = 'por_m2'
                       then coalesce(it.area_m2, 0) else 1 end;

      v_has_cost := v_opt_uuid is not null
        and exists (select 1 from price_costs where option_id = v_opt_uuid);

      if v_has_cost then
        for cc in
          select pc.value, pc.price_category_id, coalesce(cat.name, 'Sem categoria') as cat_name
            from price_costs pc
            left join price_categories cat on cat.id = pc.price_category_id
           where pc.option_id = v_opt_uuid
           order by cat.sort_order, cat.id
        loop
          insert into work_order_costs (work_order_id, company_id, source, description,
            item_label, quote_item_id, price_category_id, qty, unit_value, planned_value,
            planned_kind, sort_order)
          values (p_work_order_id, v_company, 'orcamento',
            coalesce(o->>'group', '') || ' — ' || coalesce(o->>'label', '') || ' — ' || cc.cat_name,
            v_label, it.id, cc.price_category_id, 1,
            round(cc.value * v_factor * it.qty * v_mult, 2),
            round(cc.value * v_factor * it.qty * v_mult, 2), 'custo', v_sort);
          v_sort := v_sort + 1;
        end loop;
      else
        insert into work_order_costs (work_order_id, company_id, source, description,
          item_label, quote_item_id, price_category_id, qty, unit_value, planned_value,
          planned_kind, sort_order)
        values (p_work_order_id, v_company, 'orcamento',
          coalesce(o->>'group', '') || ' — ' || coalesce(o->>'label', ''),
          v_label, it.id, v_cat, 1, v_venda, v_venda, 'venda', v_sort);
        v_sort := v_sort + 1;
      end if;
    end loop;

    ------------------------------------------------------------ ajuste da linha
    if coalesce(it.extra_value, 0) <> 0 then
      v_venda := round(it.extra_value * v_mult, 2);
      v_sum_venda := v_sum_venda + v_venda;
      insert into work_order_costs (work_order_id, company_id, source, description,
        item_label, quote_item_id, price_category_id, qty, unit_value, planned_value,
        planned_kind, sort_order)
      values (p_work_order_id, v_company, 'orcamento', 'Ajuste do item',
        v_label, it.id, null, 1, v_venda, v_venda, 'estrutural', v_sort);
      v_sort := v_sort + 1;
    end if;

    ------------------------------------- resíduo: modelo + sobra de arredondamento
    v_total := round(it.line_total * v_mult, 2);
    v_res := round(v_total - v_sum_venda, 2);
    if v_res <> 0 then
      insert into work_order_costs (work_order_id, company_id, source, description,
        item_label, quote_item_id, price_category_id, qty, unit_value, planned_value,
        planned_kind, sort_order)
      values (p_work_order_id, v_company, 'orcamento',
        case when nullif(it.model_name, '') is not null then 'Modelo ' || it.model_name
             else 'Ajuste de arredondamento' end,
        v_label, it.id, null, 1, v_res, v_res, 'estrutural', v_sort);
      v_sort := v_sort + 1;
    end if;
  end loop;
end;
$$;

revoke execute on function public.work_order_clone_costs(uuid, uuid) from public, anon, authenticated;

-- Linhas anteriores ao custo esperado nasceram todas com o default 'venda',
-- inclusive as estruturais — que ganhariam o aviso "sem custo cadastrado" sem
-- ter onde cadastrar custo. Reclassifica uma vez, por descrição: sniffing é
-- aceitável numa migração pontual, não no código que roda sempre.
alter table work_order_costs disable trigger woc_frozen_guard;
update work_order_costs set planned_kind = 'estrutural'
 where planned_kind = 'venda'
   and (description = 'Ajuste do item'
     or description = 'Ajuste de arredondamento'
     or description like 'Modelo %');
alter table work_order_costs enable trigger woc_frozen_guard;
