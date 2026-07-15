# Clientes — vínculo cliente ↔ orçamentos

**Data:** 2026-07-15
**Status:** Aprovado para planejamento

## Objetivo

Criar entidade **Cliente** e vincular cada orçamento a um cliente, permitindo ver o histórico do cliente com a empresa: orçamentos em aberto, fechados, perdidos e valor total aprovado.

## Decisões

- "Usuário" = **cliente** da serralheria (não usuário do sistema; vendedor/admin já vinculado via `created_by`).
- Fluxo **híbrido**: autocomplete no editor de orçamento cria/seleciona cliente na hora + página "Clientes" para lista, histórico e edição.
- Sem dedupe automático: autocomplete mostra **nome + telefone** na sugestão; vendedor diferencia visualmente e decide selecionar ou criar novo.
- **Backfill automático** na migration: orçamentos existentes agrupados por nome+telefone normalizados, 1 cliente por grupo.
- Campos do cliente: só `name` + `phone` (YAGNI). Endereço da obra continua no orçamento (`site_address`).
- **Cliente é fonte de verdade** (opção "reflete em tudo"): editar nome/telefone do cliente atualiza TODOS os orçamentos dele, inclusive aprovados. Sincronização via trigger no banco.
- Acesso: todos usuários logados (vendedor + admin), padrão atual do app.
- Definições de status: **em aberto** = `rascunho` + `enviado`; **fechado** = `aprovado`; **perdido** = `recusado`.
- Sem exclusão de cliente nesta fase.

## Arquitetura

Nova tabela `clients` + FK `client_id` em `quotes`. Colunas `customer_name`/`customer_phone` **permanecem** em `quotes` — os ~10 pontos que leem delas (PDF, recibo, apresentação, dashboard, produção) não mudam. Consistência garantida por trigger: editou cliente → sincroniza snapshot de todos orçamentos dele.

Fluxo de dados:

1. **Editor de orçamento** → autocomplete busca em `clients`, seleciona/cria, salva `client_id` + copia nome/telefone para `customer_name`/`customer_phone`.
2. **PDF, recibo, dashboard, produção** → continuam lendo `customer_name`/`customer_phone` do orçamento (zero mudança).
3. **Página Clientes** → lê `clients` + join com `quotes` via `client_id` para histórico/resumo.

## Seção 1 — Dados e migration

Migration `0014_clientes.sql`:

```sql
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  created_at timestamptz not null default now()
);

alter table quotes add column client_id uuid references clients(id) on delete set null;
create index quotes_client_idx on quotes(client_id);

create function sync_client_to_quotes() returns trigger as $$
begin
  update quotes
     set customer_name = new.name,
         customer_phone = new.phone
   where client_id = new.id;
  return new;
end;
$$ language plpgsql;

create trigger clients_sync_quotes
  after update of name, phone on clients
  for each row execute function sync_client_to_quotes();
```

- **Backfill na mesma migration**: agrupa `quotes` por `(trim(lower(customer_name)), telefone só dígitos)`, cria 1 client por grupo, seta `client_id`. Nome do client = versão do orçamento mais recente do grupo. Orçamentos com nome vazio não geram cliente (`client_id` fica null).
- `client_id` **nullable** no banco (backfill e segurança); app sempre preenche em orçamentos novos.
- RLS: mesma política das demais tabelas — leitura/escrita para autenticados.

## Seção 2 — Editor de orçamento (autocomplete)

Hoje: 2 inputs livres (nome, telefone) em `src/components/quote/quote-editor.tsx`, salvos via RPC `save_quote_atomic`.

Novo comportamento:

- Campo nome vira **combobox de cliente**: 2+ caracteres → busca em `clients` por nome ou telefone (ilike), até ~8 sugestões no formato "**João Silva** · (31) 99999-8888".
- **Selecionou sugestão** → chip com nome + telefone; telefone preenche automático e fica **readonly** (fonte = cliente). Botão ✕ limpa seleção.
- **Digitou nome novo** (sem selecionar) → estado "novo cliente"; telefone editável; no save, cria cliente e vincula.
- **Editando orçamento existente** → chip já vem com cliente vinculado (backfill cobre antigos).
- Renomear cliente = **só na página Clientes**. Editor nunca renomeia cliente existente (evita rename global acidental).
- Clonar orçamento → carrega `client_id` junto.

Backend:

- RPC `save_quote_atomic` ganha parâmetro `p_client_id uuid` (nullable). Se null e nome preenchido → cria cliente na mesma transação e vincula. Snapshot continua gravado como hoje.
- Busca do autocomplete: server action `searchClients(term)` ou query direta Supabase, seguindo padrão existente.

## Seção 3 — Página Clientes

Rota `/clientes` no grupo `(app)`, item novo na navegação, visível a todos logados.

**Lista** (`/clientes`):

- Busca por nome/telefone.
- Colunas: nome, telefone, nº orçamentos, R$ total aprovado, data do último orçamento.
- Ordenação padrão: último orçamento mais recente primeiro.
- Linha clica → detalhe.

**Detalhe** (`/clientes/[id]`):

- Cabeçalho: nome, telefone, botão **Editar** (dialog nome/telefone; salvar dispara trigger de sync).
- Cards de resumo: R$ total aprovado · em aberto (qtd) · fechados (qtd) · perdidos (qtd).
- Lista de orçamentos do cliente: data, status (badge), total, endereço da obra — clica → `/orcamentos/[id]`.
- Botão "Novo orçamento" com cliente pré-selecionado.

## Seção 4 — Erros e testes

- Autocomplete com erro de rede → campo livre normal (fallback: cria cliente novo no save). Save nunca bloqueia por falha de busca.
- Backfill: telefone normalizado (só dígitos) para agrupar; nomes vazios ignorados.
- Testes (vitest): normalização de telefone, lógica de agrupamento do backfill (se extraída para função testável), agregação de resumo do cliente.
- Verificação manual: criar orçamento com cliente novo → reusar via autocomplete → renomear cliente na página Clientes → conferir reflexo no orçamento antigo.

## Fora de escopo

- Exclusão de cliente.
- Campos extras (e-mail, CPF/CNPJ, endereço, observações).
- Gráficos/timeline de atividade (lista de orçamentos já cumpre o papel com volume atual).
- Merge de clientes duplicados.
