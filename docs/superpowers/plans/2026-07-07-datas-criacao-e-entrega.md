# Datas de criação e possível entrega — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir a data de criação na tela interna do orçamento e adicionar um campo interno obrigatório de "data de possível entrega", com exibição/ordenação/filtro na lista.

**Architecture:** Nova coluna `delivery_date` (nullable) em `quotes`, gravada via `save_quote_atomic`. Validação de obrigatoriedade na aplicação (helper puro testável + client + server action). Lista ganha seletor de ordenação e filtro por período.

**Tech Stack:** Next.js (App Router, server actions), Supabase (PostgREST + RPC plpgsql), React client components, Vitest.

Spec de referência: `docs/superpowers/specs/2026-07-07-datas-criacao-e-entrega-design.md`

---

### Task 1: Migration do banco (coluna + funções)

**Files:**
- Create: `supabase/migrations/0009_delivery_date.sql`

- [ ] **Step 1: Criar a migration**

Create `supabase/migrations/0009_delivery_date.sql`:

```sql
-- Data de possível entrega do trabalho (uso interno: planejamento de fabricação/entrega).
-- Nullable no banco: orçamentos antigos e clones não têm a data; a obrigatoriedade é
-- garantida na aplicação (server action saveQuote).

alter table quotes add column delivery_date date;

-- Recria save_quote_atomic para gravar também a data de entrega no cabeçalho.
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
    delivery_date  = nullif(p_quote->>'delivery_date', '')::date,
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

-- Recria clone_quote: a cópia NÃO herda a data de entrega (novo trabalho a replanejar).
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
    subtotal, total, multiplier, status, created_by, valid_until, delivery_date)
  select 'Cópia de — ' || customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, 'rascunho', auth.uid(),
    (now() + make_interval(days => v_days))::date, null
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
git add supabase/migrations/0009_delivery_date.sql
git commit -m "feat(db): coluna delivery_date e funções save_quote_atomic/clone_quote"
```

---

### Task 2: Helper puro de validação da data de entrega (TDD)

**Files:**
- Create: `src/lib/quotes/delivery.ts`
- Test: `src/lib/quotes/delivery.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `src/lib/quotes/delivery.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isValidDeliveryDate } from './delivery'

describe('isValidDeliveryDate', () => {
  it('aceita data ISO YYYY-MM-DD', () => {
    expect(isValidDeliveryDate('2026-07-10')).toBe(true)
  })
  it('rejeita string vazia', () => {
    expect(isValidDeliveryDate('')).toBe(false)
    expect(isValidDeliveryDate('   ')).toBe(false)
  })
  it('rejeita formato inválido', () => {
    expect(isValidDeliveryDate('10/07/2026')).toBe(false)
    expect(isValidDeliveryDate('2026-13-40')).toBe(false)
    expect(isValidDeliveryDate('abc')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx vitest run src/lib/quotes/delivery.test.ts`
Expected: FAIL — "Failed to resolve import './delivery'" ou "isValidDeliveryDate is not a function".

- [ ] **Step 3: Implementar o helper**

Create `src/lib/quotes/delivery.ts`:

```ts
/** Valida uma data de entrega no formato ISO YYYY-MM-DD (usada no <input type="date">). */
export function isValidDeliveryDate(s: string): boolean {
  const t = String(s).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false
  const d = new Date(t + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return false
  // rejeita normalização silenciosa (ex.: 2026-13-40 vira outra data)
  return d.toISOString().slice(0, 10) === t
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `npx vitest run src/lib/quotes/delivery.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/quotes/delivery.ts src/lib/quotes/delivery.test.ts
git commit -m "feat(quotes): helper isValidDeliveryDate"
```

---

### Task 3: Server action saveQuote grava e valida a data de entrega

**Files:**
- Modify: `src/app/(app)/orcamentos/actions.ts`

- [ ] **Step 1: Adicionar campo à interface `SaveQuoteInput`**

Em `src/app/(app)/orcamentos/actions.ts`, na interface `SaveQuoteInput`, adicionar após `multiplier: number`:

```ts
  deliveryDate: string
```

- [ ] **Step 2: Importar o helper e validar**

No topo do arquivo, adicionar aos imports:

```ts
import { isValidDeliveryDate } from '@/lib/quotes/delivery'
```

Dentro de `saveQuote`, logo após a validação do multiplicador (`if (!Number.isInteger(input.multiplier) ...) { ... }`), adicionar:

```ts
    if (!isValidDeliveryDate(input.deliveryDate)) {
      return { error: 'Informe a data de possível entrega' }
    }
```

- [ ] **Step 3: Persistir no `quoteRow` e no insert inicial**

No objeto `quoteRow`, adicionar após `multiplier: input.multiplier,`:

```ts
      delivery_date: input.deliveryDate,
```

O insert inicial usa `{ ...quoteRow, created_by: user.id, valid_until: validUntil }`, então já inclui `delivery_date` — nenhuma mudança adicional necessária ali.

- [ ] **Step 4: Rodar testes e build para garantir que nada quebrou**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS nos testes; sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/orcamentos/actions.ts
git commit -m "feat(orcamentos): validar e gravar delivery_date no saveQuote"
```

---

### Task 4: Editor exibe input de data de entrega

**Files:**
- Modify: `src/components/quote/quote-editor.tsx`

- [ ] **Step 1: Adicionar campo à interface `ExistingQuote`**

Em `src/components/quote/quote-editor.tsx`, na interface `ExistingQuote`, adicionar após `status: string`:

```ts
  delivery_date: string | null
```

- [ ] **Step 2: Adicionar estado**

Após a linha `const [multiplierStr, setMultiplierStr] = useState(String(quote?.multiplier ?? 1))`, adicionar:

```ts
  const [deliveryDate, setDeliveryDate] = useState(quote?.delivery_date ?? '')
```

- [ ] **Step 3: Enviar no `saveQuote`**

Dentro de `onSave`, no objeto passado para `saveQuote`, adicionar após `multiplier: Math.max(1, Math.trunc(Number(multiplierStr)) || 1),`:

```ts
      deliveryDate,
```

- [ ] **Step 4: Adicionar o input na seção Cliente**

Dentro da `<section>` "Cliente", após o bloco do "Endereço da obra" (`<div className="space-y-1"><Label>Endereço da obra</Label> ... </div>`), adicionar:

```tsx
        <div className="space-y-1"><Label>Data de possível entrega *</Label>
          <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></div>
```

- [ ] **Step 5: Bloquear salvar sem data de entrega**

No `<Button onClick={onSave} disabled={...}>`, adicionar `|| !deliveryDate` à condição `disabled`:

```tsx
        <Button onClick={onSave} disabled={saving || !computed.allValid || !!computed.totalError || items.length === 0 || !customerName.trim() || !deliveryDate}>
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/components/quote/quote-editor.tsx
git commit -m "feat(quote): input obrigatório de data de possível entrega no editor"
```

---

### Task 5: Tela de detalhe exibe datas e passa delivery_date ao editor

**Files:**
- Modify: `src/app/(app)/orcamentos/[id]/page.tsx`

- [ ] **Step 1: Passar `delivery_date` ao `ExistingQuote`**

Em `src/app/(app)/orcamentos/[id]/page.tsx`, no objeto `existing: ExistingQuote`, adicionar após `token: quote.token,`:

```ts
    delivery_date: quote.delivery_date ?? null,
```

(A query já usa `select('*, ...')`, então `quote.delivery_date` está disponível.)

- [ ] **Step 2: Exibir criação e entrega no cabeçalho**

Logo após o `<div className="flex flex-wrap items-center gap-2"> ... </div>` que contém o título e os botões (o primeiro bloco filho do container principal), adicionar:

```tsx
      <p className="text-sm text-muted-foreground">
        Criado em: {new Date(quote.created_at).toLocaleDateString('pt-BR')}
        {quote.delivery_date && ` · Entrega prevista: ${new Date(quote.delivery_date + 'T12:00:00').toLocaleDateString('pt-BR')}`}
      </p>
```

- [ ] **Step 3: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/orcamentos/[id]/page.tsx
git commit -m "feat(orcamentos): exibir data de criação e entrega no detalhe"
```

---

### Task 6: Lista com data de entrega, ordenação e filtro por período

**Files:**
- Modify: `src/app/(app)/page.tsx`

- [ ] **Step 1: Ampliar `searchParams` e ler os novos parâmetros**

Em `src/app/(app)/page.tsx`, alterar a assinatura de `searchParams` e a desestruturação:

```tsx
export default async function Home({ searchParams }: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; de?: string; ate?: string }>
}) {
  const { q = '', status = '', sort = 'criacao', de = '', ate = '' } = await searchParams
```

- [ ] **Step 2: Ajustar a query (ordenação + filtro de período)**

Substituir o bloco atual de construção da query:

```tsx
  let query = supabase.from('quotes').select('*, creator:created_by(name)').order('created_at', { ascending: false }).limit(100)
  if (q) query = query.ilike('customer_name', `%${q}%`)
  if (status) query = query.eq('status', status)
  const { data: quotes } = await query
```

por:

```tsx
  let query = supabase.from('quotes').select('*, creator:created_by(name)').limit(100)
  query = sort === 'entrega'
    ? query.order('delivery_date', { ascending: true, nullsFirst: false })
    : query.order('created_at', { ascending: false })
  if (q) query = query.ilike('customer_name', `%${q}%`)
  if (status) query = query.eq('status', status)
  if (de) query = query.gte('delivery_date', de)
  if (ate) query = query.lte('delivery_date', ate)
  const { data: quotes } = await query
```

- [ ] **Step 3: Adicionar controles no formulário**

Substituir o `<form>` atual:

```tsx
      <form className="flex gap-2">
        <Input name="q" placeholder="Buscar cliente…" defaultValue={q} />
        <select name="status" defaultValue={status} className="rounded border bg-background p-2 text-sm">
          <option value="">Todos</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button variant="outline" type="submit">Filtrar</Button>
      </form>
```

por:

```tsx
      <form className="flex flex-wrap items-end gap-2">
        <Input name="q" placeholder="Buscar cliente…" defaultValue={q} />
        <select name="status" defaultValue={status} className="rounded border bg-background p-2 text-sm">
          <option value="">Todos</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="sort" defaultValue={sort} className="rounded border bg-background p-2 text-sm">
          <option value="criacao">Ordenar por: Criação</option>
          <option value="entrega">Ordenar por: Entrega</option>
        </select>
        <label className="text-sm text-muted-foreground">Entrega de
          <Input type="date" name="de" defaultValue={de} className="mt-1" />
        </label>
        <label className="text-sm text-muted-foreground">até
          <Input type="date" name="ate" defaultValue={ate} className="mt-1" />
        </label>
        <Button variant="outline" type="submit">Filtrar</Button>
      </form>
```

- [ ] **Step 4: Exibir a data de entrega em cada item**

Na `<p className="text-sm text-muted-foreground">` dentro do `<Link>` de cada orçamento, substituir:

```tsx
                <p className="text-sm text-muted-foreground">
                  {new Date(qt.created_at).toLocaleDateString('pt-BR')} · {formatBRL(qt.total)}
                  {' · '}Vendedor: {qt.creator?.name ?? 'Sem vendedor'}
                </p>
```

por:

```tsx
                <p className="text-sm text-muted-foreground">
                  {new Date(qt.created_at).toLocaleDateString('pt-BR')} · {formatBRL(qt.total)}
                  {' · '}Entrega: {qt.delivery_date ? new Date(qt.delivery_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                  {' · '}Vendedor: {qt.creator?.name ?? 'Sem vendedor'}
                </p>
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/page.tsx
git commit -m "feat(orcamentos): lista com data de entrega, ordenação e filtro por período"
```

---

### Task 7: Verificação final

- [ ] **Step 1: Rodar suíte completa e build**

Run: `npm run test -- --run && npm run build`
Expected: todos os testes passam; build conclui sem erros.

- [ ] **Step 2: Checagem manual (se ambiente disponível)**

- Criar orçamento: botão Salvar fica desabilitado sem data de entrega; salva com a data preenchida.
- Detalhe: mostra "Criado em" e "Entrega prevista".
- Apresentação/página pública: **não** mostram a data de entrega (só a data de criação).
- Lista: coluna "Entrega", seletor de ordenação e filtro de período funcionam.
