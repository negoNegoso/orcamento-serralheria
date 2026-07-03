create table company_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'Minha Serralheria',
  logo_url text,
  city text not null default '',
  phone text not null default '',
  about_text text not null default '',
  warranty_text text not null default '',
  default_validity_days int not null default 15
);
insert into company_settings (id) values (1);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  name text not null,
  role text not null default 'vendedor' check (role in ('admin','vendedor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- manual = sob consulta: vendedor digita o valor combinado no item
  pricing_mode text not null check (pricing_mode in ('m2','fixo','manual')),
  price_per_m2 numeric(10,2),
  base_price numeric(10,2),
  active boolean not null default true,
  sort_order int not null default 0
);

create table option_groups (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references product_types(id) on delete cascade,
  name text not null,
  required boolean not null default false,
  sort_order int not null default 0
);

create table options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references option_groups(id) on delete cascade,
  label text not null,
  surcharge_type text not null default 'fixo' check (surcharge_type in ('fixo','por_m2')),
  surcharge_value numeric(10,2) not null default 0,
  active boolean not null default true,
  sort_order int not null default 0
);

create table models (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references product_types(id) on delete cascade,
  name text not null,
  photo_url text,
  surcharge numeric(10,2) not null default 0,
  active boolean not null default true,
  sort_order int not null default 0
);

create table payment_conditions (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  min_total numeric(12,2),
  max_total numeric(12,2),
  active boolean not null default true,
  sort_order int not null default 0
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  customer_name text not null,
  customer_phone text not null default '',
  site_address text not null default '',
  status text not null default 'rascunho' check (status in ('rascunho','enviado','aprovado','recusado')),
  discount numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  valid_until date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotes_token_idx on quotes(token);
create index quotes_status_idx on quotes(status);

create table quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  product_type_id uuid references product_types(id) on delete set null,
  product_name text not null,
  model_id uuid references models(id) on delete set null,
  model_name text,
  model_photo_url text,
  width_m numeric(6,2),
  height_m numeric(6,2),
  area_m2 numeric(8,2),
  qty int not null default 1,
  unit_base_price numeric(12,2) not null,
  selected_options jsonb not null default '[]',
  unit_total numeric(12,2) not null,
  line_total numeric(12,2) not null,
  sort_order int not null default 0
);
create index quote_items_quote_idx on quote_items(quote_id);
