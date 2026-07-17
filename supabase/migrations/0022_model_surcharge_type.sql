alter table models
  add column surcharge_type text not null default 'fixo'
  check (surcharge_type in ('fixo','por_m2'));
