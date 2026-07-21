# Recibos salvos + controle financeiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir recibos vinculados ao orçamento (várias parcelas, soma ≤ total), com valores recebido/a-receber por orçamento e da empresa no dashboard.

**Architecture:** Nova tabela `receipts` (RLS por empresa) + RPC transacional `save_receipt` que impõe soma ≤ total. View `quote_financials` alimenta a seção Recibos na página do orçamento; `dashboard_metrics` ganha bloco `financeiro`. Forma de pagamento do recibo é pré-preenchida das `payment_conditions`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS), React 19, Vitest, Tailwind.

## Global Constraints

- **NÃO é o Next.js do seu treino.** Antes de escrever código Next, consultar `node_modules/next/dist/docs/` (ver `AGENTS.md`). Respeitar avisos de deprecação.
- Multi-tenant obrigatório: toda tabela nova filtra por `company_id = current_company_id()`; escrita de config exige `is_company_admin()`. Dados operacionais (como recibos) = qualquer membro da empresa.
- Migrations são arquivos SQL numerados em `supabase/migrations/`; aplicadas via ferramenta Supabase (MCP `apply_migration` ou CLI). NÃO há stack local nem teste automatizado de SQL — validação de migration é revisão + sanity SQL manual.
- TDD com Vitest só vale para libs TS puras (`src/**/*.test.ts`, `environment: node`, alias `@` → `src`). Migrations/actions/componentes = implementar + verificar (lint/build/browser).
- Moeda pt-BR via `formatBRL`; parsing de input via `parseDecimal` (ambos em `src/lib/format.ts`).
- Testes rodam com `npm test` (`vitest run`). Lint: `npm run lint`. Build: `npm run build`.

---

## File Structure

- Create `supabase/migrations/0027_receipts.sql` — tabela `receipts`, índices, RLS, view `quote_financials`, RPC `save_receipt`.
- Create `supabase/migrations/0028_dashboard_financeiro.sql` — recria `dashboard_metrics` com bloco `financeiro`.
- Create `src/lib/receipt/payment-prefill.ts` (+ test) — monta a forma de pagamento default a partir das condições.
- Create `src/lib/receipt/financials.ts` (+ test) — `receiptSummary(total, received)` → recebido/saldo/quitado.
- Create `src/lib/receipt/types.ts` — interface `Receipt`.
- Create `src/app/(app)/orcamentos/[id]/recibo/actions.ts` — actions `createReceipt`, `saveReceipt`, `deleteReceipt`.
- Create `src/app/(app)/orcamentos/[id]/recibo/[receiptId]/page.tsx` — página de impressão por recibo.
- Delete `src/app/(app)/orcamentos/[id]/recibo/page.tsx` — rota efêmera antiga (substituída).
- Create `src/components/receipt/receipts-section.tsx` — seção Recibos na página do orçamento.
- Modify `src/components/receipt/recibo-document.tsx` — usa `receipt.amount` + campos persistidos + botão Salvar.
- Modify `src/app/(app)/orcamentos/[id]/page.tsx` — renderiza `ReceiptsSection`; remove botão header "Gerar Recibo".
- Modify `src/lib/dashboard/types.ts` — bloco `financeiro` em `DashboardMetrics` + `EMPTY_METRICS`.
- Modify `src/app/(app)/admin/dashboard/page.tsx` — 3 cards financeiros.

---

## Task 1: Lib `payment-prefill` (forma de pagamento default)

**Files:**
- Create: `src/lib/receipt/payment-prefill.ts`
- Test: `src/lib/receipt/payment-prefill.test.ts`

**Interfaces:**
- Consumes: `applicableConditions`, `PaymentConditionRow` de `src/lib/pricing/payment.ts`.
- Produces: `receiptPaymentPrefill(conditions: PaymentConditionRow[], total: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/receipt/payment-prefill.test.ts
import { describe, it, expect } from 'vitest'
import { receiptPaymentPrefill } from './payment-prefill'
import type { PaymentConditionRow } from '@/lib/pricing/payment'

const c = (
  description: string, min: number | null, max: number | null, sort = 0, active = true,
): PaymentConditionRow => ({ description, min_total: min, max_total: max, sort_order: sort, active })

describe('receiptPaymentPrefill', () => {
  it('junta as condições aplicáveis à faixa do total, em ordem de sort', () => {
    const conds = [c('Parcela B', 0, null, 2), c('Entrada A', 0, null, 1)]
    expect(receiptPaymentPrefill(conds, 5000)).toBe('Entrada A\nParcela B')
  })

  it('exclui condições fora da faixa mín/máx', () => {
    const conds = [c('Alto', 10000, null, 1), c('Baixo', 0, 9999, 2)]
    expect(receiptPaymentPrefill(conds, 5000)).toBe('Baixo')
  })

  it('ignora inativas', () => {
    const conds = [c('Ativa', 0, null, 1), c('Inativa', 0, null, 2, false)]
    expect(receiptPaymentPrefill(conds, 5000)).toBe('Ativa')
  })

  it('sem condições aplicáveis → string vazia', () => {
    expect(receiptPaymentPrefill([], 5000)).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- payment-prefill`
Expected: FAIL — `Cannot find module './payment-prefill'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/receipt/payment-prefill.ts
import { applicableConditions, type PaymentConditionRow } from '@/lib/pricing/payment'

// Forma de pagamento default do recibo: descrições das condições aplicáveis à
// faixa do total, uma por linha, na ordem de sort_order.
export function receiptPaymentPrefill(conditions: PaymentConditionRow[], total: number): string {
  return applicableConditions(conditions, total).map(c => c.description).join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- payment-prefill`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/receipt/payment-prefill.ts src/lib/receipt/payment-prefill.test.ts
git commit -m "feat(recibo): pré-preenche forma de pagamento das condições cadastradas"
```

---

## Task 2: Lib `financials` (recebido/saldo/quitado)

**Files:**
- Create: `src/lib/receipt/financials.ts`
- Test: `src/lib/receipt/financials.test.ts`

**Interfaces:**
- Produces: `interface ReceiptSummary { received: number; balance: number; settled: boolean }` e `receiptSummary(total: number, received: number): ReceiptSummary`.
- Usado pela seção Recibos (Task 6) como fonte única do cálculo no cliente (espelha a view `quote_financials`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/receipt/financials.test.ts
import { describe, it, expect } from 'vitest'
import { receiptSummary } from './financials'

describe('receiptSummary', () => {
  it('recebido parcial → saldo positivo, não quitado', () => {
    expect(receiptSummary(1000, 400)).toEqual({ received: 400, balance: 600, settled: false })
  })

  it('recebido == total → saldo zero, quitado', () => {
    expect(receiptSummary(1000, 1000)).toEqual({ received: 1000, balance: 0, settled: true })
  })

  it('recebido acima do total (não deve ocorrer, mas é defensivo) → saldo 0, quitado', () => {
    expect(receiptSummary(1000, 1200)).toEqual({ received: 1200, balance: 0, settled: true })
  })

  it('nada recebido → saldo total, não quitado', () => {
    expect(receiptSummary(1000, 0)).toEqual({ received: 0, balance: 1000, settled: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- financials`
Expected: FAIL — `Cannot find module './financials'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/receipt/financials.ts
export interface ReceiptSummary {
  received: number
  balance: number
  settled: boolean
}

// Recebido/saldo/quitado de um orçamento. Saldo nunca negativo (clamp em 0),
// espelhando a view SQL quote_financials.
export function receiptSummary(total: number, received: number): ReceiptSummary {
  const balance = Math.max(total - received, 0)
  return { received, balance, settled: balance <= 0 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- financials`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/receipt/financials.ts src/lib/receipt/financials.test.ts
git commit -m "feat(recibo): helper de recebido/saldo/quitado"
```

---

## Task 3: Migration `0027_receipts.sql` (tabela + RLS + view + RPC)

**Files:**
- Create: `supabase/migrations/0027_receipts.sql`

**Interfaces:**
- Produces (consumido por Tasks 4–7):
  - Tabela `receipts(id, quote_id, company_id, amount, receipt_date, payer_doc, payment_method, receiver_name, receiver_doc, receiver_method, created_by, created_at, updated_at)`.
  - View `quote_financials(quote_id, company_id, status, total, received, balance, settled)`.
  - RPC `save_receipt(p_id uuid, p_quote_id uuid, p_data jsonb) returns uuid` — insert quando `p_id` nulo, senão update; valida soma ≤ total; devolve o id.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/0027_receipts.sql
-- Recibos persistidos por orçamento. Um orçamento pode ter vários recibos
-- (parcelas/entradas); a soma dos amounts não pode exceder quotes.total.

create table receipts (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references quotes(id) on delete cascade,
  company_id      uuid not null references companies(id),
  amount          numeric(12,2) not null check (amount >= 0),
  receipt_date    date not null default current_date,
  payer_doc       text not null default '',
  payment_method  text not null default '',
  receiver_name   text not null default '',
  receiver_doc    text not null default '',
  receiver_method text not null default '',
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index receipts_quote_idx on receipts(quote_id);
create index receipts_company_idx on receipts(company_id);

alter table receipts enable row level security;

-- Dados operacionais: qualquer membro da empresa (mesmo padrão de quotes).
create policy re_all on receipts for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- View de números financeiros por orçamento (recebido/saldo/quitado).
-- security_invoker = on → respeita as policies do usuário (não vaza entre empresas).
create view quote_financials
  with (security_invoker = on) as
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

-- Grava recibo (insert ou update) validando soma ≤ total na transação.
-- security invoker → o select em quotes respeita RLS (isolamento por empresa).
create or replace function public.save_receipt(
  p_id uuid,
  p_quote_id uuid,
  p_data jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company_id uuid;
  v_total      numeric(12,2);
  v_others     numeric(12,2);
  v_amount     numeric(12,2);
  v_id         uuid;
begin
  select company_id, total into v_company_id, v_total
  from quotes where id = p_quote_id;
  if v_company_id is null then
    raise exception 'Orçamento não encontrado';
  end if;

  v_amount := (p_data->>'amount')::numeric;
  if v_amount is null or v_amount < 0 then
    raise exception 'Valor do recibo inválido';
  end if;

  -- soma dos demais recibos (exclui o próprio no update)
  select coalesce(sum(amount), 0) into v_others
  from receipts
  where quote_id = p_quote_id
    and (p_id is null or id <> p_id);

  if v_others + v_amount > v_total then
    raise exception 'Recibos excedem o total do orçamento (saldo disponível: %)',
      (v_total - v_others);
  end if;

  if p_id is null then
    insert into receipts (
      quote_id, company_id, amount, receipt_date, payer_doc, payment_method,
      receiver_name, receiver_doc, receiver_method, created_by
    ) values (
      p_quote_id, v_company_id, v_amount,
      coalesce((p_data->>'receipt_date')::date, current_date),
      coalesce(p_data->>'payer_doc', ''),
      coalesce(p_data->>'payment_method', ''),
      coalesce(p_data->>'receiver_name', ''),
      coalesce(p_data->>'receiver_doc', ''),
      coalesce(p_data->>'receiver_method', ''),
      auth.uid()
    ) returning id into v_id;
  else
    update receipts set
      amount          = v_amount,
      receipt_date    = coalesce((p_data->>'receipt_date')::date, receipt_date),
      payer_doc       = coalesce(p_data->>'payer_doc', payer_doc),
      payment_method  = coalesce(p_data->>'payment_method', payment_method),
      receiver_name   = coalesce(p_data->>'receiver_name', receiver_name),
      receiver_doc    = coalesce(p_data->>'receiver_doc', receiver_doc),
      receiver_method = coalesce(p_data->>'receiver_method', receiver_method),
      updated_at      = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Recibo não encontrado';
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_receipt(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_receipt(uuid, uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Aplicar a migration**

Aplicar via ferramenta Supabase do projeto (MCP `apply_migration` com o conteúdo acima, ou `supabase db push` se houver CLI logada). Confirmar que executou sem erro.

- [ ] **Step 3: Sanity SQL manual**

Rodar no SQL editor do projeto (substituir `<QUOTE_ID>` por um orçamento real):

```sql
-- deve criar e devolver um uuid
select public.save_receipt(null, '<QUOTE_ID>', '{"amount": 100}'::jsonb);
-- deve aparecer com received/balance atualizados
select quote_id, total, received, balance, settled from quote_financials where quote_id = '<QUOTE_ID>';
-- deve falhar com "Recibos excedem o total do orçamento"
select public.save_receipt(null, '<QUOTE_ID>', '{"amount": 999999999}'::jsonb);
```

Expected: 1ª retorna uuid; 2ª mostra `received=100`; 3ª lança exceção de saldo.

- [ ] **Step 4: Limpar o dado de teste**

```sql
delete from receipts where quote_id = '<QUOTE_ID>' and payment_method = '' and payer_doc = '';
```

(Ajustar filtro para remover apenas o recibo criado no teste.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0027_receipts.sql
git commit -m "feat(db): tabela receipts, view quote_financials e RPC save_receipt"
```

---

## Task 4: Tipos + server actions dos recibos

**Files:**
- Create: `src/lib/receipt/types.ts`
- Create: `src/app/(app)/orcamentos/[id]/recibo/actions.ts`

**Interfaces:**
- Consumes: `getCompany`/`getProfile` (`@/lib/auth`), `parseDecimal` (`@/lib/format`), `receiptPaymentPrefill` (Task 1), RPC `save_receipt` (Task 3).
- Produces:
  - `interface Receipt { id: string; quote_id: string; amount: number; receipt_date: string; payer_doc: string; payment_method: string; receiver_name: string; receiver_doc: string; receiver_method: string }`.
  - `createReceipt(quoteId: string): Promise<void>` (redireciona para a página do recibo criado).
  - `saveReceipt(fd: FormData): Promise<void>`.
  - `deleteReceipt(fd: FormData): Promise<void>`.

- [ ] **Step 1: Criar os tipos**

```ts
// src/lib/receipt/types.ts
export interface Receipt {
  id: string
  quote_id: string
  amount: number
  receipt_date: string
  payer_doc: string
  payment_method: string
  receiver_name: string
  receiver_doc: string
  receiver_method: string
}
```

- [ ] **Step 2: Criar as actions**

```ts
// src/app/(app)/orcamentos/[id]/recibo/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'
import { receiptPaymentPrefill } from '@/lib/receipt/payment-prefill'

// Cria um recibo com valor = saldo restante e forma de pagamento vinda das
// condições cadastradas; depois abre a página de impressão do recibo criado.
export async function createReceipt(quoteId: string) {
  const { supabase } = await getProfile()
  const { data: quote } = await supabase.from('quotes').select('total').eq('id', quoteId).single()
  if (!quote) throw new Error('Orçamento não encontrado')
  const [{ data: fin }, { data: conds }] = await Promise.all([
    supabase.from('quote_financials').select('balance').eq('quote_id', quoteId).single(),
    supabase.from('payment_conditions').select('*').order('sort_order'),
  ])
  const balance = Number(fin?.balance ?? quote.total)
  const payment = receiptPaymentPrefill(conds ?? [], Number(quote.total))
  const { data: id, error } = await supabase.rpc('save_receipt', {
    p_id: null,
    p_quote_id: quoteId,
    p_data: { amount: balance, payment_method: payment },
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}`)
  redirect(`/orcamentos/${quoteId}/recibo/${id}`)
}

// Grava alterações de um recibo (valor + campos do documento). Valida saldo no RPC.
export async function saveReceipt(fd: FormData) {
  const { supabase } = await getProfile()
  const id = String(fd.get('id') ?? '')
  const quoteId = String(fd.get('quote_id') ?? '')
  if (!id || !quoteId) throw new Error('Recibo inválido')
  const p_data = {
    amount: parseDecimal(String(fd.get('amount') ?? '0')),
    receipt_date: String(fd.get('receipt_date') ?? '') || null,
    payer_doc: String(fd.get('payer_doc') ?? ''),
    payment_method: String(fd.get('payment_method') ?? ''),
    receiver_name: String(fd.get('receiver_name') ?? ''),
    receiver_doc: String(fd.get('receiver_doc') ?? ''),
    receiver_method: String(fd.get('receiver_method') ?? ''),
  }
  const { error } = await supabase.rpc('save_receipt', { p_id: id, p_quote_id: quoteId, p_data })
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}`)
  revalidatePath(`/orcamentos/${quoteId}/recibo/${id}`)
}

export async function deleteReceipt(fd: FormData) {
  const { supabase } = await getProfile()
  const id = String(fd.get('id') ?? '')
  const quoteId = String(fd.get('quote_id') ?? '')
  const { error } = await supabase.from('receipts').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}`)
}
```

- [ ] **Step 3: Verificar tipos e lint**

Run: `npm run lint`
Expected: sem erros nos arquivos novos. (Sem teste unitário: actions dependem de Supabase/rede — verificadas no browser na Task 6.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/receipt/types.ts "src/app/(app)/orcamentos/[id]/recibo/actions.ts"
git commit -m "feat(recibo): actions create/save/delete via RPC save_receipt"
```

---

## Task 5: Página de impressão por recibo + documento persistido

**Files:**
- Create: `src/app/(app)/orcamentos/[id]/recibo/[receiptId]/page.tsx`
- Create: `src/app/(app)/orcamentos/[id]/recibo/[receiptId]/print-button.tsx`
- Modify: `src/components/receipt/recibo-document.tsx`
- Delete: `src/app/(app)/orcamentos/[id]/recibo/page.tsx`
- Delete: `src/app/(app)/orcamentos/[id]/recibo/print-button.tsx`

**Interfaces:**
- Consumes: `Receipt` (Task 4), `saveReceipt` (Task 4).
- Produces: rota `/orcamentos/[id]/recibo/[receiptId]` renderizando `ReciboDocument` com o recibo salvo.

- [ ] **Step 1: Criar o PrintButton na nova pasta**

```tsx
// src/app/(app)/orcamentos/[id]/recibo/[receiptId]/print-button.tsx
'use client'
import { Button } from '@/components/ui/button'

export function PrintButton() {
  return <Button variant="outline" className="no-print" onClick={() => window.print()}>Baixar PDF</Button>
}
```

- [ ] **Step 2: Criar a página do recibo**

```tsx
// src/app/(app)/orcamentos/[id]/recibo/[receiptId]/page.tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { ReciboDocument } from '@/components/receipt/recibo-document'
import { receiptPdfTitle } from '@/lib/receipt/text'
import { PrintButton } from './print-button'

export async function generateMetadata({ params }: { params: Promise<{ id: string; receiptId: string }> }) {
  const { id } = await params
  const { supabase } = await getProfile()
  const { data } = await supabase.from('quotes').select('customer_name').eq('id', id).single()
  return { title: data ? receiptPdfTitle(data.customer_name, new Date()) : 'Recibo' }
}

export default async function ReciboPage({ params }: { params: Promise<{ id: string; receiptId: string }> }) {
  const { id, receiptId } = await params
  const { supabase } = await getProfile()
  const [{ data: quote }, { data: receipt }] = await Promise.all([
    supabase.from('quotes').select('*, quote_items(*)').eq('id', id).single(),
    supabase.from('receipts').select('*').eq('id', receiptId).single(),
  ])
  if (!quote || !receipt) notFound()
  const { data: company } = await supabase.from('companies').select('*').eq('id', quote.company_id).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = [...(quote.quote_items as any[])].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-2">
        <Link href={`/orcamentos/${id}`} className="text-sm underline">← Voltar</Link>
        <div className="ml-auto"><PrintButton /></div>
      </div>
      <ReciboDocument company={company} quote={quote} items={items} receipt={receipt} />
    </div>
  )
}
```

- [ ] **Step 3: Reescrever `recibo-document.tsx` para usar o recibo salvo + Salvar**

Substituir o conteúdo por (mudanças: recebe `receipt`, estado inicializa do registro, "Valor recebido"/declaração usam `amount` editável, botão Salvar chama `saveReceipt`):

```tsx
// src/components/receipt/recibo-document.tsx
'use client'
import { useState } from 'react'
import { formatBRL } from '@/lib/format'
import { itemDisplayGross, quoteDisplayFooter } from '@/lib/pricing/display'
import { receiptDeclaration } from '@/lib/receipt/text'
import { maskCpfCnpj } from '@/lib/receipt/mask'
import type { Receipt } from '@/lib/receipt/types'
import { saveReceipt } from '@/app/(app)/orcamentos/[id]/recibo/actions'
import { SubmitButton } from '@/components/ui/submit-button'

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */

function EditableInput({ value, onChange, placeholder, className = '', mask }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
  mask?: (v: string) => string
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(mask ? mask(e.target.value) : e.target.value)}
      placeholder={placeholder}
      inputMode={mask ? 'numeric' : undefined}
      className={`border-b border-dashed border-muted-foreground/40 bg-transparent px-1 outline-none focus:border-solid print:border-none print:placeholder-transparent ${className}`}
    />
  )
}

export function ReciboDocument({ company, quote, items, receipt }: {
  company: any; quote: any; items: any[]; receipt: Receipt
}) {
  const footer = quoteDisplayFooter(
    Number(quote.subtotal),
    (quote.discount_type ?? 'valor') as 'valor' | 'percent',
    Number(quote.discount),
    items.map(it => Number(it.extra_value ?? 0)),
    Number(quote.multiplier ?? 1),
  )
  const [amount, setAmount] = useState(String(receipt.amount))
  const [clientDoc, setClientDoc] = useState(receipt.payer_doc ?? '')
  const [receiptDate, setReceiptDate] = useState(receipt.receipt_date)
  const [payment, setPayment] = useState(receipt.payment_method ?? '')
  const [receiverName, setReceiverName] = useState(receipt.receiver_name || company?.receiver_name || '')
  const [receiverDoc, setReceiverDoc] = useState(receipt.receiver_doc || company?.cnpj || '')
  const [receiverMethod, setReceiverMethod] = useState(receipt.receiver_method ?? '')

  const amountNum = Number(amount.replace(/\./g, '').replace(',', '.')) || 0
  const displayDate = new Date(receiptDate + 'T12:00:00').toLocaleDateString('pt-BR')

  return (
    <article className="mx-auto max-w-3xl space-y-6 p-4 text-slate-800 print:p-0">
      {/* barra de ações (não imprime) */}
      <form action={saveReceipt} className="no-print flex flex-wrap items-end gap-3 rounded-xl border p-3">
        <input type="hidden" name="id" value={receipt.id} />
        <input type="hidden" name="quote_id" value={receipt.quote_id} />
        <input type="hidden" name="payer_doc" value={clientDoc} />
        <input type="hidden" name="payment_method" value={payment} />
        <input type="hidden" name="receiver_name" value={receiverName} />
        <input type="hidden" name="receiver_doc" value={receiverDoc} />
        <input type="hidden" name="receiver_method" value={receiverMethod} />
        <input type="hidden" name="receipt_date" value={receiptDate} />
        <label className="text-sm">Valor recebido
          <input name="amount" value={amount} onChange={e => setAmount(e.target.value)}
            inputMode="decimal" className="ml-2 w-32 rounded border px-2 py-1" />
        </label>
        <SubmitButton size="sm">Salvar recibo</SubmitButton>
      </form>

      {/* Header: card da marca + card do valor */}
      <header className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-2xl bg-primary p-6 text-primary-foreground">
          {company?.logo_url && <img src={company.logo_url} alt="" className="h-16 w-16 rounded-lg bg-white/20 object-contain p-1" />}
          <div>
            <p className="text-xl font-bold leading-tight">{company?.name}</p>
            {company?.cnpj && <p className="text-sm opacity-90">CNPJ: {company.cnpj}</p>}
            <p className="text-sm opacity-90">{company?.city}{company?.phone && ` · ${company.phone}`}</p>
          </div>
        </div>
        <div className="rounded-2xl bg-muted/50 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valor recebido</p>
          <p className="text-3xl font-bold text-primary">{formatBRL(amountNum)}</p>
          <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground no-print">
            <span>Data:</span><input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)}
              className="bg-transparent outline-none" />
          </div>
          <p className="mt-1 hidden text-sm text-muted-foreground print:block">Data: {displayDate}</p>
        </div>
      </header>

      {/* Recebemos de */}
      <section className="rounded-2xl border p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recebemos de</p>
        <p className="text-lg font-semibold">{quote.customer_name}</p>
        <div className="text-sm text-muted-foreground">
          CPF/CNPJ: <EditableInput value={clientDoc} onChange={setClientDoc} placeholder="informe o documento" className="w-48" mask={maskCpfCnpj} />
        </div>
        {quote.customer_phone && <p className="text-sm text-muted-foreground">{quote.customer_phone}</p>}
        {quote.site_address && <p className="text-sm text-muted-foreground">Obra: {quote.site_address}</p>}
      </section>

      {/* Declaração */}
      <section className="text-sm leading-relaxed">
        <p>{receiptDeclaration(quote.customer_name, amountNum)}</p>
      </section>

      {/* Tabela de serviços */}
      <section>
        <div className="grid grid-cols-[1fr_4rem_8rem] gap-3 border-b pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Descrição</span><span className="text-center">Qtd</span><span className="text-right">Total</span>
        </div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_4rem_8rem] gap-3 border-b py-3 text-sm">
            <span className="font-medium">{it.product_name}{it.model_name && ` — ${it.model_name}`}</span>
            <span className="text-center">{it.qty}</span>
            <span className="text-right font-semibold">{formatBRL(itemDisplayGross(Number(it.line_total), Number(it.extra_value ?? 0)))}</span>
          </div>
        ))}
      </section>

      {/* Pagamento */}
      <section className="rounded-2xl border p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Forma de pagamento</p>
        <textarea value={payment} onChange={e => setPayment(e.target.value)} rows={3}
          placeholder="Ex.: Entrada R$ 2.000 cartão crédito 10x; Entrega R$ 2.000 cartão crédito 10x"
          className="mt-1 w-full resize-none border-b border-dashed border-muted-foreground/40 bg-transparent outline-none focus:border-solid print:border-none print:placeholder-transparent" />
      </section>

      {/* Total do orçamento (referência) */}
      <section className="space-y-1 text-right">
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
        {footer.multiplier > 1 && (
          <>
            <p className="text-sm text-muted-foreground">Valor por unidade: {formatBRL(footer.unitTotal)}</p>
            <p className="text-sm text-muted-foreground">{footer.multiplier} casas × {formatBRL(footer.unitTotal)}</p>
          </>
        )}
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total do orçamento</p>
        <p className="text-3xl font-bold text-primary">{formatBRL(footer.total)}</p>
      </section>

      {/* Recebedor / assinatura */}
      <section className="space-y-3 border-t pt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recebedor</p>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div>Nome: <EditableInput value={receiverName} onChange={setReceiverName} placeholder="nome" className="w-full" /></div>
          <div>Documento: <EditableInput value={receiverDoc} onChange={setReceiverDoc} placeholder="documento" className="w-full" mask={maskCpfCnpj} /></div>
          <div>Recebimento: <EditableInput value={receiverMethod} onChange={setReceiverMethod} placeholder="ex.: PIX" className="w-full" /></div>
        </div>
        <div className="pt-6 text-center text-sm">
          <img src={company?.signature_url || '/assinatura-recibo.png'} alt="Assinatura"
            className="mx-auto h-24 w-64 object-contain" />
          <div className="mx-auto w-64 border-t border-slate-400" />
          <p className="text-muted-foreground">Assinatura do recebedor · {displayDate}</p>
        </div>
      </section>
    </article>
  )
}
```

- [ ] **Step 4: Apagar a rota efêmera antiga**

```bash
git rm "src/app/(app)/orcamentos/[id]/recibo/page.tsx" "src/app/(app)/orcamentos/[id]/recibo/print-button.tsx"
```

- [ ] **Step 5: Lint + build**

Run: `npm run lint && npm run build`
Expected: sem erros. (Se o build reclamar de import de `saveReceipt` num client component, confirmar que `actions.ts` tem `'use server'` no topo — tem.)

- [ ] **Step 6: Commit**

```bash
git add -A "src/app/(app)/orcamentos/[id]/recibo" src/components/receipt/recibo-document.tsx
git commit -m "feat(recibo): página de impressão por recibo salvo com valor editável"
```

---

## Task 6: Seção Recibos na página do orçamento

**Files:**
- Create: `src/components/receipt/receipts-section.tsx`
- Modify: `src/app/(app)/orcamentos/[id]/page.tsx`

**Interfaces:**
- Consumes: `createReceipt`, `deleteReceipt` (Task 4), `receiptSummary` (Task 2), `formatBRL`, `SubmitButton`, `Button`.
- Produces: `<ReceiptsSection quoteId total received receipts />`.

- [ ] **Step 1: Criar o componente da seção**

```tsx
// src/components/receipt/receipts-section.tsx
import Link from 'next/link'
import { formatBRL } from '@/lib/format'
import { receiptSummary } from '@/lib/receipt/financials'
import { SubmitButton } from '@/components/ui/submit-button'
import { createReceipt, deleteReceipt } from '@/app/(app)/orcamentos/[id]/recibo/actions'
import type { Receipt } from '@/lib/receipt/types'

export function ReceiptsSection({ quoteId, total, received, receipts }: {
  quoteId: string; total: number; received: number; receipts: Receipt[]
}) {
  const { balance, settled } = receiptSummary(total, received)
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">Recibos</h2>
        {settled
          ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Quitado</span>
          : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Em aberto</span>}
        <form action={createReceipt.bind(null, quoteId)} className="ml-auto">
          <SubmitButton size="sm" disabled={settled}>Novo recibo</SubmitButton>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div><span className="text-muted-foreground">Recebido</span><p className="font-bold text-green-700">{formatBRL(received)}</p></div>
        <div><span className="text-muted-foreground">Saldo</span><p className="font-bold text-amber-700">{formatBRL(balance)}</p></div>
        <div><span className="text-muted-foreground">Total</span><p className="font-bold">{formatBRL(total)}</p></div>
      </div>

      {receipts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum recibo gerado.</p>
      ) : (
        <ul className="divide-y">
          {receipts.map(r => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="w-24">{new Date(r.receipt_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
              <span className="w-28 font-semibold">{formatBRL(Number(r.amount))}</span>
              <span className="flex-1 truncate text-muted-foreground">{r.payment_method || '—'}</span>
              <Link href={`/orcamentos/${quoteId}/recibo/${r.id}`} className="underline">Abrir</Link>
              <form action={deleteReceipt}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="quote_id" value={quoteId} />
                <SubmitButton variant="link" className="h-auto px-0 text-red-600 underline">excluir</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Carregar recibos + financials e renderizar a seção na página do orçamento**

Em `src/app/(app)/orcamentos/[id]/page.tsx`:

1. Adicionar aos `Promise.all` (linhas 18–22) mais duas queries:

```ts
    supabase.from('receipts').select('*').eq('quote_id', id).order('receipt_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('quote_financials').select('received').eq('quote_id', id).single(),
```

Ajustar a desestruturação para incluir `{ data: receipts }` e `{ data: fin }`.

2. Adicionar o import:

```ts
import { ReceiptsSection } from '@/components/receipt/receipts-section'
```

3. Remover o botão header "Gerar Recibo" (linhas 79–81 atuais):

```tsx
          <Link href={`/orcamentos/${quote.id}/recibo`}>
            <Button type="button" variant="outline" size="sm">Gerar Recibo</Button>
          </Link>
```

4. Renderizar a seção logo antes de `<QuoteEditor ... />`:

```tsx
      <ReceiptsSection
        quoteId={quote.id}
        total={Number(quote.total)}
        received={Number(fin?.received ?? 0)}
        receipts={(receipts ?? []) as any}
      />
```

(`as any` segue o padrão do arquivo; `Receipt[]` vem de `receipts` do Postgrest com `amount` como number/string — `formatBRL(Number(...))` já cobre.)

- [ ] **Step 3: Verificar no browser**

Iniciar o dev server e abrir um orçamento:
- A seção "Recibos" aparece com Recebido/Saldo/Total e "Em aberto".
- Clicar "Novo recibo" → cria e abre a página do recibo com valor = saldo e forma de pagamento pré-preenchida.
- Alterar o valor e "Salvar recibo" → volta e o Recebido/Saldo atualizam.
- Tentar salvar valor acima do saldo → erro "Recibos excedem o total do orçamento".
- "excluir" um recibo → some da lista, saldo volta a subir.

Usar as ferramentas do preview: `read_console_messages` e `read_network_requests` para conferir ausência de erros; `computer`/`read_page` para exercitar o fluxo.

- [ ] **Step 4: Lint + commit**

Run: `npm run lint`

```bash
git add src/components/receipt/receipts-section.tsx "src/app/(app)/orcamentos/[id]/page.tsx"
git commit -m "feat(orcamento): seção Recibos com recebido/saldo e criação de recibo"
```

---

## Task 7: Bloco financeiro no dashboard

**Files:**
- Create: `supabase/migrations/0028_dashboard_financeiro.sql`
- Modify: `src/lib/dashboard/types.ts`
- Modify: `src/app/(app)/admin/dashboard/page.tsx`

**Interfaces:**
- Consumes: RPC `dashboard_metrics` (estendido), `quote_financials` (Task 3).
- Produces: `DashboardMetrics.financeiro = { received_total: number; receivable_total: number; overdue_count: number }`.

- [ ] **Step 1: Escrever a migration que recria `dashboard_metrics`**

Copiar a função atual de `supabase/migrations/0006_dashboard_metrics.sql` e adicionar a chave `financeiro` ao `jsonb_build_object` (antes do fechamento `) into result;`). O bloco escopa por empresa com `current_company_id()` (evita vazamento entre empresas):

```sql
-- supabase/migrations/0028_dashboard_financeiro.sql
-- Adiciona o bloco 'financeiro' ao dashboard_metrics: recebido (por receipt_date
-- no período), a receber (saldo de aprovados) e nº de aprovados em aberto.
create or replace function public.dashboard_metrics(
  p_start timestamptz default null,
  p_end timestamptz default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_company uuid := public.current_company_id();
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  with periodo as (
    select q.* from quotes q
    where (p_start is null or q.created_at >= p_start)
      and (p_end is null or q.created_at < p_end)
  )
  select jsonb_build_object(
    'kpis', (
      select jsonb_build_object(
        'total_count', count(*),
        'approved_value', coalesce(sum(total) filter (where status = 'aprovado'), 0),
        'open_value', coalesce(sum(total) filter (where status = 'enviado'), 0),
        'avg_ticket', coalesce(avg(total), 0),
        'conversion_rate', coalesce(
          count(*) filter (where status = 'aprovado')::numeric
          / nullif(count(*) filter (where status in ('aprovado','recusado')), 0),
          0)
      ) from periodo
    ),
    'funnel', (
      select coalesce(jsonb_agg(
        jsonb_build_object('status', s.status, 'count', coalesce(c.cnt, 0), 'value', coalesce(c.val, 0))
        order by s.ord), '[]'::jsonb)
      from (values ('rascunho', 1), ('enviado', 2), ('aprovado', 3), ('recusado', 4)) as s(status, ord)
      left join (
        select status, count(*) as cnt, sum(total) as val from periodo group by status
      ) c on c.status = s.status
    ),
    'expiring', (
      select jsonb_build_object(
        'due_7_days', count(*) filter (where status = 'enviado' and valid_until >= current_date and valid_until <= current_date + 7),
        'overdue', count(*) filter (where status = 'enviado' and valid_until < current_date)
      ) from quotes
    ),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('month', m, 'value', v) order by m), '[]'::jsonb)
      from (
        select date_trunc('month', created_at) as m, sum(total) as v
        from periodo group by 1
      ) t
    ),
    'sellers', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'approved_value', av, 'count', cnt) order by av desc), '[]'::jsonb)
      from (
        select coalesce(p.name, 'Sem vendedor') as name,
               coalesce(sum(q.total) filter (where q.status = 'aprovado'), 0) as av,
               count(*) as cnt
        from periodo q left join profiles p on p.id = q.created_by
        group by 1
        order by av desc
        limit 10
      ) t
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object('product_name', product_name, 'times', times, 'qty', qty) order by times desc), '[]'::jsonb)
      from (
        select qi.product_name, count(*) as times, coalesce(sum(qi.qty), 0) as qty
        from quote_items qi
        join periodo q on q.id = qi.quote_id
        group by qi.product_name
        order by times desc
        limit 10
      ) t
    ),
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'customer_name', customer_name, 'total', total, 'status', status, 'created_at', created_at
      ) order by created_at desc), '[]'::jsonb)
      from (
        select id, customer_name, total, status, created_at
        from quotes order by created_at desc limit 8
      ) t
    ),
    'financeiro', jsonb_build_object(
      'received_total', (
        select coalesce(sum(r.amount), 0)
        from receipts r
        where (v_company is null or r.company_id = v_company)
          and (p_start is null or r.receipt_date >= p_start::date)
          and (p_end is null or r.receipt_date < p_end::date)
      ),
      'receivable_total', (
        select coalesce(sum(f.balance), 0)
        from quote_financials f
        where f.status = 'aprovado'
          and (v_company is null or f.company_id = v_company)
      ),
      'overdue_count', (
        select count(*)
        from quote_financials f
        where f.status = 'aprovado' and f.balance > 0
          and (v_company is null or f.company_id = v_company)
      )
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.dashboard_metrics(timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_metrics(timestamptz, timestamptz) to authenticated;
```

- [ ] **Step 2: Aplicar a migration**

Aplicar via ferramenta Supabase (MCP `apply_migration` ou CLI). Confirmar sucesso.

- [ ] **Step 3: Sanity SQL**

```sql
select public.dashboard_metrics(null, null) -> 'financeiro';
```

Expected: JSON com `received_total`, `receivable_total`, `overdue_count` numéricos (não nulos).

- [ ] **Step 4: Estender os tipos do dashboard**

Em `src/lib/dashboard/types.ts`:

1. Adicionar campo à interface `DashboardMetrics` (após `recent`):

```ts
  financeiro: { received_total: number; receivable_total: number; overdue_count: number }
```

2. Adicionar ao `EMPTY_METRICS` (após `recent: []`):

```ts
  financeiro: { received_total: 0, receivable_total: 0, overdue_count: 0 },
```

- [ ] **Step 5: Adicionar os 3 cards no dashboard**

Em `src/app/(app)/admin/dashboard/page.tsx`, após a `<section>` de KPIs (fecha na linha 65), inserir:

```tsx
      {/* Financeiro */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard
          label="Recebido"
          value={formatBRL(Number(m.financeiro.received_total))}
          icon="payments"
          tone="success"
        />
        <KpiCard
          label="A receber (aprovados)"
          value={formatBRL(Number(m.financeiro.receivable_total))}
          icon="account_balance_wallet"
          tone="warning"
        />
        <KpiCard
          label="Em aberto"
          value={String(m.financeiro.overdue_count)}
          icon="pending_actions"
          hint="Aprovados com saldo a receber"
        />
      </section>
```

(Ícones no padrão Material usado por `KpiCard`. Se algum nome de ícone não existir na fonte, cair para um já usado como `schedule`/`trending_up`.)

- [ ] **Step 6: Verificar no browser + lint**

Run: `npm run lint && npm run build`
Abrir `/admin/dashboard`: os 3 cards aparecem com números coerentes (Recebido = soma dos recibos do período; A receber = saldo dos aprovados; Em aberto = contagem). Conferir `read_console_messages` sem erros.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0028_dashboard_financeiro.sql src/lib/dashboard/types.ts "src/app/(app)/admin/dashboard/page.tsx"
git commit -m "feat(dashboard): cards de recebido, a receber e em aberto"
```

---

## Self-Review

- **Cobertura do spec:** tabela `receipts` (T3) ✓; RPC soma ≤ total (T3) ✓; view `quote_financials` (T3) ✓; valor editável (T4/T5) ✓; forma de pagamento das condições (T1/T4) ✓; seção Recibos com recebido/saldo/quitado (T6) ✓; impressão por recibo (T5) ✓; bloco financeiro do dashboard escopado por empresa (T7) ✓; RLS por empresa (T3) ✓; "a receber" só aprovados (T7) ✓.
- **Sem placeholders:** todo passo de código traz o código completo; passos de SQL trazem o SQL completo.
- **Consistência de tipos:** `Receipt` (T4) consumido igual em T5/T6; `save_receipt(p_id,p_quote_id,p_data)` idêntico em T3/T4; `receiptSummary`/`ReceiptSummary` (T2) usado em T6; `financeiro` (T7) casa entre migration, types e página.
- **Nota de deprecação:** `recibo/page.tsx` efêmero é removido em T5 — nenhum link remanescente aponta pra ele (botão header removido em T6).
