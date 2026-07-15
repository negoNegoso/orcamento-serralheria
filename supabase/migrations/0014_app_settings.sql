-- Singleton com a flag global de manutenção (kill switch)
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Leitura pública: o proxy lê a flag com a anon key. Não é segredo.
create policy app_settings_read on public.app_settings
  for select to anon, authenticated using (true);

-- Sem policy de escrita: só service role (Table Editor / SQL do dashboard) altera.
