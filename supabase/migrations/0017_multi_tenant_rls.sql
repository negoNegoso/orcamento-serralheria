-- RLS multi-tenant. Isolamento vive aqui: toda policy filtra por empresa e
-- todo with check força gravação na empresa efetiva do usuário.

-- Empresa efetiva: membro comum → sua empresa (null se suspensa → vê nada);
-- admin_system → empresa selecionada para suporte (null se nenhuma).
create or replace function public.current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select case
    when p.role = 'admin_system' then p.acting_company_id
    when c.status = 'ativa' then p.company_id
    else null
  end
  from profiles p
  left join companies c on c.id = p.company_id
  where p.id = auth.uid() and p.active
$$;

create or replace function public.is_admin_system() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin_system' and active
  )
$$;

-- Admin da empresa efetiva, ou admin_system atuando em alguma empresa.
create or replace function public.is_company_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.active
      and (
        (p.role = 'admin' and p.company_id is not null and p.company_id = public.current_company_id())
        or (p.role = 'admin_system' and p.acting_company_id is not null)
      )
  )
$$;

-- Derruba policies antigas (single-tenant)
drop policy pt_read on product_types;
drop policy pt_write on product_types;
drop policy og_read on option_groups;
drop policy og_write on option_groups;
drop policy op_read on options;
drop policy op_write on options;
drop policy mo_read on models;
drop policy mo_write on models;
drop policy pc_read on payment_conditions;
drop policy pc_write on payment_conditions;
drop policy pr_read on profiles;
drop policy pr_write on profiles;
drop policy q_all on quotes;
drop policy qi_all on quote_items;
drop policy cl_all on clients;
drop policy fotos_insert on storage.objects;
drop policy fotos_update on storage.objects;
drop policy fotos_delete on storage.objects;

-- Configuração: leitura por membro da empresa, escrita por admin da empresa
create policy pt_read on product_types for select to authenticated
  using (company_id = current_company_id());
create policy pt_write on product_types for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

create policy og_read on option_groups for select to authenticated
  using (company_id = current_company_id());
create policy og_write on option_groups for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

create policy op_read on options for select to authenticated
  using (company_id = current_company_id());
create policy op_write on options for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

create policy mo_read on models for select to authenticated
  using (company_id = current_company_id());
create policy mo_write on models for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

create policy pc_read on payment_conditions for select to authenticated
  using (company_id = current_company_id());
create policy pc_write on payment_conditions for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

-- Dados operacionais: qualquer membro da empresa (comportamento atual, agora por empresa)
create policy q_all on quotes for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());
create policy qi_all on quote_items for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());
create policy cl_all on clients for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- Perfis: o próprio, colegas da mesma empresa, ou admin_system (todos)
create policy pr_read on profiles for select to authenticated
  using (
    id = auth.uid()
    or is_admin_system()
    or (company_id is not null and company_id = current_company_id())
  );
-- Escrita: admin da empresa gerencia a própria equipe; nunca cria admin_system
create policy pr_write on profiles for all to authenticated
  using (is_company_admin() and company_id = current_company_id())
  with check (is_company_admin() and company_id = current_company_id()
              and role in ('admin','vendedor'));

-- Companies: admin_system tudo; membro lê a própria (branding, mesmo suspensa)
create policy co_sys on companies for all to authenticated
  using (is_admin_system()) with check (is_admin_system());
create policy co_read_own on companies for select to authenticated
  using (id = (select company_id from profiles where id = auth.uid()));
create policy co_update_own on companies for update to authenticated
  using (id = current_company_id() and is_company_admin())
  with check (id = current_company_id() and is_company_admin());

-- Membro (mesmo admin) não altera status da própria empresa
create or replace function public.protect_company_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and not public.is_admin_system() then
    raise exception 'Apenas admin_system altera o status da empresa';
  end if;
  return new;
end;
$$;
create trigger companies_protect_status
  before update on companies
  for each row execute function protect_company_status();

-- Storage: escrita só no prefixo da empresa efetiva ({company_id}/...)
create policy fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and is_company_admin()
    and (storage.foldername(name))[1] = current_company_id()::text);
create policy fotos_update on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and is_company_admin()
    and (storage.foldername(name))[1] = current_company_id()::text);
create policy fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and is_company_admin()
    and (storage.foldername(name))[1] = current_company_id()::text);
