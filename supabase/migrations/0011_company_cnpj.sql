-- Recibo: CNPJ da empresa exibido no cabeçalho do recibo.
alter table company_settings add column if not exists cnpj text not null default '';
