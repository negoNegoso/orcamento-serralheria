# Categorização de preços (repasse / custo / insumo)

Data: 2026-07-23

## Problema

Os preços do catálogo (preço base do produto, adicionais de opções) não têm classificação
financeira. Não dá para saber quanto de um orçamento é material comprado, quanto é serviço
repassado a terceiro e quanto é custo interno.

## Objetivo desta entrega

Marcar cada preço com **uma** categoria: `custo`, `insumo` ou `repasse`.

Só a marcação. Nenhum cálculo derivado. Análise de margem, rollup no financeiro e lista de
compras são fluxos seguintes e serão especificados separadamente — esta entrega existe para
dar a eles o dado de entrada.

## Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Cardinalidade | Uma categoria por preço | Simples de usar agora; composição (split em valores) fica para depois |
| Valor da composição | Nenhum | Decisão de % vs R$ adiada; não travar o modelo agora |
| Catálogo de categorias | Global, igual para todas as empresas | Pedido explícito; sem `tenant_id` |
| Armazenamento | Tabela + FK (não enum) | Categoria nova = 1 insert, não migração em N tabelas |
| Herança | Grupo → opção, calculada na leitura | Sem trigger e sem denormalização; mudar o grupo reflete na hora |
| Modelos | Fora do escopo | `models.surcharge` não recebe categoria |

## Schema

Migration `supabase/migrations/0029_price_categories.sql`.

```sql
create table price_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,   -- 'custo' | 'insumo' | 'repasse'
  name text not null,
  sort_order int not null default 0
);

insert into price_categories (slug, name, sort_order) values
  ('custo','Custo',0), ('insumo','Insumo',1), ('repasse','Repasse',2);

alter table options       add column price_category_id uuid references price_categories(id);
alter table option_groups add column price_category_id uuid references price_categories(id);
alter table product_types add column price_category_id uuid references price_categories(id);
```

`price_category_id` é nullable — todos os registros existentes começam sem categoria, e "sem
categoria" segue sendo estado válido depois. Não há backfill.

`product_types.price_category_id` categoriza o preço base (`base_price` / `price_per_m2`).

RLS, seguindo `business_areas` (0020): catálogo compartilhado, leitura para qualquer usuário
autenticado. Sem policies de insert/update/delete — o seed é fixo e o app não edita categorias.

```sql
alter table price_categories enable row level security;
create policy pc_read on price_categories for select to authenticated using (true);
```

## Herança grupo → opção

A opção usa a própria categoria; se não tiver, herda a do grupo:

```
categoriaEfetiva(optionCategoryId, groupCategoryId) = optionCategoryId ?? groupCategoryId ?? null
```

Calculada na leitura, em `src/lib/pricing/price-category.ts`. Nada é copiado para a linha da
opção — trocar a categoria do grupo muda todas as opções que não definiram a sua.

Definir a categoria no grupo serve de padrão para as opções dentro dele. A opção sobrescreve
quando destoa (grupo "Ferragens" = insumo, opção "Instalação" dentro dele = repasse).

Mão de obra, instalação e frete são modelados como opções hoje, então já são cobertos por essa
regra. Nenhuma entidade nova.

## UI

Três seletores, todos no mesmo padrão de auto-save já usado pelos campos de surcharge.

**Opção** — `src/app/(app)/admin/produtos/[id]/option-row.tsx`: `<select>` "Categoria" ao lado
de tipo/valor. Primeira entrada vazia mostra o resultado da herança: `Herda: {nome da categoria
do grupo}` quando o grupo tem categoria, `— sem categoria —` quando nem o grupo tem. Quando
vazio, o select exibe esse rótulo em cinza.

**Grupo** — `src/app/(app)/admin/produtos/[id]/group-modals.tsx`, no `GroupFormModal`: `<select>`
"Categoria padrão" junto de nome e "seleção obrigatória". Entrada vazia = "— sem categoria —".
Vai no modal, e não solto no header do card, porque `saveGroup` grava a linha inteira — um
`FormData` parcial vindo de um select isolado apagaria `name` e `required`. O `group-card.tsx`
exibe a categoria como badge read-only ao lado do nome do grupo.

**Preço base** — `src/app/(app)/admin/produtos/product-form.tsx`: `<select>` "Categoria" junto
dos campos de preço.

As opções do select vêm de `price_categories`, buscadas no server component pai (`[id]/page.tsx`
e `produtos/page.tsx`) e passadas por prop. Catálogo pequeno e fixo, sem fetch no cliente.

Nenhuma tela nova. Nenhum badge de categoria no orçamento, no PDF ou no dashboard.

## Server actions

`saveOption` e `saveGroup` em `src/app/(app)/admin/produtos/[id]/actions.ts` e `saveProduct` em
`src/app/(app)/admin/produtos/actions.ts` passam a ler `price_category_id` do
`FormData`. String vazia vira `null`. Valor não-vazio precisa ser um id existente em
`price_categories` — se não for, a action rejeita e o campo não é gravado. `revalidatePath`
segue como está.

## Types

`src/lib/config-types.ts`: `price_category_id: string | null` em `OptionRow`, `OptionGroupRow`
e `ProductConfig`. Novo `PriceCategory { id, slug, name, sort_order }`.

Não há types gerados do Supabase no projeto (`src/lib/supabase/` só tem client, server e admin,
sem `Database`), então não há regeneração a fazer.

## Testes

`price-category.test.ts` (vitest, junto de `src/lib/pricing/`), cobrindo `categoriaEfetiva`:
opção com categoria própria ignora o grupo; opção sem categoria herda a do grupo; ambos nulos
resulta em `null`.

O motor de preço não muda, então os testes de `calc.ts` e `snapshot.test.ts` seguem válidos sem
alteração.

## Fora de escopo

- `src/lib/pricing/calc.ts` e qualquer cálculo derivado da categoria.
- Snapshot do orçamento (`quote_items.selected_options`) — não guarda categoria ainda.
- Dashboard financeiro (0028) — sem totais por categoria.
- Produção, contrato, recibo.
- `models.surcharge`.
- Split de um preço em vários valores (insumo + repasse + custo) e a escolha entre % e R$.
- Tela de administração das categorias — o seed é fixo; categoria nova entra por migration.
- Templates de grupo. `applyTemplate` e `saveGroupAsTemplate` (em
  `src/app/(app)/admin/produtos/[id]/actions.ts`) copiam as opções sem a categoria, e as tabelas
  `option_group_templates` e `option_templates` não têm a coluna `price_category_id`. Salvar um
  grupo categorizado como template e reaplicá-lo devolve as opções sem categoria — não corrompe
  nada ("sem categoria" é estado válido), mas é uma lacuna real que esta entrega não fechou.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/0029_price_categories.sql` | tabela, seed, 3 FKs, RLS |
| `supabase/migrations/0030_price_category_indexes.sql` | índices das 3 FKs (`options_price_category_idx`, `option_groups_price_category_idx`, `product_types_price_category_idx`) |
| `src/lib/config-types.ts` | `PriceCategory`; `price_category_id` nos 3 types |
| `src/lib/pricing/price-category.ts` | `categoriaEfetiva()`, `categoryName()` |
| `src/lib/pricing/price-category.test.ts` | testes da herança e do rótulo |
| `src/lib/pricing/price-category-input.ts` | `parseCategoryId()` — select vazio vira `null` |
| `src/lib/pricing/price-category-input.test.ts` | testes do parse de FormData |
| `src/app/(app)/admin/produtos/[id]/actions.ts` | `saveOption`, `saveGroup` |
| `src/app/(app)/admin/produtos/[id]/page.tsx` | fetch `price_categories`, prop |
| `src/app/(app)/admin/produtos/[id]/option-row.tsx` | select com herança |
| `src/app/(app)/admin/produtos/[id]/group-editor.tsx` | repassa `categories` a card e modal |
| `src/app/(app)/admin/produtos/[id]/group-modals.tsx` | select de categoria no `GroupFormModal` |
| `src/app/(app)/admin/produtos/[id]/group-card.tsx` | badge da categoria + prop `categories` |
| `src/app/(app)/admin/produtos/actions.ts` | preço base |
| `src/app/(app)/admin/produtos/page.tsx` | fetch `price_categories`, prop |
| `src/app/(app)/admin/produtos/product-form.tsx` | select do preço base |

## Questões abertas para o próximo fluxo

Pontos que a revisão final desta entrega levantou e que o autor do próximo spec (margem /
financeiro / compras) precisa resolver antes de construir em cima:

- `models.surcharge` (decisão explícita desta entrega), `quote_items.extra_value` e o desconto
  do orçamento (migration 0026) não têm categoria. Consequência: a soma por categoria não fecha
  com o total do orçamento. Decidir se viram "não categorizado" explícito ou se ganham marcação.
- Produto com `pricing_mode = 'manual'` não tem `base_price` nem `price_per_m2` — o valor é
  digitado pelo vendedor no orçamento —, mas o select de categoria aparece igual. Não está
  definido se a categoria do produto vale para esse preço manual.
- O snapshot do orçamento (`quote_items.selected_options`) não guarda a categoria, então
  qualquer rollup histórico precisa de join de volta no catálogo, que é mutável: números de
  meses passados mudam quando alguém reclassifica um grupo, e opções deletadas ficam sem
  categoria.
- Templates de grupo não carregam categoria (ver "Fora de escopo" acima).
