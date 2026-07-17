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
