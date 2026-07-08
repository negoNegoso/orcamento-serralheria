# Clonar orçamento, clonar item e multiplicador de unidades

## Contexto

O sistema de orçamentos de serralheria hoje permite criar/editar orçamentos
com itens (`quote_items`), aplicar um desconto e apresentar/gerar PDF. Faltam
três recursos para agilizar orçamentos de condomínios com casas iguais:

1. Clonar um orçamento completo (nova cópia editável).
2. Duplicar um item dentro do orçamento.
3. Multiplicar o valor total do orçamento pelo número de unidades iguais.

## Objetivos

- Permitir replicar rapidamente orçamentos e itens.
- Precificar um conjunto de N casas idênticas a partir do valor de uma casa.

## Fora de escopo

- Multiplicadores por item (o multiplicador é do orçamento inteiro).
- Descontos por faixa de quantidade.

---

## Feature 1 — Multiplicador de unidades

Cenário: um condomínio com N casas iguais. O vendedor monta o orçamento de
**uma** casa e informa o multiplicador para obter o valor do projeto.

### Regra de cálculo

```
unitTotal = subtotal − desconto        (valor de uma unidade)
total     = round2(unitTotal × multiplier)   (valor do projeto)
```

O desconto é por unidade e multiplica junto (decisão do usuário).

### Schema (migration 0008)

```sql
alter table quotes
  add column multiplier int not null default 1 check (multiplier >= 1);
```

- `quotes.subtotal` e `quotes.discount` continuam **por unidade**.
- `quotes.total` passa a guardar o total **multiplicado** (valor do projeto).
  As condições de pagamento (`applicableConditions`) usam `quotes.total`, ou
  seja, a faixa passa a considerar o valor total do projeto — comportamento
  desejado.

### `src/lib/pricing/calc.ts`

`calcQuoteTotal` ganha o parâmetro `multiplier` (padrão 1) e retorna também o
valor por unidade:

```ts
export function calcQuoteTotal(
  lineTotals: number[],
  discount = 0,
  multiplier = 1,
): { subtotal: number; unitTotal: number; total: number }
```

- Valida `Number.isInteger(multiplier) && multiplier >= 1`, senão `PricingError`.
- `subtotal` = soma das linhas (por unidade).
- `unitTotal` = `round2(subtotal − discount)`.
- `total` = `round2(unitTotal × multiplier)`.
- Mantém as validações de desconto (não negativo, não maior que o subtotal).
- Com `multiplier = 1`, `total === unitTotal` — compatível com o comportamento
  atual.

### `src/lib/pricing/display.ts`

`quoteDisplayFooter` ganha `multiplier` (padrão 1) e novos campos:

```ts
export interface QuoteFooter {
  subtotal: number      // subtotal bruto por unidade
  discount: number      // desconto + ajustes negativos, por unidade
  unitTotal: number     // valor de uma unidade (subtotalNet − discount)
  multiplier: number
  total: number         // unitTotal × multiplier
  hasDeduction: boolean
}
```

### Editor (`src/components/quote/quote-editor.tsx`)

- Novo estado `multiplierStr` (default do quote ou `'1'`).
- Campo **"Multiplicador (casas)"** ao lado do Desconto (`inputMode="numeric"`).
- `computed` passa o multiplicador para `calcQuoteTotal`/`quoteDisplayFooter`.
- Rodapé:
  - Se `multiplier > 1`: mostra "Valor por unidade: R$ X", "Multiplicador: N
    casas" e "Total (N casas): R$ Y".
  - Se `multiplier === 1`: exibição atual (apenas Total).
- `onSave` envia `multiplier` (inteiro) para `saveQuote`.
- O aviso de divergência continua comparando `computed.total` com
  `quote.savedTotal` (ambos totais multiplicados).

### Apresentação (`src/components/presentation/quote-presentation.tsx`)

- Lê `Number(quote.multiplier ?? 1)` e passa ao `quoteDisplayFooter`.
- Quando `multiplier > 1`, o bloco final exibe:
  - "Valor por unidade: R$ X"
  - "N casas × R$ X"
  - "Total: R$ Y" (multiplicado)
- Vale tanto para a apresentação interna quanto para o PDF público
  (`/o/[token]`) — o multiplicador é informação do cliente.

---

## Feature 2 — Duplicar item dentro do orçamento

Somente client-side, em `quote-editor.tsx`.

- Botão **"duplicar"** ao lado de "editar"/"remover" em cada item.
- Ao clicar: insere uma cópia do `ItemSelection` **logo após** o original no
  array `items` e abre o formulário de edição já preenchido com a cópia
  (`setEditing(i + 1)`), para o usuário ajustar antes de confirmar.
- Cancelar a edição da cópia recém-criada remove a cópia (não deixa duplicata
  não intencional). Confirmar mantém.
- Nada é persistido até "Salvar orçamento".

---

## Feature 3 — Clonar orçamento completo

### RPC (migration 0008)

```sql
create or replace function public.clone_quote(p_source_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new_id uuid;
  v_days int;
begin
  select coalesce(default_validity_days, 15) into v_days
    from company_settings where id = 1;

  insert into quotes (customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, status, created_by, valid_until)
  select 'Cópia de — ' || customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, 'rascunho', auth.uid(),
    (now() + make_interval(days => v_days))::date
  from quotes where id = p_source_id
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'Orçamento não encontrado';
  end if;

  insert into quote_items (quote_id, product_type_id, product_name, model_id,
    model_name, model_photo_url, width_m, height_m, area_m2, qty, unit_base_price,
    selected_options, unit_total, line_total, sort_order)
  select v_new_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price,
    selected_options, unit_total, line_total, sort_order
  from quote_items where quote_id = p_source_id;

  return v_new_id;
end;
$$;

revoke execute on function public.clone_quote(uuid) from public, anon;
grant execute on function public.clone_quote(uuid) to authenticated;
```

- `token` e `id` usam os defaults da tabela (novos automaticamente).
- `security invoker` + RLS garante que só clona orçamentos que o usuário pode ler.

### Server action (`src/app/(app)/orcamentos/actions.ts`)

```ts
export async function cloneQuote(id: string): Promise<void> {
  const { supabase } = await getProfile()
  const { data, error } = await supabase.rpc('clone_quote', { p_source_id: id })
  if (error) throw new Error(error.message)
  revalidatePath('/')
  redirect(`/orcamentos/${data}`)
}
```

### UI — tela de detalhe (`src/app/(app)/orcamentos/[id]/page.tsx`)

- Botão **"Clonar"** (ao lado de "Apresentar / Compartilhar"), dentro de um
  `<form action={cloneQuote.bind(null, quote.id)}>` usando `SubmitButton`.
- Após clonar, o `redirect` leva o usuário direto para a cópia (rascunho).

---

## Atualizações de suporte

### `save_quote_atomic` (migration 0008)

Adicionar a gravação de `multiplier` no update do cabeçalho:

```sql
multiplier = coalesce((p_quote->>'multiplier')::int, 1),
```

Recriar a função com `create or replace` (mesma assinatura).

### `saveQuote` (`actions.ts`)

- `SaveQuoteInput` ganha `multiplier: number`.
- Valida/normaliza (`Number.isInteger`, `>= 1`; senão erro amigável).
- Passa `multiplier` para `calcQuoteTotal`.
- Inclui `multiplier` no `quoteRow` (update e insert inicial).

### `ExistingQuote` / detalhe

- `ExistingQuote` ganha `multiplier: number`.
- `page.tsx` monta `multiplier: Number(quote.multiplier ?? 1)`.

---

## Testes

### `src/lib/pricing/calc.test.ts`

- `calcQuoteTotal` agora retorna `unitTotal`; ajustar asserts existentes para
  incluir `unitTotal`.
- Novos casos:
  - `calcQuoteTotal([300, 1260], 60, 3)` → `subtotal 1560`, `unitTotal 1500`,
    `total 4500`.
  - `multiplier` padrão 1 → `total === unitTotal`.
  - `multiplier` não inteiro ou `< 1` → `PricingError`.

### `src/lib/pricing/display.test.ts`

- Rodapé com `multiplier > 1` retorna `unitTotal` e `total` corretos.
- `multiplier = 1` mantém comportamento atual.

## Riscos

- Orçamentos antigos têm `multiplier` default 1 → sem impacto.
- `quotes.total` passa a ser o total multiplicado; nenhuma tela hoje soma
  `total` entre orçamentos assumindo valor por unidade (dashboard usa o total
  como valor do orçamento, o que continua correto).
