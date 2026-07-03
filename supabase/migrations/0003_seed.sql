insert into company_settings (id, name, city, about_text, warranty_text)
values (1, 'Serralheria', 'Pariquera-Açu/SP',
  'Trabalhamos com esquadrias de alumínio, vidros temperados e automatização de motores. Mais de 7 anos de mercado. Qualidade sob medida, instalação profissional, tudo vistoriado pelo próprio dono. Da fábrica direto para sua obra.',
  'Garantia de 1 ano para esquadrias e 2 anos para motores. Vedação total garantida (não somente PU). Todos os vidros temperados.')
on conflict (id) do update set
  name = excluded.name, city = excluded.city,
  about_text = excluded.about_text, warranty_text = excluded.warranty_text;

-- Portão de Alumínio: 650/m²; basculante +2000 fixo; social embutido +50/m²; bronze +250
with p as (
  insert into product_types (name, pricing_mode, price_per_m2, sort_order)
  values ('Portão de Alumínio', 'm2', 650.00, 0) returning id
), g1 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Abertura', true, 0 from p returning id
), g2 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Social', false, 1 from p returning id
), g3 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Cor do Alumínio', true, 2 from p returning id
), o1 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, x.typ, x.val, x.ord from g1,
    (values ('De Correr', 'fixo', 0.00, 0), ('Basculante', 'fixo', 2000.00, 1)) as x(label, typ, val, ord)
), o2 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, x.typ, x.val, x.ord from g2,
    (values ('Sem social', 'fixo', 0.00, 0), ('Social Embutido', 'por_m2', 50.00, 1)) as x(label, typ, val, ord)
)
insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
select id, x.label, 'fixo', x.val, x.ord from g3,
  (values ('Branco', 0.00, 0), ('Preto', 0.00, 1), ('Bronze', 250.00, 2)) as x(label, val, ord);

-- Janela de Vidro Temperado: 500/m²
with p as (
  insert into product_types (name, pricing_mode, price_per_m2, sort_order)
  values ('Janela de Vidro Temperado', 'm2', 500.00, 1) returning id
), g1 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Tipo de Vidro', true, 0 from p returning id
), g2 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Cor do Alumínio', true, 1 from p returning id
), o1 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, 'fixo', 0, x.ord from g1,
    (values ('Incolor', 0), ('Fumê', 1), ('Verde', 2), ('Serigrafado', 3)) as x(label, ord)
)
insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
select id, x.label, 'fixo', x.val, x.ord from g2,
  (values ('Branco', 0.00, 0), ('Preto', 0.00, 1), ('Bronze', 250.00, 2)) as x(label, val, ord);

-- Porta Blindex: 550/m²
with p as (
  insert into product_types (name, pricing_mode, price_per_m2, sort_order)
  values ('Porta Blindex', 'm2', 550.00, 2) returning id
), g1 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Tipo de Vidro', true, 0 from p returning id
), g2 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Cor do Alumínio', true, 1 from p returning id
), o1 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, 'fixo', 0, x.ord from g1,
    (values ('Incolor', 0), ('Fumê', 1), ('Verde', 2), ('Serigrafado', 3)) as x(label, ord)
)
insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
select id, x.label, 'fixo', x.val, x.ord from g2,
  (values ('Branco', 0.00, 0), ('Preto', 0.00, 1), ('Bronze', 250.00, 2)) as x(label, val, ord);

-- Box Blindex: 500/m²; até o teto +50/m²; bronze +250
with p as (
  insert into product_types (name, pricing_mode, price_per_m2, sort_order)
  values ('Box Blindex', 'm2', 500.00, 3) returning id
), g1 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Altura', true, 0 from p returning id
), g2 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Formato', false, 1 from p returning id
), g3 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Tipo de Vidro', true, 2 from p returning id
), g4 as (
  insert into option_groups (product_type_id, name, required, sort_order)
  select id, 'Cor do Alumínio', true, 3 from p returning id
), o1 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, x.typ, x.val, x.ord from g1,
    (values ('Padrão', 'fixo', 0.00, 0), ('Até o teto', 'por_m2', 50.00, 1)) as x(label, typ, val, ord)
), o2 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, 'fixo', 0, x.ord from g2, (values ('Box Reto', 0), ('Box de Canto', 1)) as x(label, ord)
), o3 as (
  insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
  select id, x.label, 'fixo', 0, x.ord from g3,
    (values ('Incolor', 0), ('Fumê', 1), ('Verde', 2), ('Serigrafado', 3)) as x(label, ord)
)
insert into options (group_id, label, surcharge_type, surcharge_value, sort_order)
select id, x.label, 'fixo', x.val, x.ord from g4,
  (values ('Branco', 0.00, 0), ('Preto', 0.00, 1), ('Bronze', 250.00, 2)) as x(label, val, ord);

-- Linha Suprema: sob consulta — a responsável orça, vendedor digita o valor no item
insert into product_types (name, pricing_mode, sort_order)
values ('Janela Linha Suprema (persiana integrada)', 'manual', 4);

-- Motor: valor EXEMPLO
insert into product_types (name, pricing_mode, base_price, sort_order)
values ('Motor para Portão (automatização)', 'fixo', 1800.00, 5);

insert into payment_conditions (description, min_total, max_total, sort_order) values
  ('50% de entrada + 50% na entrega', null, null, 0),
  ('50% de entrada + 50% em até 3x no cartão', null, 5000.00, 1),
  ('50% de entrada + 50% em até 5x no cartão', 5000.01, null, 2),
  ('10x no cartão sem juros', null, 11000.00, 3),
  ('12x no cartão sem juros', 11000.01, null, 4),
  ('50% de entrada + 50% no boleto (a negociar com o responsável)', null, null, 5);
