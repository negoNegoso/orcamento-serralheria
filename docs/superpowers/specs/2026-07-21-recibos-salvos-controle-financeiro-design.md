# Recibos salvos + controle financeiro

**Data:** 2026-07-21
**Branch base:** `feat/desconto-percentual`

## Problema

Hoje o recibo (`orcamentos/[id]/recibo`) é 100% efêmero: um componente client (`recibo-document.tsx`)
com `useState`, servido só pra impressão. Nada é salvo. Não há como:

- saber quanto já foi pago de um orçamento nem quanto falta;
- registrar pagamentos parciais (entrada + parcelas);
- ter controle financeiro por orçamento ou da empresa.

## Objetivo

1. Persistir recibos, vinculados ao orçamento.
2. Um orçamento pode ter **vários recibos** (parcelas/entradas). Cada um tem valor e data próprios.
3. A **soma dos recibos não pode exceder o total do orçamento** (controle financeiro).
4. Valor do recibo é **editável** (respeitando a regra da soma).
5. Pré-preencher a forma de pagamento do recibo com as **condições de pagamento** cadastradas (Admin > Pagamento).
6. Alimentar o **dashboard** com valores recebidos e a receber, por orçamento e da empresa.

Fora de escopo (YAGNI): novo enum de status de pagamento no quote (quitado é derivado), lembretes/cobrança,
edição de método por condição no ato do recibo além do texto pré-preenchido.

## Decisões

- **Nova tabela `receipts`** (rejeitado guardar JSON no quote: quebra RLS, query e agregação).
- Regra soma ≤ total imposta por **RPC transacional** `save_receipt` (padrão do `save_quote_atomic`),
  com checagem client-side só para UX.
- Números financeiros expostos por **view SQL agregada** (`quote_financials`) reaproveitável,
  e o dashboard estende o RPC existente `dashboard_metrics`.
- Multi-tenant: `company_id` + RLS por empresa, copiando as policies de `quotes`/`payment_conditions`.
- "A receber" da empresa conta **só orçamentos `aprovado`** (não infla com rascunho/recusado).
  "Recebido" é fato: soma todos os recibos independente de status.

## Arquitetura

### 1. Migration `0027_receipts.sql`

```sql
create table receipts (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references quotes(id) on delete cascade,
  company_id      uuid not null references companies(id),
  amount          numeric(12,2) not null check (amount >= 0),
  receipt_date    date not null default current_date,
  payer_doc       text not null default '',   -- CPF/CNPJ de quem pagou
  payment_method  text not null default '',   -- "forma de pagamento" (pré-preenchida)
  receiver_name   text not null default '',
  receiver_doc    text not null default '',
  receiver_method text not null default '',   -- ex.: PIX
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index receipts_quote_idx on receipts(quote_id);
create index receipts_company_idx on receipts(company_id);
```

RLS (copiando padrão de `quotes` no 0017): policies filtram por `company_id = current_company_id()`;
escrita exige `is_company_admin()` conforme o padrão das outras tabelas. `created_by` preenchido pela action.

View agregada:

```sql
create view quote_financials as
  select
    q.id                                          as quote_id,
    q.company_id,
    q.status,
    q.total,
    coalesce(sum(r.amount), 0)                    as received,
    q.total - coalesce(sum(r.amount), 0)          as balance,
    (q.total - coalesce(sum(r.amount), 0)) <= 0   as settled
  from quotes q
  left join receipts r on r.quote_id = q.id
  group by q.id;
```

(View herda RLS das tabelas base; `security_invoker = on` para respeitar as policies do usuário.)

### 2. RPC `save_receipt`

```
save_receipt(p_id uuid, p_quote_id uuid, p_data jsonb) returns uuid
```

- `security invoker`, `set search_path = public`.
- Resolve `company_id` a partir do `quotes` do `p_quote_id`; erro se orçamento não existe.
- Recalcula `soma(amount)` dos **outros** recibos do orçamento (exclui `p_id` no update)
  dentro da transação; se `soma + novo_amount > quotes.total` → `raise exception 'Recibos excedem o total do orçamento'`.
- Insert (quando `p_id` nulo) ou update; devolve o id.
- Grant execute para `authenticated`.

Delete de recibo: action direta na tabela (RLS cobre), não precisa de RPC.

### 3. Extensão do `dashboard_metrics`

Novo bloco `financeiro` no JSON retornado (respeita `p_start`/`p_end` do período já existente):

```
'financeiro', jsonb_build_object(
  'received_total',   -- soma receipts.amount com receipt_date no período
  'receivable_total', -- soma quote_financials.balance onde status='aprovado'
  'overdue_count'     -- nº de aprovados com balance > 0
)
```

Nova migration `0028_dashboard_financeiro.sql` (recria a função `dashboard_metrics`).

**Atenção (escopo empresa):** `dashboard_metrics` hoje é `security definer` + `is_admin()` e agrega `quotes`
sem filtrar `company_id`. Ao recriar a função, o bloco `financeiro` deve escopar por `current_company_id()`
para não vazar entre empresas. Avaliar no plano se os blocos existentes já vazam (bug pré-existente separado);
não corrigir aqui além de manter o `financeiro` corretamente escopado.

### 4. UI — página do orçamento (`orcamentos/[id]/page.tsx`)

Nova seção **"Recibos"** (componente `src/components/receipt/receipts-section.tsx`), acima ou abaixo
do `QuoteEditor`:

- Barra resumo: **Recebido R$ X · Saldo R$ Y · [Quitado]** (lê `quote_financials`).
- Lista de recibos: data · valor · forma de pagamento · ações **Abrir** (print) / **Editar valor** / **Excluir**.
- Botão **Novo recibo**: server action cria registro com:
  - `amount` default = `balance` (saldo restante);
  - `payment_method` = concat das `applicableConditions(conds, quote.total)` (lib `payment.ts` existente);
  - depois `redirect` para `orcamentos/[id]/recibo/[receiptId]`.
- "Editar valor": input inline + action que chama `save_receipt`; erro do RPC exibido (saldo estourado).

### 5. Rota de impressão por recibo

- Nova rota `orcamentos/[id]/recibo/[receiptId]/page.tsx` (a atual `recibo/page.tsx` é substituída/movida).
- Carrega o `receipts` + `quotes` + `company` + `quote_items`.
- `recibo-document.tsx`:
  - deixa de usar `Number(quote.total)` em "Valor recebido"/declaração; passa a usar `receipt.amount`;
  - campos hoje efêmeros (`payer_doc`, `receipt_date`, `payment_method`, `receiver_*`) inicializam do registro salvo;
  - botão **Salvar** persiste alterações via `save_receipt` (inclui valor); mantém `PrintButton`.
  - Total/itens continuam mostrando o orçamento completo; só "Valor recebido"/declaração refletem a parcela.

### 6. Dashboard (`src/app/(app)/admin/dashboard/page.tsx`)

Três cards novos alimentados pelo bloco `financeiro`: **Recebido**, **A receber**, **Em aberto (nº)**.
Seguem o layout dos KPIs atuais.

## Fluxo de dados

```
Novo recibo → action cria receipts (amount=saldo, method=condições) → redirect print page
Print page → edita campos → Salvar → save_receipt (valida soma ≤ total) → volta
Página orçamento → quote_financials → Recebido/Saldo/Quitado + lista
Dashboard → dashboard_metrics.financeiro → Recebido/A receber/Em aberto
```

## Erros

- Estouro de saldo: RPC `raise exception`; UI mostra mensagem e mantém valor anterior.
- Client-side pré-checa saldo pra evitar round-trip na maioria dos casos.
- Excluir recibo: reduz recebido, aumenta saldo — sempre válido, sem checagem.

## Testes

- `payment`/`applicableConditions`: já coberto; adicionar teste do pré-preenchimento (concat das condições).
- Lib pura nova (se houver formatação de saldo/quitado): teste unitário Vitest.
- RPC `save_receipt`: teste de regra soma ≤ total (via migration/SQL ou teste de integração conforme padrão do repo).
- Cálculo do bloco `financeiro` do dashboard: verificar received/receivable/overdue com dados de exemplo.

## Migrations

- `0027_receipts.sql` — tabela, índices, RLS, view `quote_financials`, RPC `save_receipt`.
- `0028_dashboard_financeiro.sql` — recria `dashboard_metrics` com bloco `financeiro`.
