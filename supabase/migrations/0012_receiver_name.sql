-- Recibo: nome do recebedor padrão (admin preenche; editável ao gerar o recibo).
alter table company_settings add column if not exists receiver_name text not null default '';
