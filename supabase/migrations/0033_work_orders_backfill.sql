-- Uma OS para cada orçamento já aprovado, herdando etapa e arquivamento.
-- Status: arquivado nasce concluído; etapa além de 'a_produzir' nasce em
-- andamento; o resto nasce planejada — mesma regra de nextStatusForStage.
do $$
declare
  q     record;
  v_id  uuid;
  v_num int;
begin
  for q in
    select * from quotes where status = 'aprovado' order by company_id, created_at
  loop
    -- idempotente: orçamento que já tem OS é pulado, então reaplicar a migration
    -- não derruba o backfill inteiro por unique(quote_id)
    continue when exists (select 1 from work_orders where quote_id = q.id);

    select coalesce(max(number), 0) + 1 into v_num
      from work_orders where company_id = q.company_id;

    -- nasce 'planejada' porque woc_closed_guard recusa lançamento em OS
    -- encerrada; o status final é gravado depois do clone.
    insert into work_orders (quote_id, company_id, number, status, production_stage,
      archived_at, quote_total, quote_snapshot_at, closed_at, created_at)
    values (
      q.id, q.company_id, v_num, 'planejada',
      coalesce(q.production_stage, 'pendente'),
      q.archived_at, q.total, q.updated_at, q.archived_at, q.created_at
    )
    returning id into v_id;

    perform work_order_clone_costs(v_id, q.id);

    update work_orders set status = case
        when q.archived_at is not null then 'concluida'
        when coalesce(q.production_stage, 'pendente') in ('pendente','a_produzir') then 'planejada'
        else 'em_andamento'
      end
     where id = v_id;
  end loop;
end;
$$;
