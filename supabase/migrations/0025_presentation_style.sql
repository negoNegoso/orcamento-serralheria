-- estilo de apresentação do orçamento (itens): cards (atual) ou tabela
alter table companies add column presentation_style text not null default 'cards'
  check (presentation_style in ('cards','tabela'));
