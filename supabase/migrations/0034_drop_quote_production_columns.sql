-- Etapa e arquivamento agora vivem em work_orders (0031/0033). O app já lê de lá.
drop index if exists quotes_production_idx;
alter table quotes
  drop column if exists production_stage,
  drop column if exists archived_at;
