create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and active
  )
$$;

alter table company_settings enable row level security;
alter table profiles enable row level security;
alter table product_types enable row level security;
alter table option_groups enable row level security;
alter table options enable row level security;
alter table models enable row level security;
alter table payment_conditions enable row level security;
alter table quotes enable row level security;
alter table quote_items enable row level security;

-- Configuração: leitura autenticada, escrita admin
create policy cfg_read on company_settings for select to authenticated using (true);
create policy cfg_write on company_settings for all to authenticated using (is_admin()) with check (is_admin());
create policy pt_read on product_types for select to authenticated using (true);
create policy pt_write on product_types for all to authenticated using (is_admin()) with check (is_admin());
create policy og_read on option_groups for select to authenticated using (true);
create policy og_write on option_groups for all to authenticated using (is_admin()) with check (is_admin());
create policy op_read on options for select to authenticated using (true);
create policy op_write on options for all to authenticated using (is_admin()) with check (is_admin());
create policy mo_read on models for select to authenticated using (true);
create policy mo_write on models for all to authenticated using (is_admin()) with check (is_admin());
create policy pc_read on payment_conditions for select to authenticated using (true);
create policy pc_write on payment_conditions for all to authenticated using (is_admin()) with check (is_admin());

-- Perfis: lê o próprio ou admin lê todos; escrita admin
create policy pr_read on profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy pr_write on profiles for all to authenticated using (is_admin()) with check (is_admin());

-- Orçamentos: CRUD para autenticados (equipe pequena, todos veem tudo)
create policy q_all on quotes for all to authenticated using (true) with check (true);
create policy qi_all on quote_items for all to authenticated using (true) with check (true);

-- Storage: bucket público para leitura; escrita só admin
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true);
create policy fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and is_admin());
create policy fotos_update on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and is_admin());
create policy fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and is_admin());
