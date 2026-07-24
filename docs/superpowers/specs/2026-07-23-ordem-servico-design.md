# Ordem de Serviço

Data: 2026-07-23

## Problema

Orçamento aprovado vira trabalho executado, mas o sistema não registra o que aquele trabalho
custou. Não há como comparar o que foi vendido com o que foi gasto, nem saber em que natureza
(custo interno, insumo, repasse a terceiro) o dinheiro saiu.

Hoje o pós-aprovação vive em `quotes.production_stage` (migration 0010): um kanban operacional,
sem nenhum dado financeiro.

## Objetivo desta entrega

Criar a **Ordem de Serviço (OS)**: um registro gerado automaticamente quando o orçamento é
aprovado, que clona a composição de preços do orçamento como custo planejado, permite lançar o
custo real durante a produção (inclusive de terceiros), e é encerrado por ato explícito.

## Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Apontamento de tempo | Fora | Pedido explícito de adiar. `CPreal` = soma de lançamentos manuais |
| OS x módulo Produção | OS absorve `production_stage` | Um dono do ciclo pós-aprovação; evita dois status divergindo |
| Granularidade do clone | Uma linha por preço (base + cada opção) | É a segmentação por natureza pedida; agregados saem por soma |
| Planejado vs real | Duas colunas na mesma linha | `planned_value` congelado é a base de comparação; `actual_value` editável |
| Baseline | Valor de **venda** das linhas | O catálogo não tem custo esperado. Ver "Limitação conhecida" |
| Quote sai de `aprovado` | OS vira `cancelada`, custos preservados | Reaprovação e ajuste de escopo são rotina; custo gasto é dado contábil |
| Quote editado após aprovação | Planejado não resincroniza | É a foto da aprovação. Resincronizar apagaria a base no meio da obra |
| Reaprovação | Mesma OS volta (`unique(quote_id)`) | Não duplica histórico de custo |
| Conclusão | Sempre manual | É o gatilho que congela o custo real |
| Acesso a custo | Só `admin` | Dado mais sensível que recibo |
| Localização | Dentro do orçamento | OS é 1:1 com o orçamento, nunca acessada sem ele |
| Numeração | `int` sequencial por empresa | Sequence global vazaria contagem entre empresas |

## Schema

Migration `supabase/migrations/0031_work_orders.sql`.

### `work_orders`

```sql
create table work_orders (
  id                uuid primary key default gen_random_uuid(),
  quote_id          uuid not null unique references quotes(id) on delete cascade,
  company_id        uuid not null references companies(id),
  number            int  not null,
  status            text not null default 'planejada'
                      check (status in ('planejada','em_andamento','concluida','cancelada')),
  production_stage  text check (production_stage in
                      ('pendente','a_produzir','em_producao','pronto','instalado')),
  archived_at       timestamptz,
  quote_total       numeric(12,2) not null,
  quote_snapshot_at timestamptz not null,
  closed_at         timestamptz,
  closed_by         uuid references profiles(id) on delete set null,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, number)
);
create index work_orders_company_idx on work_orders(company_id);
create index work_orders_stage_idx on work_orders(production_stage) where archived_at is null;
```

`quote_total` e `quote_snapshot_at` (cópia de `quotes.updated_at` na criação) são congelados.
Se `quotes.updated_at > quote_snapshot_at`, a tela avisa que o planejado está defasado.

**Migração do estado atual**, em quatro migrations para o sistema nunca ficar quebrado entre
elas: `0031` cria as tabelas e views; `0032` cria as funções; `0033` cria uma OS para cada quote
`aprovado`, copiando `production_stage`/`archived_at` e clonando as linhas de custo pela mesma
decomposição da criação normal; `0034` executa `alter table quotes drop column production_stage,
drop column archived_at` — só depois que o app já lê `work_orders`.

### `work_order_costs`

```sql
create table work_order_costs (
  id                uuid primary key default gen_random_uuid(),
  work_order_id     uuid not null references work_orders(id) on delete cascade,
  company_id        uuid not null references companies(id),
  source            text not null check (source in ('orcamento','manual','terceiro')),
  description       text not null,
  item_label        text not null default '',
  quote_item_id     uuid references quote_items(id) on delete set null,
  price_category_id uuid references price_categories(id),
  qty               numeric(10,2) not null default 1 check (qty >= 0),
  unit_value        numeric(12,2) not null default 0,
  actual_value      numeric(12,2) not null
                      generated always as (round(qty * unit_value, 2)) stored,
  planned_value     numeric(12,2) not null default 0,
  supplier          text not null default '',
  note              text not null default '',
  sort_order        int not null default 0,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index work_order_costs_wo_idx on work_order_costs(work_order_id);
create index work_order_costs_company_idx on work_order_costs(company_id);
create index work_order_costs_category_idx on work_order_costs(price_category_id);
```

`actual_value` é coluna gerada: existe um caminho único de edição (`qty`, `unit_value`), então
não há como o total divergir das partes. Linha vinda do orçamento nasce `qty = 1` e
`unit_value = planned_value` — o real começa igual ao planejado e o usuário corrige.

`item_label` e `price_category_id` são congelados na criação. `quote_item_id` serve só para
agrupar na UI e é `on delete set null` — o agrupamento sobrevive pelo `item_label`.

Linha criada durante a produção nasce com `planned_value = 0`: aparece integralmente como
estouro, que é o comportamento correto para custo não previsto.

### Views

Ambas com `security_invoker = on`, seguindo `quote_financials` (0027): herdam as policies do
usuário, então vendedor não enxerga valor nenhum.

```sql
create view work_order_totals with (security_invoker = on) as
  select wo.id as work_order_id, wo.company_id, wo.quote_total,
    coalesce(sum(c.planned_value), 0)                        as planned_total,
    coalesce(sum(c.actual_value), 0)                         as actual_total,
    coalesce(sum(c.actual_value), 0) - coalesce(sum(c.planned_value), 0) as variance,
    wo.quote_total - coalesce(sum(c.actual_value), 0)        as margin
  from work_orders wo
  left join work_order_costs c on c.work_order_id = wo.id
  group by wo.id;

create view work_order_category_totals with (security_invoker = on) as
  select c.work_order_id, c.company_id, c.price_category_id,
    sum(c.planned_value) as planned_total,
    sum(c.actual_value)  as actual_total,
    sum(c.actual_value) - sum(c.planned_value) as variance
  from work_order_costs c
  group by c.work_order_id, c.company_id, c.price_category_id;
```

`price_category_id` nulo é uma linha legítima do agrupamento, exibida como "Sem categoria".

### RLS

| tabela | policy |
|---|---|
| `work_orders` | `select` para qualquer autenticado com `company_id = current_company_id()`. `update` só com `is_company_admin()`. Sem `insert` e sem `delete`. |
| `work_order_costs` | `for all` exigindo `is_company_admin()` **e** `company_id = current_company_id()` |

Vendedor não tem escrita direta em nenhuma das duas tabelas. Ele precisa mexer na OS em três
situações — aprovar um orçamento, reprovar um já aprovado e mover o card no board — e as três
passam por RPCs `security definer` que validam a empresa e tocam só as colunas permitidas (ver
"RPCs"). Um caminho de escrita por papel, sem policy larga que precise de trigger para estreitar.

Um trigger, para a regra que nenhuma policy expressa:

- `woc_closed_guard` (before insert/update/delete em `work_order_costs`): bloqueia se a OS estiver
  `concluida` ou `cancelada`.

## Decomposição do clone

Para cada `quote_item`, com `m = quotes.multiplier`:

| linha | `planned_value` | `price_category_id` |
|---|---|---|
| base | `unit_base_price × qty × m` | `product_types.price_category_id` |
| cada entrada de `selected_options` | `(surchargeType = 'por_m2' ? surchargeValue × area_m2 : surchargeValue) × qty × m` | `coalesce(options.price_category_id, option_groups.price_category_id)`, via `optionId` |
| `extra_value`, só se ≠ 0 | `extra_value × m` | nula |
| ajuste do modelo, só se ≠ 0 | `line_total × m − (base + Σ opções + extra)` | nula |

O ajuste do modelo entra como **resíduo** porque `quote_items` guarda `model_id`, `model_name` e
`model_photo_url`, mas não o valor do surcharge aplicado. Calculado como diferença contra
`line_total` (já persistido na linha), e não recomputando o surcharge, o resíduo absorve também
qualquer sobra de arredondamento — a invariante `Σ linhas do item = line_total × m` vale por
construção, sem depender de join em catálogo mutável.

Linha de opção com valor zero é gravada mesmo assim: ela carrega a natureza do escopo vendido, e
o usuário pode lançar custo real nela.

Os joins em `options`, `option_groups` e `product_types` são `left join` — catálogo deletado
depois da venda não pode impedir a criação da OS; a linha só fica sem categoria.

`optionId` ausente no snapshot (registros anteriores ao campo) → categoria nula.

**O desconto do orçamento não vira linha.** Desconto reduz receita, não é custo. Portanto
`Σ planned_value = subtotal × m`, enquanto `quote_total = (subtotal − desconto) × m`. A tela
exibe planejado, total do orçamento e margem separadamente, sem sugerir que planejado e total
fecham entre si.

## RPCs

Migration `supabase/migrations/0032_work_order_rpcs.sql`.

A decomposição em SQL vive numa função interna `work_order_clone_costs(p_work_order_id,
p_quote_id)`, `security definer`, sem checagem de empresa — quem chama já validou. Existe para
`create_work_order` e o backfill de `0033` compartilharem exatamente o mesmo código.

`close_work_order` e `reopen_work_order` são `security invoker` (só admin as chama, e admin já tem
`update` pela policy). As três alcançáveis por vendedor — `create_work_order`, `cancel_work_order`
e `set_production_stage` — são `security definer`, porque precisam escrever onde o vendedor não
tem policy. Em `security definer` a RLS não protege mais nada, então cada uma valida
explicitamente `company_id = current_company_id()` na primeira leitura e aborta se não bater.
Todas com `set search_path = public`.

### `create_work_order(p_quote_id uuid) returns uuid` — definer

1. `select ... from quotes where id = p_quote_id for update`. Não encontrou, ou
   `company_id <> current_company_id()` → exceção.
2. `status <> 'aprovado'` → exceção.
3. OS já existe para o quote: se `status = 'cancelada'`, volta para `planejada`; retorna o id
   existente sem tocar nas linhas. Idempotente.
4. `number := coalesce(max(number), 0) + 1` entre as OS da empresa, dentro da transação.
5. Insere a OS com `production_stage = 'pendente'`, `quote_total = quotes.total`,
   `quote_snapshot_at = quotes.updated_at`, `created_by = auth.uid()`.
6. Insere as linhas pela decomposição acima, `source = 'orcamento'`,
   `unit_value = planned_value`, `qty = 1`.

Chamada em `setStatus` (`src/app/(app)/orcamentos/actions.ts:96`), substituindo o
`update ... production_stage = 'pendente'` que está lá hoje.

### `cancel_work_order(p_quote_id uuid)` — definer

Chamada por `setStatus` quando o orçamento sai de `aprovado`. Valida a empresa, grava
`status = 'cancelada'` e não toca nas linhas de custo. Sem OS para o quote → não faz nada.

### `set_production_stage(p_quote_id uuid, p_stage text)` — definer

Substitui o `update` direto que existe hoje em `src/app/(app)/producao/actions.ts`. Valida a
empresa e o valor de `p_stage`, grava `production_stage` e aplica a promoção automática: se
`status = 'planejada'` e o novo stage não é `pendente` nem `a_produzir`, passa para
`em_andamento`. Recusa se a OS estiver `cancelada`. Nenhuma outra coluna é escrita — é o que
impede o vendedor de mexer em status ou valores por chamada direta.

O arquivamento (`archived_at` + stage `instalado`) entra na mesma função, por
`p_stage = 'instalado'` com um segundo parâmetro `p_archive boolean default false`, evitando uma
quarta RPC para uma escrita de duas colunas.

### `close_work_order(p_id uuid)` / `reopen_work_order(p_id uuid)` — invoker

Ambas exigem `is_company_admin()`. `close` grava `status = 'concluida'`, `closed_at = now()`,
`closed_by = auth.uid()`; exige `status = 'em_andamento'` ou `'planejada'`. `reopen` volta para
`em_andamento` e limpa `closed_at`/`closed_by`; exige `status = 'concluida'`.

Nenhuma das duas calcula total. O `CPreal` é `work_order_totals.actual_total`, disponível a
qualquer momento — concluir apenas congela e carimba. Não há total denormalizado para divergir.

Todas com `revoke execute ... from public, anon` e `grant execute ... to authenticated`, igual
`save_receipt`.

## Transições

| evento | efeito |
|---|---|
| quote → `aprovado` | `create_work_order` (cria, ou revive uma cancelada) |
| quote sai de `aprovado` | `cancel_work_order`: OS → `cancelada`. Linhas de custo preservadas. Nunca apaga. |
| `production_stage` sai de `pendente`/`a_produzir` | se `status = 'planejada'` → `em_andamento`, dentro de `set_production_stage` |
| `production_stage` = `instalado`, ou arquivamento | a tela **propõe** concluir; não conclui sozinha |
| concluir | `close_work_order`. Congela lançamentos. |
| reabrir | `reopen_work_order`, só admin |

## Mudanças no módulo Produção

`src/lib/production/queries.ts` — `fetchBoardQuotes` passa a consultar `work_orders` com join em
`quotes` (hoje consulta `quotes` filtrando `status = 'aprovado'`). O filtro vira
`work_orders.status <> 'cancelada' and archived_at is null`, então OS cancelada some do board.

`src/app/(app)/producao/actions.ts` — `setProductionStage` e `archiveQuote` param de dar `update`
direto e passam a chamar a RPC `set_production_stage` (com `p_archive = true` no caso do
arquivamento). A promoção automática para `em_andamento` acontece dentro da RPC, na mesma
transação da troca de etapa.

Board, calendário e concluídos mantêm o comportamento visível: muda a tabela de origem da
coluna, não a tela. O card ganha um badge de variação (`▲ R$ 750`) exibido só para admin.

## Lógica pura

Diretório novo `src/lib/work-order/`:

| arquivo | conteúdo |
|---|---|
| `decompose.ts` | `decomposeItem(item, multiplier)` → linhas planejadas |
| `status.ts` | `nextStatusForStage(status, stage)`, `canEditCosts(status)`, `canClose(status)` |
| `variance.ts` | `variance(planned, actual)`, `margin(quoteTotal, actual)`, rollup por categoria |
| `types.ts` | `WorkOrder`, `WorkOrderCost`, `WorkOrderTotals`, `CategoryTotals` |

`decompose.ts` e `nextStatusForStage` são regras que também existem em SQL (dentro de
`create_work_order` e `set_production_stage`). A versão TypeScript é a especificação testada; a
versão SQL a repete. Duplicação deliberada — a alternativa seria a UI recalcular tudo no
cliente — e é o motivo da verificação de conformidade descrita em "Testes".

## UI

### Bloco no orçamento

Em `src/app/(app)/orcamentos/[id]/page.tsx`, seção nova abaixo de `ReceiptsSection`, renderizada
só quando `profile.role !== 'vendedor'`:

```
Ordem de Serviço #14        [Em andamento] [Em produção]
Planejado  R$ 12.400,00
Real       R$ 13.150,00   ▲ R$ 750,00 (+6,0%)
Margem     R$ 4.850,00                     [Abrir OS →]
```

Quando `quotes.updated_at > quote_snapshot_at`, faixa de aviso: *"Orçamento alterado depois da
geração da OS — o planejado é a foto da aprovação."*

### Tela da OS

Sub-rota `/orcamentos/[id]/ordem`, seguindo a convenção de `contrato`, `recibo` e `apresentacao`.
Vendedor é redirecionado para `/orcamentos/[id]`.

1. **Cabeçalho** — número, status, etapa, datas, ações `Concluir` / `Reabrir`. `Concluir` pede
   confirmação: *"Congela os lançamentos. Nenhum custo poderá ser editado ou adicionado depois."*
2. **Resumo por natureza** — `work_order_category_totals`: Custo / Insumo / Repasse / Sem
   categoria × planejado, real, variação. Estouro em vermelho.
3. **Linhas de custo** — agrupadas por `item_label`, grupo colapsável. Linha do orçamento mostra
   descrição, planejado (read-only) e real (`qty` × `unit_value` editáveis inline com auto-save,
   padrão dos campos de surcharge do admin de produtos). Linha de terceiro mostra `supplier`.
   Linha com `planned_value = 0` ganha marca "não previsto".
4. **Adicionar custo** — modal com seletor explícito `Custo interno` / `Terceiro` (define
   `source`), descrição, categoria (select de `price_categories`), quantidade, valor unitário,
   fornecedor (só para terceiro) e observação. "Fixo" é `qty = 1`; "variável" é
   `qty × unit_value`.
5. OS `concluida` ou `cancelada` → tudo read-only, sem botão de adicionar.

### Server actions

`src/app/(app)/orcamentos/[id]/ordem/actions.ts`: `addCost`, `updateCost`, `deleteCost`,
`closeOrder`, `reopenOrder`. As três de custo são operações diretas na tabela — RLS admin-only e
o trigger de OS fechada já cobrem as regras. `closeOrder` e `reopenOrder` chamam as RPCs.

## Testes

Vitest, ao lado do código:

| arquivo | cobre |
|---|---|
| `decompose.test.ts` | base, opção fixa, opção `por_m2`, resíduo do modelo, `extra_value`, `qty`, `multiplier`; invariante `Σ linhas = line_total × m`; opção sem `optionId` → categoria nula |
| `status.test.ts` | promoção automática para `em_andamento`; `canEditCosts` falso em `concluida` e `cancelada`; `canClose` por status |
| `variance.test.ts` | variação, margem, rollup por categoria com `price_category_id` nulo, percentual com `planned = 0` |

O projeto não tem infraestrutura de teste de banco, então as RPCs não têm teste automatizado. A
conformidade entre a decomposição em SQL e a de TypeScript é verificação manual documentada no
plano de implementação: aprovar um orçamento de fixture que exercite os quatro tipos de linha e
conferir o resultado da RPC contra `decomposeItem`.

A mesma verificação manual cobre as regras de acesso, que também não têm teste automatizado:
com um usuário `vendedor`, confirmar que ele move o card no board, que não enxerga nenhuma linha
de `work_order_costs`, e que um `update` direto em `work_orders.status` é recusado pela policy.

## Limitação conhecida: o planejado é receita, não custo

O catálogo guarda **preço de venda**. As categorias de 0029 marcam a *natureza* de cada preço,
não um custo esperado. Somar as linhas `insumo` responde "quanto do preço de venda tem natureza
insumo", não "quanto eu vou gastar em insumo".

Consequência: uma linha `insumo` vendida a R$ 100 com custo real de R$ 60 aparece com variação
de −R$ 40, que é margem planejada, não economia.

A tela lida com isso de duas formas: chama a coluna de "planejado" (não de "custo previsto") e
apresenta **margem = `quote_total` − `actual_total`** como o número de resultado, que é
correto independentemente da distorção acima.

A correção definitiva é `cost_value` no catálogo — o "split de um preço em vários valores" que
0029 adiou. Quando existir, `planned_value` passa a receber `cost_value` e nenhuma outra parte
deste modelo muda.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/0031_work_orders.sql` | tabelas, views, RLS, trigger |
| `supabase/migrations/0032_work_order_rpcs.sql` | `work_order_clone_costs`, `create_work_order`, `cancel_work_order`, `set_production_stage`, `close_work_order`, `reopen_work_order` |
| `supabase/migrations/0033_work_orders_backfill.sql` | uma OS por quote aprovado, com stage, arquivamento e linhas de custo |
| `supabase/migrations/0034_drop_quote_production_columns.sql` | remove `production_stage` e `archived_at` de `quotes` |
| `src/lib/work-order/types.ts` | types da OS e das linhas |
| `src/lib/work-order/decompose.ts` + teste | decomposição do orçamento em linhas planejadas |
| `src/lib/work-order/status.ts` + teste | máquina de estados |
| `src/lib/work-order/variance.ts` + teste | variação, margem, rollup |
| `src/lib/work-order/queries.ts` | fetch da OS, das linhas e dos totais |
| `src/app/(app)/orcamentos/actions.ts` | `setStatus` chama `create_work_order` ao aprovar e `cancel_work_order` ao sair de aprovado |
| `src/app/(app)/orcamentos/[id]/page.tsx` | bloco da OS (admin) |
| `src/app/(app)/orcamentos/[id]/ordem/page.tsx` | tela da OS |
| `src/app/(app)/orcamentos/[id]/ordem/actions.ts` | `addCost`, `updateCost`, `deleteCost`, `closeOrder`, `reopenOrder` |
| `src/components/work-order/` | cabeçalho, resumo por natureza, tabela de linhas, modal de custo |
| `src/lib/production/queries.ts` | board lê `work_orders` |
| `src/app/(app)/producao/actions.ts` | stage e arquivamento passam pela RPC `set_production_stage` |
| `src/components/production/board.tsx` | badge de variação (admin) |

## Fora de escopo

- Apontamento de tempo, cadastro de recurso e taxa-hora, cronômetro de chão de fábrica. O
  `CPreal` desta entrega é soma de lançamentos manuais de valor.
- `cost_value` no catálogo (ver "Limitação conhecida").
- Resincronizar o planejado quando o orçamento é editado depois da aprovação.
- Rota `/ordens` com lista, busca e filtros de todas as OS. A OS só é acessada pelo orçamento.
- PDF ou impressão da OS.
- Dashboard financeiro (0028): sem custo real e sem margem agregada.
- Categoria em `models.surcharge` — segue fora, entra como resíduo sem categoria.
- Cadastro de fornecedor. `supplier` é texto livre, como `receipts.payment_method`.
- Bloquear edição de orçamento aprovado que já tem OS.
