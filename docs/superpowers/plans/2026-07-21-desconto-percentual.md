# Desconto Percentual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o desconto geral do orçamento seja dado por porcentagem (viva, recalculada sobre o subtotal) além do valor fixo em R$.

**Architecture:** Nova coluna `discount_type` em `quotes` torna a coluna `discount` polivalente (R$ quando `valor`, porcentagem quando `percent`). A resolução para R$ acontece no cálculo (`calcQuoteTotal` via `discountAmount`) e na exibição (`quoteDisplayFooter`), a partir do subtotal líquido. O editor ganha um campo único com toggle R$ ⇄ %.

**Tech Stack:** Next.js (App Router), TypeScript, React, Supabase (Postgres + RPC plpgsql), Vitest.

## Global Constraints

- **Base da porcentagem:** subtotalNet (soma dos `line_total`, já com ajustes de item). Os 10% incidem sobre esse líquido (Jeito B).
- **`discount` polivalente:** `discount_type='valor'` → R$; `discount_type='percent'` → porcentagem (ex.: `10.00`).
- **Compatibilidade:** orçamentos antigos herdam `discount_type='valor'` pelo default — comportamento idêntico ao atual, sem migração de dados.
- **Documentos do cliente:** mostram a porcentagem (ex.: "Desconto (10%): −R$ Y"); quando há desconto % **e** ajuste negativo de item, exibem duas linhas separadas.
- **Desconto em R$ (`valor`):** exibição inalterada — funde desconto geral + ajustes negativos numa linha só.
- `pnpm`/`npm` test roda com `npm test` (vitest). Nada de novas dependências.
- Moeda pt-BR via `formatBRL`; porcentagem pt-BR via novo `formatPercent`.

## File Structure

- `supabase/migrations/0026_desconto_tipo.sql` — **criar**: coluna `discount_type` + recria RPCs `save_quote_atomic` e `clone_quote`.
- `src/lib/pricing/calc.ts` — **modificar**: nova `discountAmount`, nova assinatura de `calcQuoteTotal`.
- `src/lib/pricing/calc.test.ts` — **modificar**: casos de `discountAmount` e assinatura nova.
- `src/lib/format.ts` — **modificar**: novo `formatPercent`.
- `src/lib/format.test.ts` — **modificar**: casos de `formatPercent`.
- `src/lib/pricing/display.ts` — **modificar**: `quoteDisplayFooter` com `discountType`, campos novos no `QuoteFooter`.
- `src/lib/pricing/display.test.ts` — **modificar**: casos percent/valor.
- `src/app/(app)/orcamentos/actions.ts` — **modificar**: `SaveQuoteInput.discountType`, `quoteRow.discount_type`, chamada de `calcQuoteTotal`.
- `src/components/quote/quote-editor.tsx` — **modificar**: `ExistingQuote.discount_type`, estado + toggle, rodapé em duas linhas.
- `src/app/(app)/orcamentos/[id]/page.tsx` — **modificar**: mapear `discount_type` no `ExistingQuote`.
- `src/components/presentation/quote-presentation.tsx` — **modificar**: chamada + rodapé.
- `src/components/contract/contract-document.tsx` — **modificar**: chamada + rodapé (tfoot).
- `src/components/receipt/recibo-document.tsx` — **modificar**: chamada + rodapé.
- `src/lib/whatsapp-message.ts` — **modificar**: `QuoteInput.discount_type`, chamada.
- `src/lib/whatsapp-message.test.ts` — **modificar**: `baseQuote` com `discount_type`.
- `src/app/(app)/orcamentos/[id]/apresentacao/page.tsx` — **modificar**: passar `discount_type` no `buildQuoteMessage`.

---

### Task 1: Migration — coluna `discount_type` + RPCs

**Files:**
- Create: `supabase/migrations/0026_desconto_tipo.sql`

**Interfaces:**
- Produces: coluna `quotes.discount_type text not null default 'valor'`; RPCs `save_quote_atomic(uuid, jsonb, jsonb)` e `clone_quote(uuid)` lendo/gravando `discount_type`.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/0026_desconto_tipo.sql` com o conteúdo abaixo. As RPCs são recriadas a partir dos corpos atuais (migration `0021`), adicionando só `discount_type`.

```sql
-- Desconto geral pode ser valor fixo (R$) ou porcentagem.
-- discount_type='valor'  → coluna discount guarda R$
-- discount_type='percent'→ coluna discount guarda a porcentagem (ex: 10.00)

alter table quotes
  add column discount_type text not null default 'valor'
  check (discount_type in ('valor', 'percent'));

create or replace function public.save_quote_atomic(
  p_quote_id uuid, p_quote jsonb, p_items jsonb
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_client_id uuid;
  v_company_id uuid;
begin
  select company_id into v_company_id from quotes where id = p_quote_id;
  if v_company_id is null then
    raise exception 'Orçamento não encontrado';
  end if;

  v_client_id := nullif(p_quote->>'client_id', '')::uuid;
  if v_client_id is not null
     and not exists (select 1 from clients where id = v_client_id) then
    raise exception 'Cliente inválido';
  end if;
  if v_client_id is null and trim(coalesce(p_quote->>'customer_name', '')) <> '' then
    insert into clients (name, phone, company_id)
    values (trim(p_quote->>'customer_name'), coalesce(p_quote->>'customer_phone', ''), v_company_id)
    returning id into v_client_id;
  end if;

  update quotes set
    client_id      = v_client_id,
    customer_name  = p_quote->>'customer_name',
    customer_phone = coalesce(p_quote->>'customer_phone', ''),
    site_address   = coalesce(p_quote->>'site_address', ''),
    discount       = (p_quote->>'discount')::numeric,
    discount_type  = coalesce(p_quote->>'discount_type', 'valor'), -- novo
    subtotal       = (p_quote->>'subtotal')::numeric,
    total          = (p_quote->>'total')::numeric,
    multiplier     = coalesce((p_quote->>'multiplier')::int, 1),
    delivery_date  = nullif(p_quote->>'delivery_date', '')::date,
    general_note   = coalesce(p_quote->>'general_note', ''),
    updated_at     = now()
  where id = p_quote_id;

  delete from quote_items where quote_id = p_quote_id;

  insert into quote_items (quote_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price, selected_options,
    unit_total, line_total, extra_value, note, sort_order, company_id)
  select p_quote_id,
    nullif(i->>'product_type_id', '')::uuid,
    i->>'product_name',
    nullif(i->>'model_id', '')::uuid,
    i->>'model_name',
    i->>'model_photo_url',
    (i->>'width_m')::numeric,
    (i->>'height_m')::numeric,
    (i->>'area_m2')::numeric,
    (i->>'qty')::int,
    (i->>'unit_base_price')::numeric,
    coalesce(i->'selected_options', '[]'::jsonb),
    (i->>'unit_total')::numeric,
    (i->>'line_total')::numeric,
    coalesce((i->>'extra_value')::numeric, 0),
    coalesce(i->>'note', ''),
    (ord - 1)::int,
    v_company_id
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);
end;
$$;
revoke execute on function public.save_quote_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote_atomic(uuid, jsonb, jsonb) to authenticated;

create or replace function public.clone_quote(p_source_id uuid)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_new_id uuid;
  v_days int;
  v_company_id uuid;
begin
  select company_id into v_company_id from quotes where id = p_source_id;
  if v_company_id is null then
    raise exception 'Orçamento não encontrado';
  end if;

  select coalesce(default_validity_days, 15) into v_days
    from companies where id = v_company_id;

  insert into quotes (customer_name, customer_phone, site_address, discount, discount_type,
    subtotal, total, multiplier, status, created_by, valid_until, delivery_date,
    client_id, company_id, general_note)
  select 'Cópia de — ' || customer_name, customer_phone, site_address, discount, discount_type,
    subtotal, total, multiplier, 'rascunho', auth.uid(),
    (now() + make_interval(days => v_days))::date, null, client_id, company_id,
    general_note
  from quotes where id = p_source_id
  returning id into v_new_id;

  insert into quote_items (quote_id, product_type_id, product_name, model_id,
    model_name, model_photo_url, width_m, height_m, area_m2, qty, unit_base_price,
    selected_options, unit_total, line_total, extra_value, note, sort_order, company_id)
  select v_new_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price,
    selected_options, unit_total, line_total, extra_value, note, sort_order, company_id
  from quote_items where quote_id = p_source_id;

  return v_new_id;
end;
$$;
revoke execute on function public.clone_quote(uuid) from public, anon;
grant execute on function public.clone_quote(uuid) to authenticated;
```

- [ ] **Step 2: Verificar sintaxe SQL**

Run: `grep -c "create or replace function" supabase/migrations/0026_desconto_tipo.sql`
Expected: `2`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0026_desconto_tipo.sql
git commit -m "feat(db): coluna discount_type e RPCs com desconto percentual"
```

---

### Task 2: `discountAmount` + nova assinatura de `calcQuoteTotal`

**Files:**
- Modify: `src/lib/pricing/calc.ts`
- Test: `src/lib/pricing/calc.test.ts`

**Interfaces:**
- Produces:
  - `discountAmount(subtotalNet: number, type: 'valor' | 'percent', value: number): number` — resolve o desconto em R$; lança `PricingError` para `percent` fora de 0–100 ou `valor` negativo/maior que o subtotal.
  - `calcQuoteTotal(lineTotals: number[], discountType?: 'valor' | 'percent', discountValue?: number, multiplier?: number): { subtotal: number; unitTotal: number; total: number }`.

- [ ] **Step 1: Atualizar os testes de `calcQuoteTotal` e adicionar os de `discountAmount`**

Em `src/lib/pricing/calc.test.ts`: trocar o import da linha 2 e substituir o bloco `describe('calcQuoteTotal', ...)` (linhas 157–178) por:

```ts
// linha 2:
import { PricingError, calcItem, calcQuoteTotal, discountAmount, round2 } from './calc'
```

```ts
describe('discountAmount', () => {
  it('percent: aplica a porcentagem sobre o subtotal líquido', () => {
    expect(discountAmount(1000, 'percent', 10)).toBe(100)
    expect(discountAmount(1400, 'percent', 5)).toBe(70)
  })
  it('percent: arredonda em fronteira de dinheiro', () => {
    expect(discountAmount(333.7, 'percent', 12.5)).toBe(41.71) // 41.7125
  })
  it('percent: 0 e 100 são válidos', () => {
    expect(discountAmount(1000, 'percent', 0)).toBe(0)
    expect(discountAmount(1000, 'percent', 100)).toBe(1000)
  })
  it('percent: rejeita fora de 0–100', () => {
    expect(() => discountAmount(1000, 'percent', -1)).toThrow(PricingError)
    expect(() => discountAmount(1000, 'percent', 101)).toThrow(PricingError)
  })
  it('valor: devolve o próprio valor em R$', () => {
    expect(discountAmount(1000, 'valor', 250)).toBe(250)
  })
  it('valor: rejeita negativo ou maior que o subtotal', () => {
    expect(() => discountAmount(1000, 'valor', -1)).toThrow(PricingError)
    expect(() => discountAmount(1000, 'valor', 1001)).toThrow(PricingError)
  })
})

describe('calcQuoteTotal', () => {
  it('soma linhas e aplica desconto em valor', () => {
    expect(calcQuoteTotal([300, 1260], 'valor', 60)).toEqual({ subtotal: 1560, unitTotal: 1500, total: 1500 })
  })
  it('aplica desconto percentual sobre o subtotal', () => {
    expect(calcQuoteTotal([300, 1260], 'percent', 10)).toEqual({ subtotal: 1560, unitTotal: 1404, total: 1404 })
  })
  it('desconto padrão 0 (tipo valor)', () => {
    expect(calcQuoteTotal([100.005]).total).toBe(100.01)
  })
  it('rejeita desconto valor negativo ou maior que subtotal', () => {
    expect(() => calcQuoteTotal([100], 'valor', -1)).toThrow(PricingError)
    expect(() => calcQuoteTotal([100], 'valor', 101)).toThrow(PricingError)
  })
  it('rejeita percentual fora de 0–100', () => {
    expect(() => calcQuoteTotal([100], 'percent', 101)).toThrow(PricingError)
  })
  it('multiplicador multiplica o valor por unidade', () => {
    expect(calcQuoteTotal([300, 1260], 'valor', 60, 3)).toEqual({ subtotal: 1560, unitTotal: 1500, total: 4500 })
  })
  it('multiplicador 1 é o padrão', () => {
    expect(calcQuoteTotal([100]).total).toBe(calcQuoteTotal([100], 'valor', 0, 1).total)
  })
  it('rejeita multiplicador não inteiro ou menor que 1', () => {
    expect(() => calcQuoteTotal([100], 'valor', 0, 0)).toThrow(PricingError)
    expect(() => calcQuoteTotal([100], 'valor', 0, 1.5)).toThrow(PricingError)
  })
})
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npm test -- src/lib/pricing/calc.test.ts`
Expected: FAIL — `discountAmount` não existe / assinatura de `calcQuoteTotal` incompatível.

- [ ] **Step 3: Implementar `discountAmount` e trocar `calcQuoteTotal`**

Em `src/lib/pricing/calc.ts`, substituir a função `calcQuoteTotal` (linhas 69–83) por:

```ts
export function discountAmount(
  subtotalNet: number,
  type: 'valor' | 'percent',
  value: number,
): number {
  if (type === 'percent') {
    if (value < 0 || value > 100) {
      throw new PricingError('Percentual de desconto deve estar entre 0 e 100')
    }
    return round2(subtotalNet * value / 100)
  }
  if (value < 0) throw new PricingError('Desconto não pode ser negativo')
  if (value > subtotalNet) throw new PricingError('Desconto não pode ser maior que o subtotal')
  return round2(value)
}

export function calcQuoteTotal(
  lineTotals: number[],
  discountType: 'valor' | 'percent' = 'valor',
  discountValue = 0,
  multiplier = 1,
): { subtotal: number; unitTotal: number; total: number } {
  const subtotal = round2(lineTotals.reduce((a, b) => a + b, 0))
  const discount = discountAmount(subtotal, discountType, discountValue)
  if (!Number.isInteger(multiplier) || multiplier < 1) {
    throw new PricingError('Multiplicador deve ser um número inteiro maior ou igual a 1')
  }
  const unitTotal = round2(subtotal - discount)
  const total = round2(unitTotal * multiplier)
  return { subtotal, unitTotal, total }
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npm test -- src/lib/pricing/calc.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/calc.ts src/lib/pricing/calc.test.ts
git commit -m "feat(pricing): discountAmount e calcQuoteTotal com tipo de desconto"
```

---

### Task 3: `formatPercent` + `quoteDisplayFooter` com tipo

**Files:**
- Modify: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`
- Modify: `src/lib/pricing/display.ts`
- Test: `src/lib/pricing/display.test.ts`

**Interfaces:**
- Consumes: `discountAmount` de Task 2 (para conferência de valores nos testes; o footer computa o R$ inline, sem lançar).
- Produces:
  - `formatPercent(v: number): string` — ex.: `formatPercent(10) === '10%'`, `formatPercent(12.5) === '12,5%'`.
  - `quoteDisplayFooter(subtotalNet: number, discountType: 'valor' | 'percent', discountValue: number, extraValues: number[], multiplier?: number): QuoteFooter`.
  - `QuoteFooter` com campos: `subtotal`, `discount`, `itemAdjustment`, `discountPercentLabel: string | null`, `unitTotal`, `multiplier`, `total`, `hasDeduction`.

- [ ] **Step 1: Teste de `formatPercent`**

Adicionar ao fim de `src/lib/format.test.ts` (e incluir `formatPercent` no import do `@/lib/format` / `./format` já usado no arquivo):

```ts
describe('formatPercent', () => {
  it('inteiro sem casas decimais', () => {
    expect(formatPercent(10)).toBe('10%')
  })
  it('decimal com vírgula pt-BR', () => {
    expect(formatPercent(12.5)).toBe('12,5%')
  })
  it('zero', () => {
    expect(formatPercent(0)).toBe('0%')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/format.test.ts`
Expected: FAIL — `formatPercent` não existe.

- [ ] **Step 3: Implementar `formatPercent`**

Adicionar em `src/lib/format.ts`:

```ts
const pct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export function formatPercent(v: number): string {
  return `${pct.format(v)}%`
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Atualizar os testes de `quoteDisplayFooter`**

Em `src/lib/pricing/display.test.ts`, substituir o bloco `describe('quoteDisplayFooter', ...)` (linhas 20–71) por (a assinatura agora tem `discountType` na 2ª posição):

```ts
describe('quoteDisplayFooter — desconto em valor', () => {
  it('soma ajustes negativos ao desconto e mantém total', () => {
    const f = quoteDisplayFooter(1400, 'valor', 50, [-100, 0])
    expect(f.subtotal).toBe(1500)
    expect(f.discount).toBe(150) // 50 + 100 (fundido)
    expect(f.itemAdjustment).toBe(0)
    expect(f.discountPercentLabel).toBeNull()
    expect(f.total).toBe(1350)
    expect(f.hasDeduction).toBe(true)
  })
  it('sem desconto e sem ajuste negativo: sem dedução', () => {
    const f = quoteDisplayFooter(1000, 'valor', 0, [0, 50])
    expect(f.discount).toBe(0)
    expect(f.hasDeduction).toBe(false)
  })
  it('só ajuste negativo já mostra dedução', () => {
    const f = quoteDisplayFooter(900, 'valor', 0, [-100])
    expect(f.subtotal).toBe(1000)
    expect(f.discount).toBe(100)
    expect(f.hasDeduction).toBe(true)
  })
  it('multiplicador > 1: unitTotal por casa e total multiplicado', () => {
    const f = quoteDisplayFooter(1400, 'valor', 50, [-100, 0], 3)
    expect(f.unitTotal).toBe(1350)
    expect(f.total).toBe(4050)
    expect(f.discount).toBe(150)
  })
})

describe('quoteDisplayFooter — desconto percentual', () => {
  it('sem ajuste: uma linha de desconto com rótulo de %', () => {
    const f = quoteDisplayFooter(1000, 'percent', 10, [0])
    expect(f.discount).toBe(100) // 10% de 1000
    expect(f.itemAdjustment).toBe(0)
    expect(f.discountPercentLabel).toBe('10%')
    expect(f.subtotal).toBe(1000)
    expect(f.unitTotal).toBe(900)
    expect(f.total).toBe(900)
    expect(f.hasDeduction).toBe(true)
  })
  it('com ajuste negativo: linhas separadas (ajuste e desconto %)', () => {
    // subtotalNet 900 (item bruto 1000, ajuste −100); 10% de 900 = 90
    const f = quoteDisplayFooter(900, 'percent', 10, [-100])
    expect(f.subtotal).toBe(1000) // bruto
    expect(f.itemAdjustment).toBe(100) // linha separada
    expect(f.discount).toBe(90) // 10% do líquido
    expect(f.discountPercentLabel).toBe('10%')
    expect(f.unitTotal).toBe(810) // 900 − 90
    expect(f.total).toBe(810)
    expect(f.hasDeduction).toBe(true)
  })
  it('0%: sem dedução mesmo sem ajuste', () => {
    const f = quoteDisplayFooter(1000, 'percent', 0, [0])
    expect(f.discount).toBe(0)
    expect(f.itemAdjustment).toBe(0)
    expect(f.hasDeduction).toBe(false)
  })
})
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npm test -- src/lib/pricing/display.test.ts`
Expected: FAIL — assinatura antiga.

- [ ] **Step 7: Reescrever `quoteDisplayFooter`**

Substituir o `QuoteFooter` (interface) e a função `quoteDisplayFooter` em `src/lib/pricing/display.ts` (linhas 11–48) por:

```ts
export interface QuoteFooter {
  /** subtotal bruto (ajustes negativos somados de volta) */
  subtotal: number
  /** valor do desconto exibido na linha "Desconto" (R$) */
  discount: number
  /** ajuste negativo dos itens, em linha separada (só no modo percent; 0 caso contrário) */
  itemAdjustment: number
  /** rótulo da porcentagem, ex "10%"; null no modo valor */
  discountPercentLabel: string | null
  /** valor líquido de uma unidade (subtotalNet − desconto R$) */
  unitTotal: number
  /** número de unidades iguais */
  multiplier: number
  /** total final — unitTotal × multiplier */
  total: number
  /** se há alguma dedução a exibir */
  hasDeduction: boolean
}

/**
 * Consolida o rodapé. No modo "valor" o abatimento dos itens é somado ao
 * desconto numa linha só (comportamento histórico). No modo "percent" a
 * porcentagem incide sobre o subtotal líquido e o abatimento dos itens vai
 * numa linha própria ("Ajuste dos itens"), separada do "Desconto (10%)".
 * A função é pura e não lança: a validação do percentual vive em `discountAmount`.
 */
export function quoteDisplayFooter(
  subtotalNet: number,
  discountType: 'valor' | 'percent',
  discountValue: number,
  extraValues: number[],
  multiplier = 1,
): QuoteFooter {
  const negAdj = round2(-extraValues.reduce((a, v) => a + Math.min(v ?? 0, 0), 0))
  const discountRs = discountType === 'percent'
    ? round2(subtotalNet * discountValue / 100)
    : round2(discountValue)
  const unitTotal = round2(subtotalNet - discountRs)
  const total = round2(unitTotal * multiplier)
  const subtotal = round2(subtotalNet + negAdj)

  if (discountType === 'percent') {
    return {
      subtotal,
      discount: discountRs,
      itemAdjustment: negAdj,
      discountPercentLabel: formatPercent(discountValue),
      unitTotal,
      multiplier,
      total,
      hasDeduction: discountRs > 0 || negAdj > 0,
    }
  }

  const merged = round2(discountRs + negAdj)
  return {
    subtotal,
    discount: merged,
    itemAdjustment: 0,
    discountPercentLabel: null,
    unitTotal,
    multiplier,
    total,
    hasDeduction: merged > 0,
  }
}
```

Adicionar o import no topo de `src/lib/pricing/display.ts` (linha 1 já importa `round2` de `./calc`):

```ts
import { round2 } from './calc'
import { formatPercent } from '@/lib/format'
```

- [ ] **Step 8: Rodar e ver passar**

Run: `npm test -- src/lib/pricing/display.test.ts src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/lib/pricing/display.ts src/lib/pricing/display.test.ts
git commit -m "feat(pricing): formatPercent e quoteDisplayFooter com tipo de desconto"
```

---

### Task 4: Editor + action — toggle R$/% e persistência

**Files:**
- Modify: `src/app/(app)/orcamentos/actions.ts`
- Modify: `src/components/quote/quote-editor.tsx`
- Modify: `src/app/(app)/orcamentos/[id]/page.tsx:51-59`

**Interfaces:**
- Consumes: `calcQuoteTotal(lineTotals, discountType, discountValue, multiplier)` e `quoteDisplayFooter(subtotalNet, discountType, discountValue, extraValues, multiplier)` de Tasks 2–3; RPC de Task 1.
- Produces: `SaveQuoteInput.discountType: 'valor' | 'percent'`; `ExistingQuote.discount_type: 'valor' | 'percent'`.

- [ ] **Step 1: Atualizar `actions.ts`**

Em `src/app/(app)/orcamentos/actions.ts`:

Adicionar o campo à interface (após `discount: number` na linha 17):

```ts
  discount: number
  discountType: 'valor' | 'percent'
```

Trocar a chamada de `calcQuoteTotal` (linha 43):

```ts
    const { subtotal, total } = calcQuoteTotal(
      snapshots.map(s => s.line_total), input.discountType, input.discount, input.multiplier)
```

Adicionar `discount_type` ao `quoteRow` (após `discount: input.discount,` na linha 50):

```ts
      discount: input.discount,
      discount_type: input.discountType,
```

- [ ] **Step 2: Atualizar o mapeamento em `page.tsx`**

Em `src/app/(app)/orcamentos/[id]/page.tsx`, na construção do `existing` (linha 54), adicionar `discount_type` logo após `discount`:

```ts
    site_address: quote.site_address, discount: Number(quote.discount),
    discount_type: ((quote as any).discount_type ?? 'valor') as 'valor' | 'percent',
```

- [ ] **Step 3: Atualizar o editor — tipo, estado e save**

Em `src/components/quote/quote-editor.tsx`:

Adicionar à interface `ExistingQuote` (após `discount: number` na linha 24):

```ts
  discount: number
  discount_type: 'valor' | 'percent'
```

Adicionar o estado (após `discountStr` na linha 47). O editor **não** precisa importar `formatPercent` — o rótulo da porcentagem já chega pronto em `footer.discountPercentLabel`.

```ts
  const [discountStr, setDiscountStr] = useState(quote?.discount ? String(quote.discount) : '')
  const [discountType, setDiscountType] = useState<'valor' | 'percent'>(quote?.discount_type ?? 'valor')
```

No `useMemo` de cálculo (linhas 67, 71, 73), usar o tipo:

```ts
    const discount = discountStr ? parseDecimal(discountStr) : 0
    const multiplier = Math.max(1, Math.trunc(Number(multiplierStr)) || 1)
    let totals = { subtotal: 0, unitTotal: 0, total: 0 }
    let totalError = ''
    try { totals = calcQuoteTotal(valid.map(s => s.line_total), discountType, discount, multiplier) }
    catch (e) { totalError = e instanceof PricingError ? e.message : 'Erro' }
    const footer = quoteDisplayFooter(totals.subtotal, discountType, discount, valid.map(s => s.extra_value), multiplier)
```

E incluir `discountType` na lista de dependências do `useMemo` (linha 75):

```ts
  }, [items, products, discountStr, discountType, multiplierStr])
```

No `onSave` (linha 83), enviar o tipo:

```ts
      discount: discountStr ? parseDecimal(discountStr) : 0,
      discountType,
```

- [ ] **Step 4: Atualizar o campo de desconto (UI) no editor**

Substituir o bloco do campo de desconto (linhas 184–187) por um input com toggle R$ ⇄ %:

```tsx
        <div className="flex items-center gap-2">
          <Label className="shrink-0">Desconto</Label>
          <Input inputMode="decimal" value={discountStr}
            onChange={e => setDiscountStr(e.target.value)} className="w-28" />
          <div className="flex overflow-hidden rounded border">
            <button type="button"
              className={`px-3 py-1 text-sm ${discountType === 'valor' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
              onClick={() => setDiscountType('valor')}>R$</button>
            <button type="button"
              className={`px-3 py-1 text-sm ${discountType === 'percent' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
              onClick={() => setDiscountType('percent')}>%</button>
          </div>
        </div>
```

- [ ] **Step 5: Atualizar o rodapé do editor (duas linhas)**

Substituir o bloco `{computed.footer.hasDeduction && (...)}` (linhas 193–195) por:

```tsx
        {computed.footer.itemAdjustment > 0 && (
          <p className="text-sm text-green-700">Ajuste dos itens: −{formatBRL(computed.footer.itemAdjustment)}</p>
        )}
        {computed.footer.discount > 0 && (
          <p className="text-sm text-green-700">
            Desconto{computed.footer.discountPercentLabel ? ` (${computed.footer.discountPercentLabel})` : ''}: −{formatBRL(computed.footer.discount)}
          </p>
        )}
```

- [ ] **Step 6: Verificar tipo e lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/orcamentos/actions.ts src/app/\(app\)/orcamentos/\[id\]/page.tsx src/components/quote/quote-editor.tsx
git commit -m "feat(orcamento): campo de desconto com toggle R\$ e porcentagem"
```

---

### Task 5: Propagar tipo aos documentos do cliente

**Files:**
- Modify: `src/components/presentation/quote-presentation.tsx:10-15,45-51`
- Modify: `src/components/contract/contract-document.tsx:32-37,121-132`
- Modify: `src/components/receipt/recibo-document.tsx:29-34,108-113`
- Modify: `src/lib/whatsapp-message.ts`
- Test: `src/lib/whatsapp-message.test.ts`
- Modify: `src/app/(app)/orcamentos/[id]/apresentacao/page.tsx:30-36`

**Interfaces:**
- Consumes: `quoteDisplayFooter(subtotalNet, discountType, discountValue, extraValues, multiplier)` de Task 3.

- [ ] **Step 1: Atualizar teste do WhatsApp**

Em `src/lib/whatsapp-message.test.ts`, trocar a `baseQuote` (linha 4) para incluir o tipo:

```ts
const baseQuote = { customer_name: 'Maria', subtotal: 1000, discount: 0, discount_type: 'valor' as const }
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/whatsapp-message.test.ts`
Expected: FAIL — `QuoteInput` ainda não tem `discount_type` (erro de tipo ao rodar via vitest/tsc) ou a chamada de `quoteDisplayFooter` está com assinatura antiga.

- [ ] **Step 3: Atualizar `whatsapp-message.ts`**

Em `src/lib/whatsapp-message.ts`: adicionar o campo à interface `QuoteInput` (após `discount: number` na linha 7):

```ts
  discount: number
  discount_type: 'valor' | 'percent'
```

Trocar a chamada de `quoteDisplayFooter` (linha 24):

```ts
  const footer = quoteDisplayFooter(quote.subtotal, quote.discount_type, quote.discount, extraValues, multiplier)
```

(A mensagem do WhatsApp não exibe linha de desconto hoje; a mudança só garante `unitTotal`/`total` corretos no modo percent.)

- [ ] **Step 4: Atualizar a chamada em `apresentacao/page.tsx`**

Em `src/app/(app)/orcamentos/[id]/apresentacao/page.tsx`, no objeto passado a `buildQuoteMessage` (após `discount: Number(quote.discount),` na linha 34):

```ts
      discount: Number(quote.discount),
      discount_type: ((quote as any).discount_type ?? 'valor') as 'valor' | 'percent',
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- src/lib/whatsapp-message.test.ts`
Expected: PASS.

- [ ] **Step 6: Atualizar `quote-presentation.tsx`**

Trocar a chamada de `quoteDisplayFooter` (linhas 10–15):

```tsx
  const footer = quoteDisplayFooter(
    Number(quote.subtotal),
    (quote.discount_type ?? 'valor') as 'valor' | 'percent',
    Number(quote.discount),
    items.map(it => Number(it.extra_value ?? 0)),
    Number(quote.multiplier ?? 1),
  )
```

Trocar o rodapé (linhas 46–51) para as duas linhas:

```tsx
        {footer.hasDeduction && (
          <>
            <p className="text-sm text-muted-foreground">Subtotal: {formatBRL(footer.subtotal)}</p>
            {footer.itemAdjustment > 0 && (
              <p className="text-sm text-green-700">Ajuste dos itens: −{formatBRL(footer.itemAdjustment)}</p>
            )}
            {footer.discount > 0 && (
              <p className="text-sm text-green-700">
                Desconto{footer.discountPercentLabel ? ` (${footer.discountPercentLabel})` : ''}: −{formatBRL(footer.discount)}
              </p>
            )}
          </>
        )}
```

- [ ] **Step 7: Atualizar `contract-document.tsx`**

Trocar a chamada de `quoteDisplayFooter` (linhas 32–37):

```tsx
  const footer = quoteDisplayFooter(
    Number(quote.subtotal),
    (quote.discount_type ?? 'valor') as 'valor' | 'percent',
    Number(quote.discount),
    items.map(it => Number(it.extra_value ?? 0)),
    Number(quote.multiplier ?? 1),
  )
```

Trocar o `tfoot` (linhas 121–132) para incluir a linha de ajuste separada:

```tsx
            {footer.hasDeduction && (
              <>
                <tr>
                  <td colSpan={5} className="border border-border px-2 py-1 text-right text-muted-foreground">Subtotal</td>
                  <td className="border border-border px-2 py-1 text-right">{formatBRL(footer.subtotal)}</td>
                </tr>
                {footer.itemAdjustment > 0 && (
                  <tr>
                    <td colSpan={5} className="border border-border px-2 py-1 text-right text-green-700">Ajuste dos itens</td>
                    <td className="border border-border px-2 py-1 text-right text-green-700">−{formatBRL(footer.itemAdjustment)}</td>
                  </tr>
                )}
                {footer.discount > 0 && (
                  <tr>
                    <td colSpan={5} className="border border-border px-2 py-1 text-right text-green-700">
                      Desconto{footer.discountPercentLabel ? ` (${footer.discountPercentLabel})` : ''}
                    </td>
                    <td className="border border-border px-2 py-1 text-right text-green-700">−{formatBRL(footer.discount)}</td>
                  </tr>
                )}
              </>
            )}
```

- [ ] **Step 8: Atualizar `recibo-document.tsx`**

Trocar a chamada de `quoteDisplayFooter` (linhas 29–34):

```tsx
  const footer = quoteDisplayFooter(
    Number(quote.subtotal),
    (quote.discount_type ?? 'valor') as 'valor' | 'percent',
    Number(quote.discount),
    items.map(it => Number(it.extra_value ?? 0)),
    Number(quote.multiplier ?? 1),
  )
```

Trocar o rodapé (linhas 108–113):

```tsx
        {footer.hasDeduction && (
          <>
            <p className="text-sm text-muted-foreground">Subtotal: {formatBRL(footer.subtotal)}</p>
            {footer.itemAdjustment > 0 && (
              <p className="text-sm text-green-700">Ajuste dos itens: −{formatBRL(footer.itemAdjustment)}</p>
            )}
            {footer.discount > 0 && (
              <p className="text-sm text-green-700">
                Desconto{footer.discountPercentLabel ? ` (${footer.discountPercentLabel})` : ''}: −{formatBRL(footer.discount)}
              </p>
            )}
          </>
        )}
```

- [ ] **Step 9: Verificar tipo, lint e a suíte inteira**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: sem erros; todos os testes passam.

- [ ] **Step 10: Commit**

```bash
git add src/components/presentation/quote-presentation.tsx src/components/contract/contract-document.tsx src/components/receipt/recibo-document.tsx src/lib/whatsapp-message.ts src/lib/whatsapp-message.test.ts src/app/\(app\)/orcamentos/\[id\]/apresentacao/page.tsx
git commit -m "feat(documentos): exibe desconto percentual em apresentação, contrato e recibo"
```

---

## Verificação manual (após todas as tasks)

1. Aplicar a migration `0026` no Supabase (dashboard/CLI conforme o fluxo do projeto).
2. No editor de orçamento: criar um orçamento, alternar o desconto para **%**, digitar `10`. Conferir que o rodapé mostra "Desconto (10%): −R$ …" e o total recalcula ao editar itens.
3. Salvar, recarregar a página: o toggle deve voltar em **%** com o valor `10`.
4. Adicionar um ajuste negativo num item + desconto 10%: rodapé mostra duas linhas ("Ajuste dos itens" e "Desconto (10%)").
5. Abrir apresentação, contrato e recibo: a porcentagem aparece; documentos antigos (modo valor) seguem idênticos.
6. Clonar um orçamento com desconto %: a cópia mantém tipo e valor do desconto.
