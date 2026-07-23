-- Índices para as colunas FK price_category_id adicionadas na 0029.
-- Os próximos fluxos (rollup financeiro e lista de compras) filtram preços por categoria,
-- então esses índices são essenciais para performance de queries frequentes.

create index options_price_category_idx on options(price_category_id);
create index option_groups_price_category_idx on option_groups(price_category_id);
create index product_types_price_category_idx on product_types(price_category_id);
