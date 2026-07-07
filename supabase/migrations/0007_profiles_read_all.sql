-- Leitura de perfis liberada a qualquer autenticado (nome/e-mail/papel visíveis
-- entre a equipe) — necessário para exibir e reatribuir o vendedor responsável.
-- Escrita permanece admin-only (pr_write inalterado). Anon continua sem acesso.
drop policy if exists pr_read on profiles;
create policy pr_read on profiles for select to authenticated using (true);
