-- Catálogo global de categorias de preço. Sem company_id: as categorias são
-- as mesmas para todas as empresas (mesmo padrão de business_areas, 0020).
create table price_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0
);

insert into price_categories (slug, name, sort_order) values
  ('custo', 'Custo', 0),
  ('insumo', 'Insumo', 1),
  ('repasse', 'Repasse', 2);

-- Nullable em todas: "sem categoria" é o estado inicial de tudo e segue válido.
-- product_types categoriza o preço base (base_price / price_per_m2).
alter table options       add column price_category_id uuid references price_categories(id);
alter table option_groups add column price_category_id uuid references price_categories(id);
alter table product_types add column price_category_id uuid references price_categories(id);

alter table price_categories enable row level security;

-- Leitura para qualquer autenticado. Sem insert/update/delete: o seed é fixo e
-- o app não edita categorias; categoria nova entra por migration.
create policy pc_read on price_categories for select to authenticated using (true);
