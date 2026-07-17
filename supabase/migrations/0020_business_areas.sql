-- Catálogo compartilhado de áreas de atuação. Denormalizado: companies.business_area
-- continua text; esta tabela apenas alimenta a caixa de pesquisa.
create table business_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Unicidade case-insensitive: evita "Serralheria" vs "serralheria".
create unique index business_areas_name_lower_uq on business_areas (lower(name));

insert into business_areas (name) values ('Serralheria'), ('Construção')
  on conflict do nothing;

alter table business_areas enable row level security;

-- Leitura: qualquer usuário autenticado (lista compartilhada, não isolada por empresa).
create policy ba_read on business_areas for select to authenticated using (true);

-- Inserção: admins e vendedores (auto-add ao salvar empresa em /admin/empresa).
create policy ba_insert on business_areas for insert to authenticated
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid() and active
        and role in ('admin', 'vendedor', 'admin_system')
    )
  );

-- Edição e remoção: apenas admin_system (tela de gestão).
create policy ba_update on business_areas for update to authenticated
  using (is_admin_system()) with check (is_admin_system());
create policy ba_delete on business_areas for delete to authenticated
  using (is_admin_system());
