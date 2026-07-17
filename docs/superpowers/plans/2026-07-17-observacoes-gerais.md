# Observações Gerais do Orçamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Campo de observações gerais no orçamento, editável no editor e exibido na apresentação interna, página pública `/o/[token]` e impressão/PDF.

**Architecture:** Coluna `general_note text not null default ''` em `quotes`, gravada pelo `save_quote_atomic` e copiada pelo `clone_quote`. Textarea no `QuoteEditor`; bloco condicional no `QuotePresentation` (componente compartilhado — aparece em todas as superfícies automaticamente).

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres/RLS), Tailwind 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-17-observacoes-gerais-design.md`

## Global Constraints

- Copy/UI em pt-BR.
- Migration próxima livre: `supabase/migrations/0021_general_note.sql` (0020 é a última). Se outra migration ocupar 0021, usar o próximo número.
- Base multi-tenant JÁ implementada: RPCs vigentes estão em `0018_multi_tenant_rpcs.sql` — os corpos abaixo partem delas, só acrescentando `general_note`. Não remover nada do que existe.
- Aplicar migrations via MCP `apply_migration` (ou `supabase db push`).
- Recibo NÃO mostra observações (fora de escopo).
- Commits em pt-BR estilo `feat(escopo): descrição`.

---

### Task 1: Migration 0021 — coluna + RPCs

**Files:**
- Create: `supabase/migrations/0021_general_note.sql`

**Interfaces:**
- Produces: `quotes.general_note text not null default ''`; `save_quote_atomic` lê `p_quote->>'general_note'`; `clone_quote` copia o campo. Tasks 2-3 dependem da coluna existir.

- [ ] **Step 1: Escrever a migration**

Corpos completos = versão de `0018_multi_tenant_rpcs.sql` + linhas de `general_note` (marcadas com comentário). Não alterar mais nada.

```sql
-- Observações gerais do orçamento: visíveis no editor, na página pública e no PDF.

alter table quotes add column general_note text not null default '';

create or replace function public.save_quote_atomic(
  p_quote_id uuid, p_quote jsonb, p_items jsonb
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_client_id uuid;
  v_company_id uuid;
begin
  -- RLS filtra: orçamento de outra empresa é invisível aqui
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
    subtotal       = (p_quote->>'subtotal')::numeric,
    total          = (p_quote->>'total')::numeric,
    multiplier     = coalesce((p_quote->>'multiplier')::int, 1),
    delivery_date  = nullif(p_quote->>'delivery_date', '')::date,
    general_note   = coalesce(p_quote->>'general_note', ''), -- novo
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

  insert into quotes (customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, status, created_by, valid_until, delivery_date,
    client_id, company_id, general_note) -- general_note novo
  select 'Cópia de — ' || customer_name, customer_phone, site_address, discount,
    subtotal, total, multiplier, 'rascunho', auth.uid(),
    (now() + make_interval(days => v_days))::date, null, client_id, company_id,
    general_note -- novo
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

- [ ] **Step 2: Aplicar e verificar**

MCP `apply_migration` (name: `general_note`). Verificar (MCP `execute_sql`):

```sql
select column_name, column_default from information_schema.columns
where table_name = 'quotes' and column_name = 'general_note';
```

Expected: 1 linha, default `''::text`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0021_general_note.sql
git commit -m "feat(db): coluna general_note em quotes com save/clone atualizados"
```

---

### Task 2: Editor + server action

**Files:**
- Modify: `src/components/quote/quote-editor.tsx`
- Modify: `src/app/(app)/orcamentos/actions.ts`
- Modify: `src/app/(app)/orcamentos/[id]/page.tsx`

**Interfaces:**
- Consumes: coluna `general_note` (Task 1).
- Produces: `SaveQuoteInput.generalNote: string`; `ExistingQuote.general_note: string`. Payload do RPC ganha `general_note` em `quoteRow`.

- [ ] **Step 1: `actions.ts` — campo no input e no quoteRow**

Em `SaveQuoteInput`, após `deliveryDate: string`:

```ts
  generalNote: string
```

Em `quoteRow` (objeto montado dentro de `saveQuote`), após `delivery_date: input.deliveryDate,`:

```ts
      general_note: input.generalNote.trim(),
```

`quoteRow` alimenta o insert de criação e o `p_quote` do RPC — nada mais muda.

- [ ] **Step 2: `quote-editor.tsx` — estado + textarea + payload**

1. Import: adicionar `import { Textarea } from '@/components/ui/textarea'` (mesmo componente usado em `item-form.tsx`).
2. Em `ExistingQuote`, após `delivery_date: string | null`:

```ts
  general_note: string
```

3. Estado, junto aos demais `useState` (após `deliveryDate`):

```ts
  const [generalNote, setGeneralNote] = useState(quote?.general_note ?? '')
```

4. No payload de `onSave`, após `deliveryDate,`:

```ts
      generalNote,
```

5. UI: no fim da `<section>` de Itens (logo após o bloco `{editing === 'new' ? ... : <Button ...>+ Adicionar item</Button>}`, ainda dentro da section), adicionar:

```tsx
        <div className="space-y-1">
          <Label>Observações gerais</Label>
          <Textarea rows={3} value={generalNote} onChange={e => setGeneralNote(e.target.value)}
            placeholder="Condições especiais, prazos, detalhes combinados…" />
        </div>
```

- [ ] **Step 3: `[id]/page.tsx` — mapear o campo do banco para o editor**

No objeto `existing: ExistingQuote`, após `delivery_date: ...`:

```ts
    general_note: (quote as any).general_note ?? '',
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit && npm test`
Expected: PASS (sem uso novo sem definição).

- [ ] **Step 5: Commit**

```bash
git add src/components/quote/quote-editor.tsx "src/app/(app)/orcamentos/actions.ts" "src/app/(app)/orcamentos/[id]/page.tsx"
git commit -m "feat(quote): campo de observações gerais no editor"
```

---

### Task 3: Apresentação + verificação no preview

**Files:**
- Modify: `src/components/presentation/quote-presentation.tsx`

**Interfaces:**
- Consumes: `quote.general_note` vindo dos selects `quotes.select('*')` já existentes (nenhuma query muda).

- [ ] **Step 1: Bloco de observações**

Em `quote-presentation.tsx`, entre a section de totais (`</section>` após `<p className="text-2xl font-bold">Total: ...`) e o bloco `{conditions.length > 0 && (...)}`, inserir:

```tsx
      {quote.general_note && (
        <section>
          <h2 className="font-semibold">Observações</h2>
          <p className="whitespace-pre-line text-sm">{quote.general_note}</p>
        </section>
      )}
```

- [ ] **Step 2: Verificação end-to-end no preview**

Run: `npx tsc --noEmit && npm run build`, subir dev server (preview) e:

1. Editar orçamento existente → preencher "Observações gerais" com texto multilinha → salvar → recarregar → texto persiste no editor.
2. Abrir `/orcamentos/[id]/apresentacao` → bloco "Observações" aparece com quebras de linha.
3. Abrir link público `/o/<token>` → bloco aparece.
4. Visualizar impressão (botão de imprimir da página pública) → bloco sai no PDF.
5. Clonar o orçamento → cópia mantém o texto.
6. Remover o texto e salvar → bloco some das três superfícies.

- [ ] **Step 3: Commit**

```bash
git add src/components/presentation/quote-presentation.tsx
git commit -m "feat(quote): observações gerais na apresentação, página pública e PDF"
```
