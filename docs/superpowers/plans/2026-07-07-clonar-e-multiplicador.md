# Clonar orçamento, clonar item e multiplicador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir clonar um orçamento completo, duplicar um item dentro do orçamento e multiplicar o valor total por N unidades iguais (casas).

**Architecture:** Multiplicador é uma coluna nova em `quotes`; o cálculo do total passa a ser `(subtotal − desconto) × multiplicador`, com o total multiplicado guardado em `quotes.total`. Clonar orçamento é uma RPC transacional; duplicar item é client-side no editor.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres + RPC/RLS), React 19, Vitest.

**Base branch:** `feature/clonar-e-multiplicador` (já criada a partir de `build-v1`).

---

## File Structure

- `supabase/migrations/0008_clone_e_multiplicador.sql` — **criar**: coluna `multiplier`, `create or replace save_quote_atomic`, RPC `clone_quote`.
- `src/lib/pricing/calc.ts` — **modificar**: `calcQuoteTotal` ganha `multiplier` e retorna `unitTotal`.
- `src/lib/pricing/calc.test.ts` — **modificar**: ajustar asserts + casos de multiplicador.
- `src/lib/pricing/display.ts` — **modificar**: `quoteDisplayFooter` ganha `multiplier`, `unitTotal`.
- `src/lib/pricing/display.test.ts` — **modificar**: casos de multiplicador.
- `src/app/(app)/orcamentos/actions.ts` — **modificar**: `saveQuote` recebe `multiplier`; nova action `cloneQuote`.
- `src/components/quote/quote-editor.tsx` — **modificar**: campo multiplicador, rodapé, botão "duplicar".
- `src/app/(app)/orcamentos/[id]/page.tsx` — **modificar**: `ExistingQuote.multiplier`, botão "Clonar".
- `src/components/presentation/quote-presentation.tsx` — **modificar**: exibição do multiplicador.

**Comandos de verificação (repo):**
- Testes: `npm run test`
- Lint: `npm run lint`
- Build: `npm run build`

---

## Task 1: Migration — coluna multiplier, save_quote_atomic e clone_quote

**Files:**
- Create: `supabase/migrations/0008_clone_e_multiplicador.sql`

- [ ] **Step 1: Criar a migration**

Criar `supabase/migrations/0008_clone_e_multiplicador.sql` com o conteúdo exato:

```sql
-- Multiplicador de unidades iguais (ex.: condomínio com N casas) e clonagem de orçamento.

alter table quotes
  add column multiplier int not null default 1 check (multiplier >= 1);

-- Recria save_quote_atomic para gravar também o multiplicador no cabeçalho.
create or replace function public.save_quote_atomic(
  p_quote_id uuid,
  p_quote jsonb,
  p_items jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update quotes set
    customer_name  = p_quote->>'customer_name',
    customer_phone = coalesce(p_quote->>'customer_phone', ''),
    site_address   = coalesce(p_quote->>'site_address', ''),
    discount       = (p_quote->>'discount')::numeric,
    subtotal       = (p_quote->>'subtotal')::numeric,
    total          = (p_quote->>'total')::numeric,
    multiplier     = coalesce((p_quote->>'multiplier')::int, 1),
    updated_at     = now()
  where id = p_quote_id;

  if not found then
    raise exception 'Orçamento não encontrado';
  end if;

  delete from quote_items where quote_id = p_quote_id;

  insert into quote_items (quote_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price, selected_options,
    unit_total, line_total, sort_order)
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
    (ord - 1)::int
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);
end;
$$;

revoke execute on function public.save_quote_atomic(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote_atomic(uuid, jsonb, jsonb) to authenticated;

-- Clona um orçamento (cabeçalho + itens) numa transação. Retorna o id da cópia.
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

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0008_clone_e_multiplicador.sql
git commit -m "feat(db): multiplicador de unidades e RPC clone_quote"
```

> Nota: a migration é aplicada no Supabase pelo fluxo já existente do projeto. Os testes automatizados deste plano cobrem apenas a lógica em `src/lib/pricing`.

---

## Task 2: `calcQuoteTotal` com multiplicador (TDD)

**Files:**
- Modify: `src/lib/pricing/calc.ts`
- Test: `src/lib/pricing/calc.test.ts`

- [ ] **Step 1: Atualizar os testes existentes e adicionar casos de multiplicador**

No `src/lib/pricing/calc.test.ts`, substituir o bloco `describe('calcQuoteTotal', ...)` inteiro por:

```ts
describe('calcQuoteTotal', () => {
  it('soma linhas e aplica desconto (unitTotal = total quando multiplicador 1)', () => {
    expect(calcQuoteTotal([300, 1260], 60)).toEqual({ subtotal: 1560, unitTotal: 1500, total: 1500 })
  })
  it('desconto padrão 0', () => {
    expect(calcQuoteTotal([100.005]).total).toBe(100.01)
  })
  it('rejeita desconto negativo ou maior que subtotal', () => {
    expect(() => calcQuoteTotal([100], -1)).toThrow(PricingError)
    expect(() => calcQuoteTotal([100], 101)).toThrow(PricingError)
  })
  it('multiplicador multiplica o valor por unidade', () => {
    expect(calcQuoteTotal([300, 1260], 60, 3)).toEqual({ subtotal: 1560, unitTotal: 1500, total: 4500 })
  })
  it('multiplicador 1 é o padrão', () => {
    expect(calcQuoteTotal([100]).total).toBe(calcQuoteTotal([100], 0, 1).total)
  })
  it('rejeita multiplicador não inteiro ou menor que 1', () => {
    expect(() => calcQuoteTotal([100], 0, 0)).toThrow(PricingError)
    expect(() => calcQuoteTotal([100], 0, 1.5)).toThrow(PricingError)
  })
})
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npm run test -- src/lib/pricing/calc.test.ts`
Expected: FAIL (o retorno atual não tem `unitTotal` e ignora o 3º argumento).

- [ ] **Step 3: Implementar em `calc.ts`**

Substituir a função `calcQuoteTotal` inteira em `src/lib/pricing/calc.ts` por:

```ts
export function calcQuoteTotal(
  lineTotals: number[],
  discount = 0,
  multiplier = 1,
): { subtotal: number; unitTotal: number; total: number } {
  const subtotal = round2(lineTotals.reduce((a, b) => a + b, 0))
  if (discount < 0) throw new PricingError('Desconto não pode ser negativo')
  if (discount > subtotal) throw new PricingError('Desconto não pode ser maior que o subtotal')
  if (!Number.isInteger(multiplier) || multiplier < 1) {
    throw new PricingError('Multiplicador deve ser um número inteiro maior ou igual a 1')
  }
  const unitTotal = round2(subtotal - discount)
  const total = round2(unitTotal * multiplier)
  return { subtotal, unitTotal, total }
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npm run test -- src/lib/pricing/calc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/calc.ts src/lib/pricing/calc.test.ts
git commit -m "feat(pricing): calcQuoteTotal com multiplicador e unitTotal"
```

---

## Task 3: `quoteDisplayFooter` com multiplicador (TDD)

**Files:**
- Modify: `src/lib/pricing/display.ts`
- Test: `src/lib/pricing/display.test.ts`

- [ ] **Step 1: Adicionar casos de multiplicador ao teste**

No `src/lib/pricing/display.test.ts`, dentro do `describe('quoteDisplayFooter', ...)`, adicionar estes dois casos antes do `})` que fecha o describe:

```ts
  it('multiplicador > 1: unitTotal por casa e total multiplicado', () => {
    const f = quoteDisplayFooter(1400, 50, [-100, 0], 3)
    expect(f.unitTotal).toBe(1350) // 1400 − 50
    expect(f.multiplier).toBe(3)
    expect(f.total).toBe(4050) // 1350 × 3
    expect(f.subtotal).toBe(1500) // bruto, inalterado
    expect(f.discount).toBe(150)
  })
  it('multiplicador padrão 1: total igual ao unitTotal', () => {
    const f = quoteDisplayFooter(1000, 0, [0])
    expect(f.unitTotal).toBe(1000)
    expect(f.multiplier).toBe(1)
    expect(f.total).toBe(1000)
  })
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npm run test -- src/lib/pricing/display.test.ts`
Expected: FAIL (`unitTotal`/`multiplier` são `undefined`).

- [ ] **Step 3: Implementar em `display.ts`**

Substituir a interface `QuoteFooter` e a função `quoteDisplayFooter` inteiras em `src/lib/pricing/display.ts` por:

```ts
export interface QuoteFooter {
  /** subtotal com valores brutos (ajustes negativos somados de volta) */
  subtotal: number
  /** desconto do orçamento + soma dos ajustes negativos dos itens */
  discount: number
  /** valor líquido de uma unidade (subtotalNet − discount) */
  unitTotal: number
  /** número de unidades iguais */
  multiplier: number
  /** total final — unitTotal × multiplier */
  total: number
  /** se há alguma dedução a exibir (desconto e/ou ajuste negativo) */
  hasDeduction: boolean
}

/**
 * Consolida o rodapé quando ajustes negativos devem seguir a regra do desconto:
 * o abatimento dos itens é somado ao desconto numa única linha. O multiplicador
 * multiplica o valor líquido por unidade para chegar ao total do projeto.
 */
export function quoteDisplayFooter(
  subtotalNet: number,
  discount: number,
  extraValues: number[],
  multiplier = 1,
): QuoteFooter {
  const negAdj = round2(-extraValues.reduce((a, v) => a + Math.min(v ?? 0, 0), 0))
  const discountShown = round2(discount + negAdj)
  const unitTotal = round2(subtotalNet - discount)
  return {
    subtotal: round2(subtotalNet + negAdj),
    discount: discountShown,
    unitTotal,
    multiplier,
    total: round2(unitTotal * multiplier),
    hasDeduction: discountShown > 0,
  }
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npm run test -- src/lib/pricing/display.test.ts`
Expected: PASS (inclusive os casos antigos, pois `multiplier` padrão 1 mantém `total === subtotalNet − discount`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/display.ts src/lib/pricing/display.test.ts
git commit -m "feat(pricing): quoteDisplayFooter com multiplicador e unitTotal"
```

---

## Task 4: Server actions — `saveQuote` com multiplicador e `cloneQuote`

**Files:**
- Modify: `src/app/(app)/orcamentos/actions.ts`

- [ ] **Step 1: Importar `redirect`**

No topo de `src/app/(app)/orcamentos/actions.ts`, logo abaixo de `import { revalidatePath } from 'next/cache'`, adicionar:

```ts
import { redirect } from 'next/navigation'
```

- [ ] **Step 2: Adicionar `multiplier` ao input**

No `interface SaveQuoteInput`, adicionar o campo `multiplier` logo após `discount: number`:

```ts
  discount: number
  multiplier: number
```

- [ ] **Step 3: Validar e usar o multiplicador em `saveQuote`**

Em `saveQuote`, logo após a linha `if (input.items.length === 0) return { error: 'Adicione pelo menos um item' }`, adicionar a validação:

```ts
    if (!Number.isInteger(input.multiplier) || input.multiplier < 1) {
      return { error: 'Multiplicador deve ser um número inteiro maior ou igual a 1' }
    }
```

Trocar a linha do cálculo do total:

```ts
    const { subtotal, total } = calcQuoteTotal(snapshots.map(s => s.line_total), input.discount)
```

por:

```ts
    const { subtotal, total } = calcQuoteTotal(snapshots.map(s => s.line_total), input.discount, input.multiplier)
```

No objeto `quoteRow`, adicionar `multiplier` logo após `discount: input.discount,`:

```ts
      discount: input.discount,
      multiplier: input.multiplier,
```

- [ ] **Step 4: Adicionar a action `cloneQuote`**

No fim do arquivo `src/app/(app)/orcamentos/actions.ts`, adicionar:

```ts
export async function cloneQuote(id: string): Promise<void> {
  const { supabase } = await getProfile()
  const { data, error } = await supabase.rpc('clone_quote', { p_source_id: id })
  if (error) throw new Error('Erro ao clonar o orçamento: ' + error.message)
  revalidatePath('/')
  redirect(`/orcamentos/${data as string}`)
}
```

- [ ] **Step 5: Verificar tipos/lint**

Run: `npm run lint`
Expected: sem erros novos neste arquivo. (O uso de `multiplier` será conectado na UI nas próximas tasks; `SaveQuoteInput` agora exige o campo, o que quebra o build do editor até a Task 5 — isso é esperado e resolvido lá.)

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/orcamentos/actions.ts
git commit -m "feat(orcamentos): saveQuote recebe multiplicador e action cloneQuote"
```

---

## Task 5: Editor — campo multiplicador, rodapé e duplicar item

**Files:**
- Modify: `src/components/quote/quote-editor.tsx`

- [ ] **Step 1: Adicionar `multiplier` ao tipo `ExistingQuote`**

Em `src/components/quote/quote-editor.tsx`, dentro de `interface ExistingQuote`, adicionar após `discount: number`:

```ts
  discount: number
  multiplier: number
```

- [ ] **Step 2: Estados de multiplicador e de item duplicado**

Logo após a linha `const [discountStr, setDiscountStr] = useState(quote?.discount ? String(quote.discount) : '')`, adicionar:

```ts
  const [multiplierStr, setMultiplierStr] = useState(String(quote?.multiplier ?? 1))
```

Logo após a linha `const [editing, setEditing] = useState<number | 'new' | null>(quote ? null : 'new')`, adicionar:

```ts
  const [dupIndex, setDupIndex] = useState<number | null>(null)
```

- [ ] **Step 3: Usar o multiplicador no `computed`**

Substituir o corpo do `useMemo` do `computed` inteiro por:

```ts
  const computed = useMemo(() => {
    const snaps: (ItemSnapshot | { error: string })[] = items.map(sel => {
      const p = products.find(p => p.id === sel.productTypeId)
      if (!p) return { error: 'Produto removido da tabela — exclua este item' }
      try { return buildSnapshot(p, sel) } catch (e) {
        return { error: e instanceof PricingError ? e.message : 'Erro' }
      }
    })
    const valid = snaps.filter((s): s is ItemSnapshot => !('error' in s))
    const discount = discountStr ? parseDecimal(discountStr) : 0
    const multiplier = Math.max(1, Math.trunc(Number(multiplierStr)) || 1)
    let totals = { subtotal: 0, unitTotal: 0, total: 0 }
    let totalError = ''
    try { totals = calcQuoteTotal(valid.map(s => s.line_total), discount, multiplier) }
    catch (e) { totalError = e instanceof PricingError ? e.message : 'Erro' }
    const footer = quoteDisplayFooter(totals.subtotal, discount, valid.map(s => s.extra_value), multiplier)
    return { snaps, totals, footer, totalError, allValid: valid.length === items.length }
  }, [items, products, discountStr, multiplierStr])
```

- [ ] **Step 4: Enviar o multiplicador no `onSave`**

Na chamada `saveQuote({ ... })` dentro de `onSave`, adicionar `multiplier` logo após a linha do `discount`:

```ts
      discount: discountStr ? parseDecimal(discountStr) : 0,
      multiplier: Math.max(1, Math.trunc(Number(multiplierStr)) || 1),
```

- [ ] **Step 5: Adicionar a função de duplicar item**

Logo antes do `return (` do componente, adicionar:

```ts
  function duplicateItem(i: number) {
    const copy: ItemSelection = { ...items[i], optionIds: [...items[i].optionIds] }
    setItems(arr => [...arr.slice(0, i + 1), copy, ...arr.slice(i + 1)])
    setDupIndex(i + 1)
    setEditing(i + 1)
  }
```

- [ ] **Step 6: Tratar confirmar/cancelar da cópia no `ItemForm` de edição**

No bloco `if (editing === i) { return <ItemForm ... /> }`, substituir por:

```ts
          if (editing === i) {
            return <ItemForm key={i} products={products} initial={sel}
              onConfirm={ns => { setItems(arr => arr.map((x, j) => j === i ? ns : x)); setEditing(null); setDupIndex(null) }}
              onCancel={() => {
                if (dupIndex === i) { setItems(arr => arr.filter((_, j) => j !== i)) }
                setDupIndex(null); setEditing(null)
              }} />
          }
```

- [ ] **Step 7: Adicionar o botão "duplicar"**

No bloco de ações do item (o `<div className="flex shrink-0 gap-2 text-sm">`), adicionar o botão "duplicar" antes do botão "editar":

```tsx
              <div className="flex shrink-0 gap-2 text-sm">
                <button className="underline" onClick={() => duplicateItem(i)}>duplicar</button>
                <button className="underline" onClick={() => setEditing(i)}>editar</button>
                <button className="text-red-600 underline"
                  onClick={() => setItems(arr => arr.filter((_, j) => j !== i))}>remover</button>
              </div>
```

- [ ] **Step 8: Campo multiplicador e rodapé multiplicado**

Na `<section>` do rodapé (a que começa com `<Label className="shrink-0">Desconto (R$)</Label>`), logo após o `</div>` que fecha o campo de desconto, adicionar o campo multiplicador:

```tsx
        <div className="flex items-center gap-2">
          <Label className="shrink-0">Multiplicador (casas)</Label>
          <Input inputMode="numeric" value={multiplierStr}
            onChange={e => setMultiplierStr(e.target.value)} className="w-20" />
        </div>
```

Em seguida, substituir a linha do Total:

```tsx
        <p className="text-lg font-bold">Total: {formatBRL(computed.totals.total)}</p>
```

por:

```tsx
        {computed.footer.multiplier > 1 ? (
          <>
            <p className="text-sm text-muted-foreground">Valor por unidade: {formatBRL(computed.footer.unitTotal)}</p>
            <p className="text-sm text-muted-foreground">{computed.footer.multiplier} casas × {formatBRL(computed.footer.unitTotal)}</p>
            <p className="text-lg font-bold">Total ({computed.footer.multiplier} casas): {formatBRL(computed.totals.total)}</p>
          </>
        ) : (
          <p className="text-lg font-bold">Total: {formatBRL(computed.totals.total)}</p>
        )}
```

- [ ] **Step 9: Verificar lint/tipos**

Run: `npm run lint`
Expected: sem erros. (`totals` agora tem `unitTotal`, tipos batem com `calcQuoteTotal`.)

- [ ] **Step 10: Commit**

```bash
git add src/components/quote/quote-editor.tsx
git commit -m "feat(editor): campo multiplicador, rodapé multiplicado e duplicar item"
```

---

## Task 6: Tela de detalhe — multiplicador na carga e botão "Clonar"

**Files:**
- Modify: `src/app/(app)/orcamentos/[id]/page.tsx`

- [ ] **Step 1: Importar `cloneQuote`**

Na linha de import das actions, trocar:

```ts
import { setStatus } from '../actions'
```

por:

```ts
import { setStatus, cloneQuote } from '../actions'
```

- [ ] **Step 2: Passar `multiplier` para `ExistingQuote`**

No objeto `const existing: ExistingQuote = { ... }`, adicionar `multiplier` logo após `discount: Number(quote.discount),`:

```ts
    site_address: quote.site_address, discount: Number(quote.discount),
    multiplier: Number(quote.multiplier ?? 1), status: quote.status,
```

- [ ] **Step 3: Adicionar o botão "Clonar"**

No cabeçalho, substituir o bloco do link "Apresentar / Compartilhar":

```tsx
        <Link href={`/orcamentos/${quote.id}/apresentacao`} className="ml-auto">
          <Button type="button" variant="outline" size="sm">Apresentar / Compartilhar</Button>
        </Link>
```

por:

```tsx
        <div className="ml-auto flex gap-2">
          <form action={cloneQuote.bind(null, quote.id)}>
            <SubmitButton type="submit" variant="outline" size="sm">Clonar</SubmitButton>
          </form>
          <Link href={`/orcamentos/${quote.id}/apresentacao`}>
            <Button type="button" variant="outline" size="sm">Apresentar / Compartilhar</Button>
          </Link>
        </div>
```

> `SubmitButton` já está importado neste arquivo. Verificar que ele aceita `variant`/`size` (é um wrapper de `Button`).

- [ ] **Step 4: Verificar build/lint**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/orcamentos/[id]/page.tsx
git commit -m "feat(orcamentos): carga do multiplicador e botão Clonar no detalhe"
```

---

## Task 7: Apresentação/PDF — exibir multiplicador

**Files:**
- Modify: `src/components/presentation/quote-presentation.tsx`

- [ ] **Step 1: Passar o multiplicador ao `quoteDisplayFooter`**

Substituir a construção do `footer`:

```tsx
  const footer = quoteDisplayFooter(
    Number(quote.subtotal),
    Number(quote.discount),
    items.map(it => Number(it.extra_value ?? 0)),
  )
```

por:

```tsx
  const footer = quoteDisplayFooter(
    Number(quote.subtotal),
    Number(quote.discount),
    items.map(it => Number(it.extra_value ?? 0)),
    Number(quote.multiplier ?? 1),
  )
```

- [ ] **Step 2: Exibir valor por unidade e multiplicador**

Substituir a `<section>` do rodapé inteira:

```tsx
      <section className="space-y-1 border-t pt-3 text-right">
        {footer.hasDeduction && (
          <>
            <p className="text-sm text-muted-foreground">Subtotal: {formatBRL(footer.subtotal)}</p>
            <p className="text-sm text-green-700">Desconto: −{formatBRL(footer.discount)}</p>
          </>
        )}
        <p className="text-2xl font-bold">Total: {formatBRL(footer.total)}</p>
      </section>
```

por:

```tsx
      <section className="space-y-1 border-t pt-3 text-right">
        {footer.hasDeduction && (
          <>
            <p className="text-sm text-muted-foreground">Subtotal: {formatBRL(footer.subtotal)}</p>
            <p className="text-sm text-green-700">Desconto: −{formatBRL(footer.discount)}</p>
          </>
        )}
        {footer.multiplier > 1 && (
          <>
            <p className="text-sm text-muted-foreground">Valor por unidade: {formatBRL(footer.unitTotal)}</p>
            <p className="text-sm text-muted-foreground">{footer.multiplier} casas × {formatBRL(footer.unitTotal)}</p>
          </>
        )}
        <p className="text-2xl font-bold">Total: {formatBRL(footer.total)}</p>
      </section>
```

- [ ] **Step 3: Verificar build/lint**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/presentation/quote-presentation.tsx
git commit -m "feat(apresentacao): exibir valor por unidade e multiplicador"
```

---

## Task 8: Verificação final

- [ ] **Step 1: Rodar todos os testes**

Run: `npm run test`
Expected: PASS (todos os testes de pricing, incl. novos casos de multiplicador).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build com sucesso.

- [ ] **Step 4: (Manual) Smoke test**

Aplicar a migration `0008` no Supabase do ambiente e verificar:
- Criar/editar orçamento com Multiplicador = 3 → total = (subtotal − desconto) × 3.
- Duplicar um item → abre o formulário pré-preenchido; cancelar remove a cópia, confirmar mantém.
- Clonar orçamento → abre cópia "Cópia de — <nome>" como rascunho com os mesmos itens e multiplicador.
- Apresentação/PDF com multiplicador > 1 mostra "Valor por unidade", "N casas ×" e o total multiplicado.
