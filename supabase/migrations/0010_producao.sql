-- Planejamento de produção: etapa (kanban), arquivamento (histórico) e checklist de pendências.
alter table quotes
  add column if not exists production_stage text
    check (production_stage in ('pendente','a_produzir','em_producao','pronto','instalado')),
  add column if not exists archived_at timestamptz;

create index if not exists quotes_production_idx
  on quotes (production_stage) where archived_at is null;

create table if not exists quote_pendencies (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists quote_pendencies_quote_idx on quote_pendencies (quote_id);

alter table quote_pendencies enable row level security;
create policy qp_all on quote_pendencies for all to authenticated using (true) with check (true);
