-- Templates de grupos de opções (biblioteca por empresa)
create table option_group_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  required boolean not null default false,
  created_at timestamptz not null default now()
);
create index option_group_templates_company_idx on option_group_templates(company_id);

create table option_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references option_group_templates(id) on delete cascade,
  company_id uuid not null references companies(id),
  label text not null,
  surcharge_type text not null default 'fixo' check (surcharge_type in ('fixo','por_m2')),
  surcharge_value numeric not null default 0,
  sort_order int not null default 0
);
create index option_templates_company_idx on option_templates(company_id);
create index option_templates_template_idx on option_templates(template_id);

alter table option_group_templates enable row level security;
alter table option_templates enable row level security;

create policy ogt_read on option_group_templates for select to authenticated
  using (company_id = current_company_id());
create policy ogt_write on option_group_templates for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

create policy ot_read on option_templates for select to authenticated
  using (company_id = current_company_id());
create policy ot_write on option_templates for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());
