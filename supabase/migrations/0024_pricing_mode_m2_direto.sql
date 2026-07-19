-- permite modo de preço por metragem direta (vendedor digita m²)
alter table product_types drop constraint product_types_pricing_mode_check;
alter table product_types add constraint product_types_pricing_mode_check
  check (pricing_mode in ('m2','m2_direto','fixo','manual'));
