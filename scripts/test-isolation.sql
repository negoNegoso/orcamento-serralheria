-- Teste de isolamento multi-tenant. Rodar via MCP execute_sql ou psql.
-- Tudo em transação com rollback: nada persiste.
begin;

-- Empresas e usuários sintéticos
insert into companies (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Empresa A Teste'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Empresa B Teste');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'authenticated', 'authenticated', 'iso-a@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000002', 'authenticated', 'authenticated', 'iso-b@test.local', 'x', now(), now(), now());

insert into profiles (id, email, name, role, company_id) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'iso-a@test.local', 'User A', 'admin', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-1111-0000-0000-000000000002', 'iso-b@test.local', 'User B', 'admin', 'bbbbbbbb-0000-0000-0000-000000000002');

insert into quotes (id, customer_name, company_id) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'Cliente da A', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-2222-0000-0000-000000000002', 'Cliente da B', 'bbbbbbbb-0000-0000-0000-000000000002');

-- Vira o usuário A
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1111-0000-0000-000000000001","role":"authenticated"}';

do $$
begin
  -- A vê exatamente 1 orçamento (o seu)
  if (select count(*) from quotes) <> 1 then
    raise exception 'FALHA: user A vê % orçamentos, esperado 1', (select count(*) from quotes);
  end if;
  -- A não enxerga o orçamento da B
  if exists (select 1 from quotes where id = 'bbbbbbbb-2222-0000-0000-000000000002') then
    raise exception 'FALHA: user A enxerga orçamento da empresa B';
  end if;
  -- A não enxerga a empresa B
  if exists (select 1 from companies where id = 'bbbbbbbb-0000-0000-0000-000000000002') then
    raise exception 'FALHA: user A enxerga a empresa B';
  end if;
  -- A não consegue gravar na empresa B (with check)
  begin
    insert into quotes (customer_name, company_id)
    values ('invasor', 'bbbbbbbb-0000-0000-0000-000000000002');
    raise exception 'FALHA: user A inseriu orçamento na empresa B';
  exception when insufficient_privilege or check_violation then
    null; -- esperado: RLS recusou
  end;
end $$;

reset role;
select 'ISOLAMENTO OK' as resultado;
rollback;
