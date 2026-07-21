# Desconto geral do orçamento por porcentagem ou valor

## Problema

O desconto geral do orçamento hoje só aceita um valor fixo em R$. A usuária
quer poder dar o desconto como **porcentagem** (ex.: 10%) além do valor em R$.
A porcentagem deve ficar **viva**: se os itens mudarem depois, o desconto de
10% recalcula sozinho sobre o novo subtotal.

## Decisões

- **Guarda a porcentagem (vivo)**, não converte para R$ na digitação. Precisa
  de coluna nova para o tipo do desconto.
- **Campo único no editor com toggle R$ ⇄ %.** Um desconto só — ou valor ou
  porcentagem, nunca os dois ao mesmo tempo.
- **Documentos do cliente mostram a porcentagem** (ex.: "Desconto (10%): −R$ Y").
- **Base da porcentagem: líquido pós-ajustes** (subtotalNet). Os 10% incidem
  sobre a soma dos itens já com os ajustes negativos de item aplicados.

## Modelo de dados

Migration `0026`:

- Nova coluna em `quotes`: `discount_type text not null default 'valor'`, com
  check `in ('valor','percent')`.
- A coluna `discount` (`numeric(12,2)`) passa a ser polivalente:
  - `discount_type = 'valor'` → `discount` guarda o valor em R$ (como hoje).
  - `discount_type = 'percent'` → `discount` guarda a porcentagem (ex.: `10.00`
    para 10%). `numeric(12,2)` acomoda casas decimais de %.
- Recriar as RPCs de **salvar** e de **clonar** o orçamento (base: os corpos
  atuais definidos na migration `0021_general_note.sql`) para ler/gravar
  `discount_type`:
  - No upsert: `discount_type = coalesce(p_quote->>'discount_type', 'valor')`.
  - No clone: copiar `discount_type` junto com `discount`.

Orçamentos existentes ficam com `discount_type = 'valor'` pelo default —
comportamento idêntico ao atual, sem migração de dados.

## Cálculo — `src/lib/pricing/calc.ts`

Nova função que resolve o desconto em R$ a partir do tipo:

```ts
export function discountAmount(
  subtotalNet: number,
  type: 'valor' | 'percent',
  value: number,
): number
```

- `percent`: valida `0 ≤ value ≤ 100` (senão `PricingError`), retorna
  `round2(subtotalNet * value / 100)`.
- `valor`: valida `0 ≤ value ≤ subtotalNet` (senão `PricingError`), retorna
  `value`.

`calcQuoteTotal` passa a receber `discountType` + `discountValue` (em vez do R$
já resolvido) e usa `discountAmount` internamente com `subtotalNet` como base.
A validação de desconto negativo / maior que o subtotal migra para
`discountAmount`; `calcQuoteTotal` mantém a validação do multiplicador.

Assinatura nova:

```ts
calcQuoteTotal(
  lineTotals: number[],
  discountType: 'valor' | 'percent',
  discountValue: number,
  multiplier = 1,
)
```

## Exibição — `src/lib/pricing/display.ts`

`quoteDisplayFooter` ganha `discountType` e o valor bruto do desconto (a % ou o
R$ digitado), para renderizar o rótulo e decidir a separação de linhas:

- `percent` **com** ajuste negativo de item → **duas linhas**:
  - "Ajuste dos itens: −R$ X" (soma dos ajustes negativos)
  - "Desconto (10%): −R$ Y" (a % sobre o subtotalNet)
- `percent` **sem** ajuste negativo → **uma linha**: "Desconto (10%): −R$ Y".
- `valor` → **inalterado**: funde desconto geral + ajustes negativos numa linha
  só ("Desconto: −R$ Z"), exatamente como hoje.

O `QuoteFooter` ganha os campos necessários para o consumidor montar as linhas
(ex.: `discountPercentLabel: string | null` para o "(10%)", e o valor do ajuste
de item separado quando aplicável). Consumidores só leem os campos e renderizam
— sem lógica de negócio duplicada.

## UI editor — `src/components/quote/quote-editor.tsx`

- Estado novo `discountType: 'valor' | 'percent'` (default do `quote` ou
  `'valor'`).
- Campo único de desconto com toggle R$ ⇄ % ao lado. Trocar o tipo reinterpreta
  o valor digitado (o número no input passa a significar % ou R$ conforme o
  toggle); não converte o valor automaticamente.
- `discountStr` continua sendo o texto digitado; `parseDecimal` já trata vírgula.
- `onSave` manda `discountType` no `saveQuote`.
- O `useMemo` de cálculo passa `discountType` + valor para `calcQuoteTotal` e
  `quoteDisplayFooter`.

## Propagação

- `src/app/(app)/orcamentos/actions.ts`: `SaveQuoteInput` ganha
  `discountType: 'valor' | 'percent'`; repassa ao RPC e usa a nova assinatura de
  `calcQuoteTotal`.
- `src/app/(app)/orcamentos/[id]/page.tsx`: o load mapeia
  `discount_type → discountType` no `ExistingQuote`.
- `ExistingQuote` (em `quote-editor.tsx`) ganha `discountType`.
- Os 5 consumidores do footer passam `discount_type` para `quoteDisplayFooter`:
  - `src/components/quote/quote-editor.tsx`
  - `src/components/presentation/quote-presentation.tsx`
  - `src/components/contract/contract-document.tsx`
  - `src/components/receipt/recibo-document.tsx`
  - `src/lib/whatsapp-message.ts`

## Testes

- `src/lib/pricing/calc.test.ts`:
  - `discountAmount` percent: cálculo base, arredondamento (`round2`),
    validação `> 100%` e negativo lançam `PricingError`.
  - `discountAmount` valor: inalterado (0 ≤ v ≤ subtotal, erro fora disso).
  - `calcQuoteTotal` com `percent`: total correto sobre subtotalNet.
- `src/lib/pricing/display.test.ts`:
  - `percent` + ajuste negativo → duas linhas com valores certos.
  - `percent` sem ajuste → uma linha "Desconto (10%)".
  - `valor` → fusão numa linha, comportamento atual intacto.

## Fora de escopo

- Desconto por item já existe (campo de ajuste); não muda.
- Não há preenchimento simultâneo de % e R$ — é um tipo só por orçamento.
- Sem migração de dados: orçamentos antigos herdam `'valor'` pelo default.
