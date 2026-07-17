-- company_settings (singleton single-tenant) foi absorvida por companies.
-- As policies cfg_read/cfg_write já foram removidas na 0018 (dependiam de is_admin());
-- o drop da tabela remove quaisquer objetos remanescentes.
drop table company_settings;
