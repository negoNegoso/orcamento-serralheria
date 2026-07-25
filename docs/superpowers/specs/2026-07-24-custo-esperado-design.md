# Custo esperado no catálogo (margem prevista)

Data: 2026-07-24

## Problema

A OS nasce com `Real = venda` e margem zero, porque o catálogo só guarda preço de venda —
não existe onde cadastrar quanto cada serviço custa. O dono não consegue responder "quanto
sobra desta OS?" sem reeditar linha a linha o Real em cada obra. É a "Limitação conhecida"
do spec 2026-07-23-ordem-servico-design.md, agora resolvida.

Caso concreto que motivou: OS #1 da Garagem do Maninho (orçamento
`fd11327b-8b52-481b-b5e1-26c34fd3f0ac`, R$ 2.934,90) — Planejado = Real = 2.934,90,
Margem = 0, sem nenhuma informação de lucro.

## Objetivo desta entrega

Cadastrar, por preço do catálogo, o **custo esperado quebrado por natureza**
(custo interno / insumo / repasse). Com isso:

- a OS nasce com **Planejado = custo esperado** e **Real = custo esperado** (o usuário só
  corrige desvio), e **Margem = margem prevista** desde o primeiro segundo;
- o orçamento não-aprovado mostra ao admin a **margem prevista antes de fechar o preço**;
- o fechamento compara **custo-padrão × custo-real por natureza** — o objetivo original
  do pedido de OS.

## Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Formato do custo | Quebrado por natureza (até 3 componentes por preço) | Pedido explícito; composição planejada casa com o real categorizado |
| Onde cadastra | Preço base do produto + opções | O clone decompõe em base+opções; só a base deixaria opções com o problema antigo |
| Unidade | Espelha a venda: produto m² → R$/m²; fixo → R$; opção segue `surcharge_type` | Portão de 6 m² não custa o mesmo que o de 2 m² |
| `pricing_mode = 'manual'` | Sem custo de catálogo | Não há preço cadastrado; linha nasce como hoje |
| Linha da OS | Uma por componente de custo | Composição vai até o lançamento do real; estrutura de linha já existe |
| Preço sem custo cadastrado | Fallback conservador: planejado = venda + aviso | Nada fica pior que hoje; margem mostrada nunca mente pra cima |
| Onde mostra margem prevista | OS + orçamento (só admin) | O dado vale mais antes de fechar o preço |
| Armazenamento | Tabela `price_costs` (não colunas) | Mesmo racional da 0029: categoria nova = insert, sem alargar 2 tabelas |
| Herança grupo→opção de valores | Não | Herança serve pra rótulo; custo em R$ é específico de cada opção |
| OS existentes | Não retroage | Planejado é foto da aprovação |

## Schema

Migration `supabase/migrations/0035_price_costs.sql`.

```sql
create table price_costs (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id),
  product_type_id   uuid references product_types(id) on delete cascade,
  option_id         uuid references options(id) on delete cascade,
  price_category_id uuid not null references price_categories(id),
  value             numeric(12,2) not null check (value >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- dono é exatamente um dos dois
  check ((product_type_id is null) <> (option_id is null)),
  unique (product_type_id, price_category_id),
  unique (option_id, price_category_id)
);
create index price_costs_company_idx on price_costs(company_id);
create index price_costs_product_idx on price_costs(product_type_id);
create index price_costs_option_idx  on price_costs(option_id);
```

- Máximo 3 linhas por preço (uma por categoria; unique enforça).
- `value` na unidade da venda: R$/m² quando o preço é por m², R$ quando fixo.
- Vazio no formulário = linha ausente (não grava zero). `value = 0` explícito é válido
  (ex.: "não tenho custo de insumo nisso").

### RLS — custo é dado de admin

`product_types` e `options` são legíveis por vendedor (ele monta orçamento). `price_costs`
NÃO: leitura e escrita exigem `is_company_admin()` + `company_id = current_company_id()`.
A prévia de margem calcula no servidor só para admin; o clone roda em RPC `security definer`.
Vendedor nunca alcança um valor de custo.

```sql
alter table price_costs enable row level security;
create policy pcost_all on price_costs for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());
```

### `work_order_costs.planned_kind`

```sql
alter table work_order_costs add column planned_kind text not null default 'venda'
  check (planned_kind in ('custo','venda','estrutural'));
```

- `'custo'`: linha planejada a partir de componente cadastrado — planejado é custo esperado.
- `'venda'`: fallback (sem custo cadastrado para um preço real) — planejado é o preço de
  venda, contribuição de margem zero, entra na contagem de "sem custo cadastrado".
- `'estrutural'`: linha sem preço cadastrável (modelo/resíduo, `extra_value`, ajuste de
  arredondamento) — planejado é o preço de venda, mas nunca conta como pendência nem ganha
  o aviso, porque não há onde cadastrar custo nela.
- Distingue sem ambiguidade "custo cadastrado igual à venda" de "sem cadastro" de "linha sem
  preço cadastrável", sem depender de sniffing na descrição. Default `'venda'` deixa as
  linhas já existentes semanticamente corretas.
- `planned_kind` entra no `woc_frozen_guard` (imutável após criação), junto de
  `planned_value` e `work_order_id`.

### Views

`work_order_totals` ganha `predicted_margin`:

```sql
quote_total - coalesce(sum(c.planned_value), 0) as predicted_margin
```

Numa OS com linhas `venda` (fallback), essas linhas entram no `planned_total` pelo preço de
venda e portanto **não contribuem margem** — a margem prevista fica conservadora, que é o
comportamento decidido. A tela informa quantas linhas estão nessa condição, então o número
se lê como "pelo menos X".

`margin` (= `quote_total − actual_total`) não muda e continua sendo o número que converge
para o lucro real. `work_order_category_totals` não muda estruturalmente — os números é que
passam a significar custo esperado por natureza.

### Semântica que muda

| conceito | antes | depois |
|---|---|---|
| Planejado da linha | preço de venda | custo esperado (`custo`) ou venda (fallback `venda`) |
| Real ao nascer | = venda → margem 0 | = custo esperado → margem já nasce prevista |
| Margem ao nascer | 0 | venda − custo esperado |
| Variação | sem leitura útil | estouro real sobre o custo esperado |
| Invariante `Σ planned = line_total × m` | valia | **morre** — planejado não é mais decomposição da venda |

A verificação de conformidade SQL×TS muda junto: linha `custo` tem
`planned = Σ componentes × fator`; linha `venda` mantém `planned = venda × fator`.

## Clone da OS

`work_order_clone_costs` (SQL) e `decomposeItem` (TS) mudam em espelho — a duplicação
deliberada TS/SQL continua, com a versão TS como especificação testada.

Para cada preço do item (base e cada opção), com `fator = qty × multiplier` (× área quando
o preço é por m²):

1. Busca componentes em `price_costs` (produto → `product_type_id`; opção → `option_id`).
2. **Com componentes** → uma linha por componente:
   - `planned_value = value × fator`, arredondado por linha (`round2`/`round(,2)`)
   - `price_category_id` = a do componente, congelada
   - `planned_kind = 'custo'`, `unit_value = planned_value`, `qty = 1`
   - descrição: `"Preço base — {categoria}"` / `"{grupo} — {opção} — {categoria}"`
3. **Sem componentes** → uma linha exatamente como hoje: `planned_value = venda × fator`,
   categoria por herança (0029), `planned_kind = 'venda'`.
4. Modelo (resíduo contra `line_total`), `extra_value` e ajuste de arredondamento:
   inalterados, sempre `planned_kind = 'estrutural'` — não há preço cadastrável nessas
   linhas, então nunca contam como pendência nem ganham o aviso. O resíduo segue calculado
   contra a venda
   (`line_total × m − Σ valores de venda distribuídos`) — para isso o clone acumula a soma
   de venda separadamente da soma planejada, já que linhas `custo` não carregam a venda.

**Duas somas, um laço.** O clone passa a manter dois acumuladores por item:
`v_sum_venda` (todo preço de venda distribuído, usado só para o resíduo do modelo) e o
`planned_value` efetivamente gravado em cada linha. Numa linha `custo`, o preço de venda
daquele componente entra em `v_sum_venda` **uma vez por preço** (não uma vez por
componente), senão o resíduo do modelo sairia errado em item com 2–3 componentes.

`optionId` ausente/malformado no snapshot: sem componente possível → fallback `venda`
(regra atual preservada).

OS criadas antes desta feature não retroagem. Custo cadastrado depois da aprovação não
altera OS existente — o aviso "sem custo cadastrado" da linha fica, coerente com a foto.

## Prévia no orçamento

Função pura `previewMargin(items, costs)` em `src/lib/work-order/preview-margin.ts`:
mesma decomposição, sem gravar. Retorna `{ predictedMargin, uncostedCount }`.

- **Orçamento não-aprovado**, página do orçamento, bloco admin-only:
  *"Margem prevista: R$ X — N serviços sem custo cadastrado"*. O fetch de `price_costs`
  só roda para admin (mesmo gating do bloco da OS; a RLS é a segunda barreira).
- **Bloco da OS** (aprovado) e **cabeçalho da tela da OS**: "Margem prevista"
  (`predicted_margin`) ao lado de Planejado / Real / Margem.

## UI

**Produto** — `src/app/(app)/admin/produtos/product-form.tsx`: abaixo dos campos de preço,
bloco "Custo esperado" com 3 inputs (Custo interno / Insumo / Repasse), rótulo `R$` ou
`R$/m²` conforme `pricing_mode`. Auto-save no padrão atual. `manual` não mostra o bloco.
Ao lado do preço, quando há componentes: `custo 180 · margem 420 (70%)` em texto suave.

**Opção** — `src/app/(app)/admin/produtos/[id]/option-row.tsx`: sub-bloco expansível
("Custo esperado ▸") com os 3 inputs, unidade conforme `surcharge_type`. Expansível porque
a linha já carrega tipo/valor/categoria.

**Tela da OS** — linha `planned_kind='venda'` ganha badge âmbar `sem custo cadastrado`
(linha `'estrutural'` nunca ganha, porque não há custo cadastrável nela). Cabeçalho ganha
Margem prevista.

**Orçamento** — blocos descritos na seção anterior. Vendedor não vê nenhum dos dois.

### Como a Margem prevista é exibida

O desconto do orçamento não vira linha planejada: ele existe só no `quotes.total`. Então numa
OS onde nenhum preço tem custo cadastrado — toda linha `'venda'`, planejado = venda —
`predicted_margin` dá exatamente `−desconto`. A conta está certa (se cada serviço custasse o
que você cobra por ele, o desconto sai do seu bolso), mas o número sozinho alarma sem
informar. A exibição resolve isso em três estados, calculados por `costCoverage()`:

| cobertura | exibição |
|---|---|
| nenhuma linha com custo | `—` e a frase "Cadastre o custo esperado dos serviços para ver a margem." |
| parcial | valor em cor neutra + "N sem custo" abaixo |
| completa | valor colorido (verde/vermelho pelo sinal) |

`costCoverage` só conta linhas `source='orcamento'`: custo lançado na produção não é preço
de catálogo, e `'estrutural'` não tem onde cadastrar. Vale nos dois lugares — cabeçalho da
tela da OS e bloco da OS no orçamento.

### `manual` sem custo, garantido no código

A decisão "produto `manual` não tem custo de catálogo" era só visual (o formulário escondia o
bloco). Um produto que teve custo cadastrado enquanto era `fixo` e depois virou `manual`
continuava planejando contra o catálogo, com o vendedor digitando o preço à mão. Agora é
regra nas duas implementações: `decomposeItem` zera `baseCosts` quando `pricingMode ===
'manual'`, e `work_order_clone_costs` (migration `0037`) exige
`coalesce(pricing_mode,'') <> 'manual'` antes de procurar componentes. As linhas de
`price_costs` ficam inertes em vez de serem apagadas — voltar para `fixo` recupera o cadastro.

### Backfill das linhas estruturais (0037)

Linhas criadas antes desta entrega nasceram com o default `'venda'`, inclusive modelo,
"Ajuste do item" e arredondamento — que ganhariam o aviso "sem custo cadastrado" sem ter onde
cadastrar custo. A `0037` reclassifica essas três descrições para `'estrutural'` uma única
vez, desabilitando `woc_frozen_guard` em volta do update (o guard congela `planned_kind`).
Comparar descrição é aceitável numa migração pontual; foi justamente o que se tirou do código
que roda sempre.

## Server actions

`savePriceCosts` (produto) e `saveOptionCosts` (opção) em
`src/app/(app)/admin/produtos/`: upsert por (dono, categoria); input vazio deleta o
componente; valor inválido rejeita. Admin-only pela RLS (e pelo padrão das actions do
admin). `parseDecimal` para os valores.

## Testes

| arquivo | cobre |
|---|---|
| `decompose.test.ts` (estende) | componente fixo; por m² (escala pela área); parcial (só insumo → 1 linha custo + nada de venda para a base); sem custo → fallback venda idêntico ao atual; qty × multiplier; `planned_kind`; resíduo do modelo continua contra a venda com mix de linhas custo/venda |
| `preview-margin.test.ts` | custo cheio, parcial e zero; contagem de sem-custo; `manual` conta como sem-custo |
| `variance.test.ts` (estende) | `predictedMargin(quoteTotal, plannedTotal)` |

Conformidade SQL×TS: fixture com custo cheio, parcial e sem custo; RPC × `decomposeItem`.

## Fora de escopo

- Custo em modelo (`models.surcharge`), `extra_value` e desconto — continuam `venda`.
- Retroagir custo em OS existente.
- Herança de valores grupo→opção.
- Margem alvo / markup automático — cadastra-se custo, não regra de preço.
- Templates de grupo (não carregam custo, como já não carregam categoria).
- Qualquer exposição de custo a vendedor.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/0035_price_costs.sql` | tabela, RLS, `planned_kind`, view, guarda |
| `supabase/migrations/0036_clone_with_costs.sql` | `work_order_clone_costs` nova versão |
| `src/lib/work-order/decompose.ts` + teste | componentes de custo, `planned_kind` |
| `src/lib/work-order/preview-margin.ts` + teste | margem prevista |
| `src/lib/work-order/variance.ts` + teste | `predictedMargin` |
| `src/lib/work-order/types.ts` | `planned_kind`, `PriceCost`, `predicted_margin` |
| `src/lib/work-order/queries.ts` | fetch de `price_costs` e `predicted_margin` |
| `src/app/(app)/admin/produtos/product-form.tsx` + actions | bloco custo esperado |
| `src/app/(app)/admin/produtos/[id]/option-row.tsx` + actions | sub-bloco custo esperado |
| `src/app/(app)/orcamentos/[id]/page.tsx` | prévia de margem (não-aprovado) + margem prevista no bloco da OS |
| `src/app/(app)/orcamentos/[id]/ordem/page.tsx` | margem prevista + badge sem-custo |
| `src/components/work-order/*` | ajustes correspondentes |
