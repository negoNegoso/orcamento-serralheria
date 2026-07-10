-- Recibo: URL da assinatura do recebedor (admin pode trocar; padrão é a imagem incluída no app).
alter table company_settings add column if not exists signature_url text;
