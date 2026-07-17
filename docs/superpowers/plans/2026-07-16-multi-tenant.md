# Multi-tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o sistema single-tenant em plataforma multi-empresa com isolamento total por RLS, perfil `admin_system` (cria/gerencia/suspende empresas, entra como suporte) e cor destaque por empresa.

**Architecture:** Banco único Supabase + coluna `company_id` em todas as tabelas de dados + RLS por empresa via `current_company_id()`. admin_system tem `company_id null` e usa `acting_company_id` para "entrar" numa empresa. Área nova `/sistema` fora do grupo `(app)`. Cor destaque injetada como CSS variables no layout.

**Tech Stack:** Next.js 16 (App Router, breaking changes — ler `node_modules/next/dist/docs/` antes de codar), Supabase (Postgres RLS, @supabase/ssr), Tailwind 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-multi-tenant-design.md`

## Global Constraints

- Copy/UI em pt-BR, seguindo tom das telas existentes.
- Migrations numeradas sequencialmente em `supabase/migrations/` (próxima: `0016_`).
- Aplicar migrations no Supabase via MCP `apply_migration` (ou `supabase db push`). Testar em branch do Supabase antes de produção se disponível.
- `SUPABASE_SERVICE_ROLE_KEY` só em código server-only (`createAdminClient`).
- Testes: `npm test` (Vitest). Testar lógica pura; nada de mock de Supabase.
- Commits frequentes, mensagens em pt-BR estilo `feat(escopo): descrição` (padrão do repo).
- Cor default da plataforma: `#006688` (o `--primary` atual de `globals.css`).
- As 9 tabelas de dados que ganham `company_id`: `profiles`, `product_types`, `option_groups`, `options`, `models`, `payment_conditions`, `quotes`, `quote_items`, `clients`.

---

### Task 1: Migration 0016 — schema multi-tenant (companies + company_id + backfill)

**Files:**
- Create: `supabase/migrations/0016_multi_tenant_schema.sql`

**Interfaces:**
- Produces: tabela `companies` (colunas abaixo), coluna `company_id` nas 9 tabelas, `profiles.acting_company_id`, role `admin_system` permitido. Empresa #1 criada a partir do `company_settings` atual.

Antes de escrever, confira os tipos exatos de `cnpj`/`receiver_name`/`signature_url` em `supabase/migrations/0011_company_cnpj.sql`, `0012_receiver_name.sql`, `0013_signature_url.sql` e espelhe-os em `companies`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Multi-tenant: tabela companies, company_id em todas as tabelas de dados,
-- backfill dos dados existentes para a empresa #1 (criada do company_settings).

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'ativa' check (status in ('ativa','suspensa')),
  logo_url text,
  city text not null default '',
  phone text not null default '',
  about_text text not null default '',
  warranty_text text not null default '',
  default_validity_days int not null default 15,
  cnpj text not null default '',
  receiver_name text not null default '',
  signature_url text,
  accent_color text not null default '#006688' check (accent_color ~ '^#[0-9a-f]{6}$'),
  business_area text not null default 'Serralheria',
  created_at timestamptz not null default now()
);

-- Empresa #1 nasce do singleton atual
insert into companies (name, logo_url, city, phone, about_text, warranty_text,
  default_validity_days, cnpj, receiver_name, signature_url)
select name, logo_url, city, phone, about_text, warranty_text,
  default_validity_days, cnpj, receiver_name, signature_url
from company_settings where id = 1;

-- profiles: company_id nullable (admin_system não pertence a empresa)
alter table profiles add column company_id uuid references companies(id);
alter table profiles add column acting_company_id uuid references companies(id);
update profiles set company_id = (select id from companies limit 1);
create index profiles_company_idx on profiles(company_id);

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin_system','admin','vendedor'));
alter table profiles add constraint profiles_admin_system_company
  check ((role = 'admin_system') = (company_id is null));

-- Demais tabelas: company_id not null + índice
alter table product_types add column company_id uuid references companies(id);
update product_types set company_id = (select id from companies limit 1);
alter table product_types alter column company_id set not null;
create index product_types_company_idx on product_types(company_id);

alter table option_groups add column company_id uuid references companies(id);
update option_groups set company_id = (select id from companies limit 1);
alter table option_groups alter column company_id set not null;
create index option_groups_company_idx on option_groups(company_id);

alter table options add column company_id uuid references companies(id);
update options set company_id = (select id from companies limit 1);
alter table options alter column company_id set not null;
create index options_company_idx on options(company_id);

alter table models add column company_id uuid references companies(id);
update models set company_id = (select id from companies limit 1);
alter table models alter column company_id set not null;
create index models_company_idx on models(company_id);

alter table payment_conditions add column company_id uuid references companies(id);
update payment_conditions set company_id = (select id from companies limit 1);
alter table payment_conditions alter column company_id set not null;
create index payment_conditions_company_idx on payment_conditions(company_id);

alter table quotes add column company_id uuid references companies(id);
update quotes set company_id = (select id from companies limit 1);
alter table quotes alter column company_id set not null;
create index quotes_company_idx on quotes(company_id);

alter table quote_items add column company_id uuid references companies(id);
update quote_items set company_id = (select id from companies limit 1);
alter table quote_items alter column company_id set not null;
create index quote_items_company_idx on quote_items(company_id);

alter table clients add column company_id uuid references companies(id);
update clients set company_id = (select id from companies limit 1);
alter table clients alter column company_id set not null;
create index clients_company_idx on clients(company_id);

alter table companies enable row level security;
```

- [ ] **Step 2: Aplicar e verificar**

Aplicar via MCP `apply_migration` (name: `multi_tenant_schema`). Depois rodar (MCP `execute_sql`):

```sql
select
  (select count(*) from companies) as companies,
  (select count(*) from quotes where company_id is null) as quotes_sem_empresa,
  (select count(*) from profiles where company_id is null) as profiles_sem_empresa;
```

Expected: `companies = 1`, demais `= 0`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0016_multi_tenant_schema.sql
git commit -m "feat(db): tabela companies e company_id em todas as tabelas com backfill"
```

---

### Task 2: Migration 0017 — helpers RLS + policies por empresa + storage

**Files:**
- Create: `supabase/migrations/0017_multi_tenant_rls.sql`

**Interfaces:**
- Consumes: schema da Task 1.
- Produces: funções SQL `current_company_id() returns uuid`, `is_admin_system() returns boolean`, `is_company_admin() returns boolean`. Todas as policies por empresa. Trigger que impede membro de alterar `companies.status`.

- [ ] **Step 1: Escrever a migration**

```sql
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
-- Antes de escrever os drops, confira os nomes reais em 0002_rls.sql e
-- 0007_profiles_read_all.sql (esta última pode ter recriado pr_read com outro corpo).
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
```

Nota: fotos antigas (paths `modelos/...`, `logo/...`) continuam legíveis (bucket é público para leitura — links de orçamento exigem isso) mas não são mais editáveis/removíveis; uploads novos vão para o prefixo da empresa. Não movemos arquivos antigos — leitura é pública por design, isolamento aqui é de escrita.

Nota 2: as policies de `company_settings` (cfg_read/cfg_write) ficam como estão — a tabela morre na Task 11.

- [ ] **Step 2: Aplicar e verificar**

Aplicar via MCP `apply_migration` (name: `multi_tenant_rls`). Verificar (MCP `execute_sql`):

```sql
select polname, polrelid::regclass::text from pg_policy
where polrelid in ('quotes'::regclass, 'companies'::regclass) order by 2, 1;
```

Expected: `q_all` em quotes; `co_sys`, `co_read_own`, `co_update_own` em companies.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0017_multi_tenant_rls.sql
git commit -m "feat(db): RLS por empresa com current_company_id e policies de storage"
```

---

### Task 3: Migration 0018 — RPCs company-aware

**Files:**
- Create: `supabase/migrations/0018_multi_tenant_rpcs.sql`

**Interfaces:**
- Consumes: helpers da Task 2.
- Produces: `save_quote_atomic`, `clone_quote`, `dashboard_metrics`, `sync_client_to_quotes` reescritas company-aware; nova `system_companies_overview() returns jsonb` (lista de empresas com contagens, só admin_system). `public.is_admin()` removida.

Base: corpos atuais em `supabase/migrations/0015_clientes.sql` (save/clone/sync) e `0006_dashboard_metrics.sql`.

- [ ] **Step 1: Escrever a migration**

```sql
-- RPCs multi-tenant. security invoker confia na RLS; security definer filtra
-- explicitamente por current_company_id().

create or replace function public.save_quote_atomic(
  p_quote_id uuid, p_quote jsonb, p_items jsonb
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_client_id uuid;
  v_company_id uuid;
begin
  -- RLS filtra: orçamento de outra empresa é invisível aqui
  select company_id into v_company_id from quotes where id = p_quote_id;
  if v_company_id is null then
    raise exception 'Orçamento não encontrado';
  end if;

  v_client_id := nullif(p_quote->>'client_id', '')::uuid;
  if v_client_id is not null
     and not exists (select 1 from clients where id = v_client_id) then
    raise exception 'Cliente inválido';
  end if;
  if v_client_id is null and trim(coalesce(p_quote->>'customer_name', '')) <> '' then
    insert into clients (name, phone, company_id)
    values (trim(p_quote->>'customer_name'), coalesce(p_quote->>'customer_phone', ''), v_company_id)
    returning id into v_client_id;
  end if;

  update quotes set
    client_id      = v_client_id,
    customer_name  = p_quote->>'customer_name',
    customer_phone = coalesce(p_quote->>'customer_phone', ''),
    site_address   = coalesce(p_quote->>'site_address', ''),
    discount       = (p_quote->>'discount')::numeric,
    subtotal       = (p_quote->>'subtotal')::numeric,
    total          = (p_quote->>'total')::numeric,
    multiplier     = coalesce((p_quote->>'multiplier')::int, 1),
    delivery_date  = nullif(p_quote->>'delivery_date', '')::date,
    updated_at     = now()
  where id = p_quote_id;

  delete from quote_items where quote_id = p_quote_id;

  insert into quote_items (quote_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price, selected_options,
    unit_total, line_total, extra_value, note, sort_order, company_id)
  select p_quote_id,
    nullif(i->>'product_type_id', '')::uuid,
    i->>'product_name',
    nullif(i->>'model_id', '')::uuid,
    i->>'model_name',
    i->>'model_photo_url',
    (i->>'width_m')::numeric,
    (i->>'height_m')::numeric,
    (i->>'area_m2')::numeric,
    (i->>'qty')::int,
    (i->>'unit_base_price')::numeric,
    coalesce(i->'selected_options', '[]'::jsonb),
    (i->>'unit_total')::numeric,
    (i->>'line_total')::numeric,
    coalesce((i->>'extra_value')::numeric, 0),
    coalesce(i->>'note', ''),
    (ord - 1)::int,
    v_company_id
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);
end;
$$;
revoke execute on function public.save_quote_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote_atomic(uuid, jsonb, jsonb) to authenticated;

create or replace function public.clone_quote(p_source_id uuid)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_new_id uuid;
  v_days int;
  v_company_id uuid;
begin
  select company_id into v_company_id from quotes where id = p_source_id;
  if v_company_id is null then
    raise exception 'Orçamento não encontrado';
  end if;

  select coalesce(default_validity_days, 15) into v_days
    from companies where id = v_company_id;

  insert into quotes (customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, status, created_by, valid_until, delivery_date,
    client_id, company_id)
  select 'Cópia de — ' || customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, 'rascunho', auth.uid(),
    (now() + make_interval(days => v_days))::date, null, client_id, company_id
  from quotes where id = p_source_id
  returning id into v_new_id;

  insert into quote_items (quote_id, product_type_id, product_name, model_id,
    model_name, model_photo_url, width_m, height_m, area_m2, qty, unit_base_price,
    selected_options, unit_total, line_total, extra_value, note, sort_order, company_id)
  select v_new_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price,
    selected_options, unit_total, line_total, extra_value, note, sort_order, company_id
  from quote_items where quote_id = p_source_id;

  return v_new_id;
end;
$$;
revoke execute on function public.clone_quote(uuid) from public, anon;
grant execute on function public.clone_quote(uuid) to authenticated;

-- Dashboard: security definer → filtro explícito por empresa obrigatório
create or replace function public.dashboard_metrics(
  p_start timestamptz default null,
  p_end timestamptz default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
  v_company uuid;
begin
  if not public.is_company_admin() then
    raise exception 'not authorized';
  end if;
  v_company := public.current_company_id();

  with periodo as (
    select q.* from quotes q
    where q.company_id = v_company
      and (p_start is null or q.created_at >= p_start)
      and (p_end is null or q.created_at < p_end)
  )
  select jsonb_build_object(
    'kpis', (
      select jsonb_build_object(
        'total_count', count(*),
        'approved_value', coalesce(sum(total) filter (where status = 'aprovado'), 0),
        'open_value', coalesce(sum(total) filter (where status = 'enviado'), 0),
        'avg_ticket', coalesce(avg(total), 0),
        'conversion_rate', coalesce(
          count(*) filter (where status = 'aprovado')::numeric
          / nullif(count(*) filter (where status in ('aprovado','recusado')), 0),
          0)
      ) from periodo
    ),
    'funnel', (
      select coalesce(jsonb_agg(
        jsonb_build_object('status', s.status, 'count', coalesce(c.cnt, 0), 'value', coalesce(c.val, 0))
        order by s.ord), '[]'::jsonb)
      from (values ('rascunho', 1), ('enviado', 2), ('aprovado', 3), ('recusado', 4)) as s(status, ord)
      left join (
        select status, count(*) as cnt, sum(total) as val from periodo group by status
      ) c on c.status = s.status
    ),
    'expiring', (
      select jsonb_build_object(
        'due_7_days', count(*) filter (where status = 'enviado' and valid_until >= current_date and valid_until <= current_date + 7),
        'overdue', count(*) filter (where status = 'enviado' and valid_until < current_date)
      ) from quotes where company_id = v_company
    ),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('month', m, 'value', v) order by m), '[]'::jsonb)
      from (
        select date_trunc('month', created_at) as m, sum(total) as v
        from periodo group by 1
      ) t
    ),
    'sellers', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'approved_value', av, 'count', cnt) order by av desc), '[]'::jsonb)
      from (
        select coalesce(p.name, 'Sem vendedor') as name,
               coalesce(sum(q.total) filter (where q.status = 'aprovado'), 0) as av,
               count(*) as cnt
        from periodo q left join profiles p on p.id = q.created_by
        group by 1
        order by av desc
        limit 10
      ) t
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object('product_name', product_name, 'times', times, 'qty', qty) order by times desc), '[]'::jsonb)
      from (
        select qi.product_name, count(*) as times, coalesce(sum(qi.qty), 0) as qty
        from quote_items qi
        join periodo q on q.id = qi.quote_id
        group by qi.product_name
        order by times desc
        limit 10
      ) t
    ),
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'customer_name', customer_name, 'total', total, 'status', status, 'created_at', created_at
      ) order by created_at desc), '[]'::jsonb)
      from (
        select id, customer_name, total, status, created_at
        from quotes where company_id = v_company
        order by created_at desc limit 8
      ) t
    )
  ) into result;

  return result;
end;
$$;
grant execute on function public.dashboard_metrics(timestamptz, timestamptz) to authenticated;

-- Trigger de sync cliente→orçamentos: security definer → restringe à empresa do cliente
create or replace function public.sync_client_to_quotes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update quotes
     set customer_name = new.name,
         customer_phone = new.phone,
         updated_at = now()
   where client_id = new.id
     and company_id = new.company_id;
  return new;
end;
$$;

-- Visão geral para /sistema/empresas (só admin_system)
create or replace function public.system_companies_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not public.is_admin_system() then
    raise exception 'not authorized';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'status', c.status, 'created_at', c.created_at,
      'accent_color', c.accent_color,
      'users', (select count(*) from profiles p where p.company_id = c.id),
      'quotes', (select count(*) from quotes q where q.company_id = c.id)
    ) order by c.created_at), '[]'::jsonb)
  into result
  from companies c;
  return result;
end;
$$;
revoke execute on function public.system_companies_overview() from public, anon;
grant execute on function public.system_companies_overview() to authenticated;

-- is_admin() single-tenant morre; is_company_admin() é o substituto
drop function public.is_admin();
```

- [ ] **Step 2: Aplicar**

MCP `apply_migration` (name: `multi_tenant_rpcs`). Verificar que aplicou sem erro e que `select public.is_admin()` agora falha com "function does not exist" (MCP `execute_sql`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0018_multi_tenant_rpcs.sql
git commit -m "feat(db): RPCs company-aware e system_companies_overview"
```

---

### Task 4: Teste de isolamento SQL + script admin_system

**Files:**
- Create: `scripts/test-isolation.sql`
- Create: `scripts/create-admin-system.mjs`

**Interfaces:**
- Consumes: Tasks 1-3 aplicadas.
- Produces: script de verificação de isolamento (roda e faz rollback); script que cria o usuário admin_system.

- [ ] **Step 1: Escrever `scripts/create-admin-system.mjs`** (espelha `scripts/create-admin.mjs`)

```js
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const [email, password, ...nameParts] = process.argv.slice(2)
const name = nameParts.join(' ')
if (!email || !password || !name) {
  console.error('Uso: node scripts/create-admin-system.mjs <email> <senha> <nome>')
  process.exit(1)
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
if (error) { console.error(error.message); process.exit(1) }
const { error: pErr } = await supabase.from('profiles')
  .insert({ id: data.user.id, email, name, role: 'admin_system', company_id: null })
if (pErr) { console.error(pErr.message); process.exit(1) }
console.log('admin_system criado:', email)
```

- [ ] **Step 2: Escrever `scripts/test-isolation.sql`**

Simula dois usuários de empresas diferentes via `request.jwt.claims` e confirma zero vazamento. Roda inteiro numa transação com rollback — não deixa rastro.

```sql
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
```

- [ ] **Step 3: Rodar o teste**

Executar o conteúdo via MCP `execute_sql` (ou `psql $DATABASE_URL -f scripts/test-isolation.sql`).
Expected: `ISOLAMENTO OK` sem exceções.

- [ ] **Step 4: Criar o admin_system real**

```bash
node scripts/create-admin-system.mjs <email-do-dono> <senha> "Nome"
```

Expected: `admin_system criado: <email>`.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-isolation.sql scripts/create-admin-system.mjs
git commit -m "feat(scripts): teste de isolamento multi-tenant e criação de admin_system"
```

---

### Task 5: Helper de cor (luminância) — TDD

**Files:**
- Create: `src/lib/color.ts`
- Test: `src/lib/color.test.ts`

**Interfaces:**
- Produces: `readableTextColor(hex: string): '#ffffff' | '#111111'` e `isValidHexColor(v: string): boolean`. Usados nas Tasks 7, 9 e 10.

- [ ] **Step 1: Escrever teste que falha**

```ts
import { describe, expect, it } from 'vitest'
import { isValidHexColor, readableTextColor } from './color'

describe('readableTextColor', () => {
  it('fundo escuro pede texto branco', () => {
    expect(readableTextColor('#006688')).toBe('#ffffff')
    expect(readableTextColor('#000000')).toBe('#ffffff')
    expect(readableTextColor('#7f1d1d')).toBe('#ffffff')
  })
  it('fundo claro pede texto escuro', () => {
    expect(readableTextColor('#ffffff')).toBe('#111111')
    expect(readableTextColor('#fde047')).toBe('#111111')
    expect(readableTextColor('#a7f3d0')).toBe('#111111')
  })
  it('entrada inválida cai no branco (cor default é escura)', () => {
    expect(readableTextColor('banana')).toBe('#ffffff')
  })
})

describe('isValidHexColor', () => {
  it('aceita #rrggbb minúsculo', () => {
    expect(isValidHexColor('#006688')).toBe(true)
    expect(isValidHexColor('#abcdef')).toBe(true)
  })
  it('recusa formatos errados', () => {
    expect(isValidHexColor('006688')).toBe(false)
    expect(isValidHexColor('#FFF')).toBe(false)
    expect(isValidHexColor('#GGHHII')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/color.test.ts`
Expected: FAIL — módulo `./color` não existe.

- [ ] **Step 3: Implementar**

```ts
// Cor de texto legível sobre uma cor de fundo, por luminância relativa (WCAG).
const HEX_RE = /^#[0-9a-f]{6}$/

export function isValidHexColor(v: string): boolean {
  return HEX_RE.test(v)
}

export function readableTextColor(hex: string): '#ffffff' | '#111111' {
  if (!HEX_RE.test(hex)) return '#ffffff'
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return luminance > 0.4 ? '#111111' : '#ffffff'
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/color.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/color.ts src/lib/color.test.ts
git commit -m "feat(lib): readableTextColor por luminância para cor destaque"
```

---

### Task 6: Tipos e helpers de tenant (auth.ts + tenant.ts) — TDD

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/lib/tenant.ts`
- Test: `src/lib/tenant.test.ts`

**Interfaces:**
- Consumes: schema Tasks 1-2.
- Produces:
  - `Profile` (auth.ts): ganha `role: 'admin_system' | 'admin' | 'vendedor'`, `company_id: string | null`, `acting_company_id: string | null`.
  - `Company` (tenant.ts): `{ id, name, status: 'ativa'|'suspensa', logo_url, city, phone, about_text, warranty_text, default_validity_days, cnpj, receiver_name, signature_url, accent_color }`.
  - `effectiveCompanyId(profile: Pick<Profile,'role'|'company_id'|'acting_company_id'>): string | null` (puro).
  - `resolveAccess(profile, company: Company | null): 'ok' | 'sistema' | 'suspensa'` (puro).
  - `getCompany()` (auth.ts): `Promise<{ user, profile, supabase, company: Company | null }>` — busca a empresa efetiva.

- [ ] **Step 1: Escrever `src/lib/tenant.test.ts` (falha)**

```ts
import { describe, expect, it } from 'vitest'
import { effectiveCompanyId, resolveAccess, type Company } from './tenant'

const company = (status: Company['status']): Company => ({
  id: 'c1', name: 'ACME', status, logo_url: null, city: '', phone: '',
  about_text: '', warranty_text: '', default_validity_days: 15,
  cnpj: '', receiver_name: '', signature_url: null, accent_color: '#006688',
  business_area: 'Serralheria',
})

describe('effectiveCompanyId', () => {
  it('membro comum usa a própria empresa', () => {
    expect(effectiveCompanyId({ role: 'vendedor', company_id: 'c1', acting_company_id: null })).toBe('c1')
    expect(effectiveCompanyId({ role: 'admin', company_id: 'c1', acting_company_id: null })).toBe('c1')
  })
  it('admin_system usa a empresa em atuação', () => {
    expect(effectiveCompanyId({ role: 'admin_system', company_id: null, acting_company_id: 'c2' })).toBe('c2')
  })
  it('admin_system sem seleção não tem empresa', () => {
    expect(effectiveCompanyId({ role: 'admin_system', company_id: null, acting_company_id: null })).toBeNull()
  })
})

describe('resolveAccess', () => {
  it('membro de empresa ativa acessa o app', () => {
    expect(resolveAccess({ role: 'admin', company_id: 'c1', acting_company_id: null }, company('ativa'))).toBe('ok')
  })
  it('membro de empresa suspensa é bloqueado', () => {
    expect(resolveAccess({ role: 'vendedor', company_id: 'c1', acting_company_id: null }, company('suspensa'))).toBe('suspensa')
  })
  it('admin_system sem empresa vai para /sistema', () => {
    expect(resolveAccess({ role: 'admin_system', company_id: null, acting_company_id: null }, null)).toBe('sistema')
  })
  it('admin_system atuando acessa o app mesmo com empresa suspensa', () => {
    expect(resolveAccess({ role: 'admin_system', company_id: null, acting_company_id: 'c1' }, company('suspensa'))).toBe('ok')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/tenant.test.ts`
Expected: FAIL — `./tenant` não existe.

- [ ] **Step 3: Implementar `src/lib/tenant.ts`**

```ts
export interface Company {
  id: string
  name: string
  status: 'ativa' | 'suspensa'
  logo_url: string | null
  city: string
  phone: string
  about_text: string
  warranty_text: string
  default_validity_days: number
  cnpj: string
  receiver_name: string
  signature_url: string | null
  accent_color: string
  business_area: string
}

interface TenantProfile {
  role: 'admin_system' | 'admin' | 'vendedor'
  company_id: string | null
  acting_company_id: string | null
}

export function effectiveCompanyId(p: TenantProfile): string | null {
  return p.role === 'admin_system' ? p.acting_company_id : p.company_id
}

export function resolveAccess(p: TenantProfile, company: Company | null): 'ok' | 'sistema' | 'suspensa' {
  if (p.role === 'admin_system') return effectiveCompanyId(p) ? 'ok' : 'sistema'
  if (!company || company.status === 'suspensa') return 'suspensa'
  return 'ok'
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/tenant.test.ts`
Expected: PASS.

- [ ] **Step 5: Atualizar `src/lib/auth.ts`**

```ts
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { effectiveCompanyId, type Company } from '@/lib/tenant'

export interface Profile {
  id: string; email: string; name: string
  role: 'admin_system' | 'admin' | 'vendedor'
  active: boolean
  company_id: string | null
  acting_company_id: string | null
}

export async function getProfile() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !profile.active) redirect('/login')
  return { user, profile: profile as Profile, supabase }
}

// Perfil + empresa efetiva (a do usuário, ou a selecionada pelo admin_system)
export async function getCompany() {
  const { user, profile, supabase } = await getProfile()
  const companyId = effectiveCompanyId(profile)
  if (!companyId) return { user, profile, supabase, company: null as Company | null }
  const { data } = await supabase.from('companies').select('*').eq('id', companyId).single()
  return { user, profile, supabase, company: (data ?? null) as Company | null }
}
```

- [ ] **Step 6: Verificar tipos e testes**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros de tipo novos além dos que as próximas tasks resolvem (se `npx tsc --noEmit` acusar usos de `Profile['role']` em `navFor`, anote — Task 7 corrige). Testes PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/lib/tenant.ts src/lib/tenant.test.ts
git commit -m "feat(lib): tipos multi-tenant, effectiveCompanyId e resolveAccess"
```

---

### Task 7: Layout do app — guards, cor destaque e banner de suporte

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/layout.tsx` (título genérico)
- Modify: `src/lib/nav/items.ts`
- Modify: `src/components/nav/app-shell.tsx`
- Modify: `src/components/nav/sidebar.tsx` (label dinâmico)
- Create: `src/components/nav/support-banner.tsx`
- Create: `src/components/nav/suspended-notice.tsx`
- Create: `src/app/(app)/support-actions.ts` (server action `exitSupport`)

**Interfaces:**
- Consumes: `getCompany()`, `resolveAccess()`, `readableTextColor()` (Tasks 5-6).
- Produces: app inteiro tematizado pela `accent_color` da empresa efetiva; label da sidebar e título das páginas internas usam `company.business_area`; admin_system sem empresa → redirect `/sistema/empresas`; membro de empresa suspensa → aviso; banner fixo em modo suporte. `navFor(role: Profile['role'])` aceita `admin_system`.

- [ ] **Step 1: `src/lib/nav/items.ts` — navFor com admin_system**

```ts
export interface NavItem {
  label: string
  href: string
  icon: string
  adminOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: 'dashboard', adminOnly: true },
  { label: 'Orçamentos', href: '/', icon: 'description' },
  { label: 'Produção', href: '/producao', icon: 'precision_manufacturing' },
  { label: 'Clientes', href: '/clientes', icon: 'contacts' },
  { label: 'Produtos', href: '/admin/produtos', icon: 'inventory_2', adminOnly: true },
  { label: 'Pagamento', href: '/admin/pagamento', icon: 'payments', adminOnly: true },
  { label: 'Empresa', href: '/admin/empresa', icon: 'apartment', adminOnly: true },
  { label: 'Usuários', href: '/admin/usuarios', icon: 'group', adminOnly: true },
]

export function navFor(role: 'admin_system' | 'admin' | 'vendedor'): NavItem[] {
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || role !== 'vendedor')
  if (role === 'admin_system') {
    return [...items, { label: 'Sistema', href: '/sistema/empresas', icon: 'admin_panel_settings' }]
  }
  return items
}
```

- [ ] **Step 2: `src/app/(app)/support-actions.ts`**

```ts
'use server'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function exitSupport() {
  const { profile } = await getProfile()
  if (profile.role !== 'admin_system') throw new Error('Apenas admin_system')
  const admin = createAdminClient()
  const { error } = await admin.from('profiles')
    .update({ acting_company_id: null }).eq('id', profile.id)
  if (error) throw new Error(error.message)
  redirect('/sistema/empresas')
}
```

- [ ] **Step 3: `src/components/nav/support-banner.tsx`**

```tsx
import { exitSupport } from '@/app/(app)/support-actions'

export function SupportBanner({ companyName }: { companyName: string }) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-2 bg-amber-500 px-4 py-1.5 text-sm font-medium text-black">
      <span>🔧 Suporte: {companyName}</span>
      <form action={exitSupport}>
        <button type="submit" className="rounded bg-black/10 px-2 py-0.5 underline">Sair</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: `src/components/nav/suspended-notice.tsx`**

```tsx
export function SuspendedNotice({ companyName }: { companyName: string | null }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-3 text-center">
        <p className="text-4xl">⏸️</p>
        <h1 className="text-xl font-semibold">
          {companyName ? `${companyName} está suspensa` : 'Empresa suspensa'}
        </h1>
        <p className="text-muted-foreground">
          O acesso ao sistema está temporariamente suspenso. Entre em contato com o suporte da plataforma.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: `src/app/(app)/layout.tsx` — guards + CSS vars + título dinâmico**

```tsx
import { redirect } from 'next/navigation'
import { getCompany } from '@/lib/auth'
import { resolveAccess } from '@/lib/tenant'
import { readableTextColor } from '@/lib/color'
import { AppShell } from '@/components/nav/app-shell'
import { SuspendedNotice } from '@/components/nav/suspended-notice'

export async function generateMetadata() {
  const { company } = await getCompany()
  return { title: company ? `Orçamentos — ${company.business_area}` : 'Orçamentos' }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, company } = await getCompany()
  const access = resolveAccess(profile, company)
  if (access === 'sistema') redirect('/sistema/empresas')
  if (access === 'suspensa') return <SuspendedNotice companyName={company?.name ?? null} />

  const accent = company!.accent_color
  const onAccent = readableTextColor(accent)
  const vars = {
    '--primary': accent,
    '--sidebar-primary': accent,
    '--on-primary': onAccent,
    '--primary-foreground': onAccent,
  } as React.CSSProperties

  return (
    <div style={vars}>
      <AppShell profile={profile} company={company!}>{children}</AppShell>
    </div>
  )
}
```

- [ ] **Step 6: `src/components/nav/app-shell.tsx` — banner de suporte**

```tsx
import { navFor } from '@/lib/nav/items'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'
import { MobileNav } from './mobile-nav'
import { SupportBanner } from './support-banner'
import type { Profile } from '@/lib/auth'
import type { Company } from '@/lib/tenant'

export function AppShell({
  profile,
  company,
  children,
}: {
  profile: Profile
  company: Company
  children: React.ReactNode
}) {
  const items = navFor(profile.role)
  return (
    <div className="min-h-dvh bg-background">
      {profile.role === 'admin_system' && <SupportBanner companyName={company.name} />}
      <Sidebar items={items} businessArea={company.business_area} />
      <TopBar name={profile.name} />
      <main className="p-4 pb-24 md:ml-[260px] md:p-6 md:pb-6">
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>
      <MobileNav items={items} />
    </div>
  )
}
```

- [ ] **Step 6b: Label dinâmico na sidebar e título genérico no root**

Em `src/components/nav/sidebar.tsx`: adicionar prop `businessArea: string` à assinatura e trocar o texto fixo da linha 16 (`<p className="label-caps ...">Serralheria</p>`) por `{businessArea}`.

Em `src/app/layout.tsx`: trocar `title: "Orçamentos — Serralheria"` por `title: "Orçamentos"` (o título específico vem do `generateMetadata` do layout `(app)`).

- [ ] **Step 7: Verificar**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: build passa. (`/sistema/empresas` ainda não existe — redirect 404 em runtime é aceitável até a Task 10.)

- [ ] **Step 8: Commit**

```bash
git add src/app/"(app)"/layout.tsx src/app/"(app)"/support-actions.ts src/lib/nav/items.ts src/components/nav/
git commit -m "feat(app): guards multi-tenant, cor destaque no tema e banner de suporte"
```

---

### Task 8: Código existente company-aware (empresa, orçamentos, apresentação, recibo, uploads)

**Files:**
- Modify: `src/app/(app)/admin/empresa/page.tsx` e `actions.ts` (+ form: campo cor)
- Modify: `src/app/(app)/orcamentos/actions.ts`
- Modify: `src/app/(app)/orcamentos/[id]/apresentacao/page.tsx`
- Modify: `src/app/(app)/orcamentos/[id]/recibo/page.tsx`
- Modify: `src/app/(app)/admin/usuarios/actions.ts`
- Modify: callers de `PhotoUpload` (achar com `grep -rn "PhotoUpload" src/`)

**Interfaces:**
- Consumes: `getCompany()`, `effectiveCompanyId()`, `Company`, `isValidHexColor()`.
- Produces: zero leituras de `company_settings` em `src/` (pré-requisito da Task 11).

- [ ] **Step 1: `admin/empresa/actions.ts` — atualizar a linha da empresa em `companies`**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getCompany } from '@/lib/auth'
import { isValidHexColor } from '@/lib/color'

export async function saveCompany(formData: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const accent = String(formData.get('accent_color') ?? '').toLowerCase()
  if (!isValidHexColor(accent)) throw new Error('Cor inválida')
  const { error } = await supabase.from('companies').update({
    name: String(formData.get('name') ?? ''),
    cnpj: String(formData.get('cnpj') ?? ''),
    receiver_name: String(formData.get('receiver_name') ?? ''),
    city: String(formData.get('city') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    about_text: String(formData.get('about_text') ?? ''),
    warranty_text: String(formData.get('warranty_text') ?? ''),
    default_validity_days: Number(formData.get('default_validity_days') ?? 15),
    logo_url: String(formData.get('logo_url') ?? '') || null,
    signature_url: String(formData.get('signature_url') ?? '') || null,
    accent_color: accent,
    business_area: String(formData.get('business_area') ?? '').trim() || 'Serralheria',
  }).eq('id', company.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/empresa')
  revalidatePath('/', 'layout')
}
```

- [ ] **Step 2: `admin/empresa/page.tsx`**

Trocar `supabase.from('company_settings').select('*').eq('id', 1).single()` por leitura via `getCompany()` (usar `company` direto). No form da página, adicionar o campo de cor junto aos existentes (mesmo padrão visual dos outros campos):

```tsx
<label className="block space-y-1">
  <span className="text-sm font-medium">Cor destaque</span>
  <input type="color" name="accent_color" defaultValue={company.accent_color}
    className="h-10 w-20 cursor-pointer rounded border" />
  <span className="block text-xs text-muted-foreground">
    Cor principal do sistema, do orçamento e do recibo desta empresa.
  </span>
</label>
```

Adicionar também o campo de área de atuação (texto que aparece na sidebar e no título das páginas):

```tsx
<label className="block space-y-1">
  <span className="text-sm font-medium">Área de atuação</span>
  <input name="business_area" defaultValue={company.business_area} required
    placeholder="Ex.: Serralheria, Vidraçaria" className="w-full rounded border px-3 py-2" />
</label>
```

Se a página passa dados ao form via props, propagar `accent_color` e `business_area` do mesmo jeito que os demais campos.

- [ ] **Step 3: `orcamentos/actions.ts` — validade default + company_id no insert**

Na criação de orçamento (bloco `if (!quoteId)`), substituir a leitura de `company_settings` e incluir `company_id`:

```ts
// antes do if (!quoteId), no topo da action, trocar getProfile() por:
const { user, profile, supabase, company } = await getCompany()
if (!company) throw new Error('Sem empresa ativa')

// dentro do if (!quoteId):
const days = company.default_validity_days ?? 15
const validUntil = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
const { data, error } = await supabase.from('quotes')
  .insert({ ...quoteRow, created_by: user.id, valid_until: validUntil, company_id: company.id })
  .select('id').single()
```

Manter o resto intacto (RPC `save_quote_atomic` já é company-aware). Se a action usava `getProfile()`, ajustar o destructuring; conferir que `user` continua disponível.

- [ ] **Step 4: `apresentacao/page.tsx` e `recibo/page.tsx`**

Nos dois arquivos, trocar `supabase.from('company_settings').select('*').eq('id', 1).single()` por:

```ts
supabase.from('companies').select('*').eq('id', quote.company_id).single()
```

Atenção: hoje as páginas buscam quote e settings em `Promise.all`. Reordenar: buscar `quote` primeiro (precisa de `company_id`), depois `companies` + demais em `Promise.all`. Tipagem: o shape de `Company` é superset do antigo `company_settings` — componentes `QuotePresentation`/recibo continuam funcionando; ajustar imports de tipo se houver.

- [ ] **Step 5: `admin/usuarios/actions.ts` — novo usuário herda a empresa efetiva**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { effectiveCompanyId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const { profile } = await getProfile()
  const companyId = effectiveCompanyId(profile)
  if (profile.role === 'vendedor' || !companyId) throw new Error('Apenas admin')
  return { profile, companyId }
}

export async function createUser(fd: FormData) {
  const { companyId } = await requireAdmin()
  const email = String(fd.get('email') ?? '').trim()
  const password = String(fd.get('password') ?? '')
  const name = String(fd.get('name') ?? '').trim()
  const role = String(fd.get('role')) === 'admin' ? 'admin' : 'vendedor'
  if (!email || password.length < 8 || !name) throw new Error('Dados inválidos (senha mínima: 8 caracteres)')
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(error.message)
  const { error: pErr } = await admin.from('profiles')
    .insert({ id: data.user.id, email, name, role, company_id: companyId })
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id) // rollback: sem profile órfão
    throw new Error(pErr.message)
  }
  revalidatePath('/admin/usuarios')
}

export async function updateUser(fd: FormData) {
  const { companyId } = await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({
    role: String(fd.get('role')) === 'admin' ? 'admin' : 'vendedor',
    active: fd.get('active') === 'on',
  }).eq('id', String(fd.get('id'))).eq('company_id', companyId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/usuarios')
}
```

Nota: `.eq('company_id', companyId)` no update é obrigatório — a action usa service role (bypassa RLS); sem o filtro, um admin poderia editar profile de outra empresa por id.

Conferir também `admin/usuarios/page.tsx`: a listagem usa o client normal (RLS já filtra por empresa) — sem mudança, mas verificar que não usa `is_admin()`.

- [ ] **Step 6: Uploads com prefixo da empresa**

`grep -rn "PhotoUpload" src/ --include="*.tsx"` — em cada caller, prefixar o `folder` com o id da empresa efetiva (a página server passa o id): ex. `folder={`${companyId}/modelos`}` e `folder={`${companyId}/logo`}`. `PhotoUpload` em si não muda.

- [ ] **Step 7: Verificar que company_settings sumiu do código**

Run: `grep -rn "company_settings" src/`
Expected: nenhum resultado.

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src/
git commit -m "feat(app): fluxos existentes company-aware e campo de cor destaque"
```

---

### Task 9: Página pública /o/[token] company-aware + cor

**Files:**
- Modify: `src/app/o/[token]/page.tsx`

**Interfaces:**
- Consumes: `readableTextColor()`; `quotes.company_id` (Task 1).
- Produces: página pública com branding e cor da empresa dona do orçamento. Funciona mesmo com empresa suspensa (link já enviado não quebra).

- [ ] **Step 1: Reescrever a busca de dados**

```tsx
export default async function OrcamentoPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[a-f0-9]{32}$/.test(token)) notFound()
  const admin = createAdminClient()
  const { data: quote } = await admin.from('quotes')
    .select('*, quote_items(*), creator:created_by(name)').eq('token', token).single()
  if (!quote) notFound()
  const [{ data: company }, { data: conds }] = await Promise.all([
    admin.from('companies').select('*').eq('id', quote.company_id).single(),
    admin.from('payment_conditions').select('*').eq('company_id', quote.company_id),
  ])
  const conditions = applicableConditions(conds ?? [], Number(quote.total))
  const items = [...quote.quote_items].sort((a, b) => a.sort_order - b.sort_order)
  const accent = company?.accent_color ?? '#006688'
  const vars = {
    '--primary': accent,
    '--on-primary': readableTextColor(accent),
    '--primary-foreground': readableTextColor(accent),
  } as React.CSSProperties
  return (
    <main className="min-h-dvh bg-background" style={vars}>
      <QuotePresentation company={company} quote={quote} items={items} conditions={conditions} internal={false} />
      <div className="mx-auto max-w-2xl p-4">
        <PrintButton />
      </div>
    </main>
  )
}
```

Adicionar import `readableTextColor` de `@/lib/color`. `generateMetadata` não muda.

- [ ] **Step 2: Verificar**

Run: `npm run build`
Expected: PASS. Abrir um link `/o/<token>` existente no preview e conferir branding correto.

- [ ] **Step 3: Commit**

```bash
git add "src/app/o/[token]/page.tsx"
git commit -m "feat(publico): orçamento público usa branding e cor da empresa dona"
```

---

### Task 10: Área /sistema (lista, criar, editar, suspender, suporte)

**Files:**
- Create: `src/app/sistema/layout.tsx`
- Create: `src/app/sistema/empresas/page.tsx`
- Create: `src/app/sistema/empresas/actions.ts`
- Create: `src/app/sistema/empresas/nova/page.tsx`
- Create: `src/app/sistema/empresas/[id]/page.tsx`

**Interfaces:**
- Consumes: `system_companies_overview()` (Task 3), `getProfile()`, `createAdminClient()`, `isValidHexColor()`, `exitSupport` (Task 7).
- Produces: CRUD de empresas + entrar/sair de suporte. `enterSupport(companyId: string)`, `createCompany(fd: FormData)`, `updateCompany(fd: FormData)`, `setCompanyStatus(fd: FormData)`.

- [ ] **Step 1: `src/app/sistema/layout.tsx` — guard**

```tsx
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'

export default async function SistemaLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getProfile()
  if (profile.role !== 'admin_system') redirect('/')
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b px-4 py-3">
        <div className="mx-auto flex max-w-[960px] items-center justify-between">
          <h1 className="font-semibold">Administração do sistema</h1>
          <span className="text-sm text-muted-foreground">{profile.name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-[960px] p-4 md:p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: `src/app/sistema/empresas/actions.ts`**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { isValidHexColor } from '@/lib/color'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdminSystem() {
  const { profile } = await getProfile()
  if (profile.role !== 'admin_system') throw new Error('Apenas admin_system')
  return profile
}

export async function createCompany(fd: FormData) {
  await requireAdminSystem()
  const name = String(fd.get('name') ?? '').trim()
  const accent = String(fd.get('accent_color') ?? '#006688').toLowerCase()
  const adminName = String(fd.get('admin_name') ?? '').trim()
  const adminEmail = String(fd.get('admin_email') ?? '').trim()
  const adminPassword = String(fd.get('admin_password') ?? '')
  if (!name || !adminName || !adminEmail || adminPassword.length < 8)
    throw new Error('Dados inválidos (senha mínima: 8 caracteres)')
  if (!isValidHexColor(accent)) throw new Error('Cor inválida')

  const admin = createAdminClient()
  const { data: company, error: cErr } = await admin.from('companies')
    .insert({
      name,
      city: String(fd.get('city') ?? ''),
      phone: String(fd.get('phone') ?? ''),
      accent_color: accent,
      business_area: String(fd.get('business_area') ?? '').trim() || 'Serralheria',
    })
    .select('id').single()
  if (cErr) throw new Error(cErr.message)

  const { data: userData, error: uErr } = await admin.auth.admin
    .createUser({ email: adminEmail, password: adminPassword, email_confirm: true })
  if (uErr) {
    await admin.from('companies').delete().eq('id', company.id) // rollback
    throw new Error(uErr.message)
  }
  const { error: pErr } = await admin.from('profiles').insert({
    id: userData.user.id, email: adminEmail, name: adminName,
    role: 'admin', company_id: company.id,
  })
  if (pErr) {
    await admin.auth.admin.deleteUser(userData.user.id) // rollback
    await admin.from('companies').delete().eq('id', company.id)
    throw new Error(pErr.message)
  }
  revalidatePath('/sistema/empresas')
  redirect('/sistema/empresas')
}

export async function updateCompany(fd: FormData) {
  await requireAdminSystem()
  const id = String(fd.get('id'))
  const accent = String(fd.get('accent_color') ?? '').toLowerCase()
  if (!isValidHexColor(accent)) throw new Error('Cor inválida')
  const admin = createAdminClient()
  const { error } = await admin.from('companies').update({
    name: String(fd.get('name') ?? ''),
    city: String(fd.get('city') ?? ''),
    phone: String(fd.get('phone') ?? ''),
    accent_color: accent,
    business_area: String(fd.get('business_area') ?? '').trim() || 'Serralheria',
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/sistema/empresas')
  revalidatePath(`/sistema/empresas/${id}`)
}

export async function setCompanyStatus(fd: FormData) {
  await requireAdminSystem()
  const id = String(fd.get('id'))
  const status = String(fd.get('status')) === 'suspensa' ? 'suspensa' : 'ativa'
  const admin = createAdminClient()
  const { error } = await admin.from('companies').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/sistema/empresas')
}

export async function enterSupport(fd: FormData) {
  const profile = await requireAdminSystem()
  const companyId = String(fd.get('company_id'))
  const admin = createAdminClient()
  const { data: company } = await admin.from('companies').select('id').eq('id', companyId).single()
  if (!company) throw new Error('Empresa não encontrada')
  const { error } = await admin.from('profiles')
    .update({ acting_company_id: companyId }).eq('id', profile.id)
  if (error) throw new Error(error.message)
  redirect('/')
}
```

- [ ] **Step 3: `src/app/sistema/empresas/page.tsx`**

```tsx
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { enterSupport, setCompanyStatus } from './actions'

interface Row {
  id: string; name: string; status: 'ativa' | 'suspensa'
  created_at: string; accent_color: string; users: number; quotes: number
}

export default async function EmpresasPage() {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('system_companies_overview')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Row[]
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Empresas</h2>
        <Link href="/sistema/empresas/nova" className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          Nova empresa
        </Link>
      </div>
      <ul className="divide-y rounded border">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
            <span className="size-3 rounded-full" style={{ background: c.accent_color }} />
            <Link href={`/sistema/empresas/${c.id}`} className="font-medium underline">{c.name}</Link>
            <span className={c.status === 'ativa' ? 'text-xs text-green-700' : 'text-xs text-red-600'}>
              {c.status}
            </span>
            <span className="text-xs text-muted-foreground">
              {c.users} usuário(s) · {c.quotes} orçamento(s)
            </span>
            <span className="ml-auto flex gap-2">
              <form action={enterSupport}>
                <input type="hidden" name="company_id" value={c.id} />
                <button className="rounded border px-2 py-1 text-xs">Entrar como suporte</button>
              </form>
              <form action={setCompanyStatus}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="status" value={c.status === 'ativa' ? 'suspensa' : 'ativa'} />
                <button className="rounded border px-2 py-1 text-xs">
                  {c.status === 'ativa' ? 'Suspender' : 'Reativar'}
                </button>
              </form>
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhuma empresa.</li>}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: `src/app/sistema/empresas/nova/page.tsx`**

```tsx
import { createCompany } from '../actions'

export default function NovaEmpresaPage() {
  return (
    <form action={createCompany} className="max-w-md space-y-3">
      <h2 className="text-lg font-semibold">Nova empresa</h2>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Nome da empresa</span>
        <input name="name" required className="w-full rounded border px-3 py-2" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Cidade</span>
        <input name="city" className="w-full rounded border px-3 py-2" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Telefone</span>
        <input name="phone" className="w-full rounded border px-3 py-2" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Área de atuação</span>
        <input name="business_area" required placeholder="Ex.: Serralheria, Vidraçaria" className="w-full rounded border px-3 py-2" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Cor destaque</span>
        <input type="color" name="accent_color" defaultValue="#006688" className="h-10 w-20 cursor-pointer rounded border" />
      </label>
      <fieldset className="space-y-3 rounded border p-3">
        <legend className="px-1 text-sm font-medium">Primeiro admin da empresa</legend>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Nome</span>
          <input name="admin_name" required className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input name="admin_email" type="email" required className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Senha (mín. 8)</span>
          <input name="admin_password" type="password" required minLength={8} className="w-full rounded border px-3 py-2" />
        </label>
      </fieldset>
      <button className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Criar empresa</button>
    </form>
  )
}
```

- [ ] **Step 5: `src/app/sistema/empresas/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { updateCompany } from '../actions'
import type { Company } from '@/lib/tenant'

export default async function EmpresaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const [{ data: company }, { data: users }] = await Promise.all([
    supabase.from('companies').select('*').eq('id', id).single(),
    supabase.from('profiles').select('id, name, email, role, active').eq('company_id', id).order('name'),
  ])
  if (!company) notFound()
  const c = company as Company
  return (
    <div className="space-y-6">
      <form action={updateCompany} className="max-w-md space-y-3">
        <h2 className="text-lg font-semibold">{c.name}</h2>
        <input type="hidden" name="id" value={c.id} />
        <label className="block space-y-1">
          <span className="text-sm font-medium">Nome</span>
          <input name="name" defaultValue={c.name} required className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Cidade</span>
          <input name="city" defaultValue={c.city} className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Telefone</span>
          <input name="phone" defaultValue={c.phone} className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Área de atuação</span>
          <input name="business_area" defaultValue={c.business_area} required className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Cor destaque</span>
          <input type="color" name="accent_color" defaultValue={c.accent_color} className="h-10 w-20 cursor-pointer rounded border" />
        </label>
        <button className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Salvar</button>
      </form>
      <section className="space-y-2">
        <h3 className="font-medium">Usuários</h3>
        <ul className="divide-y rounded border text-sm">
          {(users ?? []).map((u) => (
            <li key={u.id} className="flex items-center gap-2 p-2">
              <span>{u.name}</span>
              <span className="text-muted-foreground">{u.email}</span>
              <span className="ml-auto text-xs">{u.role}{u.active ? '' : ' · inativo'}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

Nota: leituras usam o client normal — policies `co_sys`/`pr_read` já dão acesso total ao admin_system.

- [ ] **Step 6: Verificar fluxo completo no preview**

Run: `npx tsc --noEmit && npm test && npm run build`, depois subir o dev server (preview) e, logado como admin_system:
1. `/sistema/empresas` lista empresa #1.
2. Criar empresa nova com admin próprio. Expected: aparece na lista.
3. "Entrar como suporte" → app abre com banner amarelo e dados da empresa (vazia para empresa nova).
4. "Sair" → volta a `/sistema/empresas`.
5. Suspender empresa → logar como usuário dela → tela "suspensa". Reativar → acesso volta.
6. Logar como usuário da empresa #1 → dados antigos intactos, cor default aplicada.

- [ ] **Step 7: Commit**

```bash
git add src/app/sistema/
git commit -m "feat(sistema): área do admin_system com CRUD de empresas e modo suporte"
```

---

### Task 11: Migration final — remover company_settings + verificação completa

**Files:**
- Create: `supabase/migrations/0019_drop_company_settings.sql`

**Interfaces:**
- Consumes: Tasks 8-9 (zero referências a `company_settings` no código).

- [ ] **Step 1: Confirmar pré-requisito**

Run: `grep -rn "company_settings" src/`
Expected: nenhum resultado. Se houver, voltar à Task 8.

- [ ] **Step 2: Escrever e aplicar a migration**

```sql
-- company_settings (singleton single-tenant) foi absorvida por companies.
drop policy cfg_read on company_settings;
drop policy cfg_write on company_settings;
drop table company_settings;
```

MCP `apply_migration` (name: `drop_company_settings`).

- [ ] **Step 3: Verificação final**

1. `npm test && npx tsc --noEmit && npm run build` — Expected: PASS.
2. Re-rodar `scripts/test-isolation.sql` — Expected: `ISOLAMENTO OK`.
3. No preview, smoke test como admin da empresa #1: criar orçamento, abrir link público, gerar recibo, dashboard, editar cor da empresa e ver o tema mudar.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0019_drop_company_settings.sql
git commit -m "feat(db): remove company_settings, absorvida por companies"
```
