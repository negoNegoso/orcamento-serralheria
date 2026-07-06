# Nome do PDF + Ajuste ±R$ + Observação por Item — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF nomeado pelo cliente; cada item do orçamento ganha ajuste livre em R$ (±, uma vez por linha) e observação visível ao cliente.

**Architecture:** Extensão do pipeline existente selection → motor → snapshot → banco → apresentação. Duas colunas novas em `quote_items` (defaults preservam orçamentos antigos), função `save_quote_atomic` recriada incluindo-as, `generateMetadata` dinâmico nas duas rotas de apresentação.

**Tech Stack:** o do projeto (Next.js App Router, Supabase, Vitest).

**Spec:** `docs/superpowers/specs/2026-07-03-pdf-nome-ajuste-observacao-design.md`

## Global Constraints

- Ajuste aplica **uma vez na linha**: `line_total = round2(unit_total × qty + ajuste)`; NÃO altera `unit_total`
- Linha resultante < 0 → `PricingError` com mensagem "Ajuste deixa o item com valor negativo"
- Ajuste 0/vazio e observação vazia: comportamento byte-idêntico ao atual
- Observação é visível ao cliente (editor, apresentação interna, `/o/[token]`, PDF)
- Título das rotas de apresentação: `Orçamento - {customer_name}` (vira o nome sugerido do PDF)
- Colunas novas com default (`extra_value` 0, `note` '') — snapshots antigos seguem válidos
- pt-BR em toda UI; testes colocalizados; dinheiro via `round2`/`formatBRL`/`parseDecimal` existentes
- Supabase project id: `nwtfesocleshvynxrpfh` (migrations via MCP `apply_migration` + arquivo em `supabase/migrations/`)
- NÃO iniciar/matar dev server (preview do usuário na 3000); verificação de implementador = `npm run test` + `npm run lint` + `npm run build`

---

### Task 1: Motor — `extraValue` no cálculo (TDD)

**Files:**
- Modify: `src/lib/pricing/types.ts` (interface `ItemInput`)
- Modify: `src/lib/pricing/calc.ts` (função `calcItem`)
- Test: `src/lib/pricing/calc.test.ts`

**Interfaces:**
- Consumes: `calcItem`, `round2`, `PricingError` existentes
- Produces: `ItemInput.extraValue?: number | null` (opcional; ausente/null = 0); `calcItem` aplica na linha e lança `PricingError` se `lineTotal < 0`

- [ ] **Step 1: Testes que falham** — adicionar em `calc.test.ts`, dentro de um novo `describe('calcItem extraValue (ajuste do item)')` (o helper `m2Item` já existe no arquivo: base 2×1.5m a 100/m² = 300):

```ts
describe('calcItem extraValue (ajuste do item)', () => {
  it('ajuste positivo soma uma vez na linha, não no unitário', () => {
    const r = calcItem(m2Item({ qty: 2, extraValue: 100 }))
    expect(r.unitTotal).toBe(300)
    expect(r.lineTotal).toBe(700) // 300×2 + 100
  })
  it('ajuste negativo abate da linha', () => {
    expect(calcItem(m2Item({ extraValue: -50 })).lineTotal).toBe(250)
  })
  it('ajuste ausente ou zero não muda nada', () => {
    expect(calcItem(m2Item({})).lineTotal).toBe(300)
    expect(calcItem(m2Item({ extraValue: 0 })).lineTotal).toBe(300)
    expect(calcItem(m2Item({ extraValue: null })).lineTotal).toBe(300)
  })
  it('rejeita ajuste que deixa a linha negativa', () => {
    expect(() => calcItem(m2Item({ extraValue: -301 }))).toThrow(PricingError)
  })
  it('linha zerada por ajuste é permitida', () => {
    expect(calcItem(m2Item({ extraValue: -300 })).lineTotal).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/pricing/calc.test.ts`
Expected: FAIL (extraValue não existe em ItemInput / lineTotal errado).

- [ ] **Step 3: Implementar**

Em `types.ts`, adicionar ao `ItemInput` (após `modelSurcharge`):

```ts
  /** ajuste livre em R$ aplicado uma vez na linha (positivo ou negativo) */
  extraValue?: number | null
```

Em `calc.ts`, trocar o retorno de `calcItem` — hoje termina com:

```ts
  const unitTotal = round2(unit)
  return {
    areaM2,
    unitBasePrice: round2(base),
    unitTotal,
    lineTotal: round2(unitTotal * input.qty),
  }
```

por:

```ts
  const unitTotal = round2(unit)
  const lineTotal = round2(unitTotal * input.qty + (input.extraValue ?? 0))
  if (lineTotal < 0) {
    throw new PricingError('Ajuste deixa o item com valor negativo')
  }
  return {
    areaM2,
    unitBasePrice: round2(base),
    unitTotal,
    lineTotal,
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test` → Expected: todas as suítes verdes (33 antigas + 5 novas = 38).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing && git commit -m "feat: ajuste livre ±R$ por linha no motor de cálculo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Snapshot — congelar `extra_value` e `note` (TDD)

**Files:**
- Modify: `src/lib/pricing/snapshot.ts` (`ItemSelection`, `ItemSnapshot`, `buildSnapshot`)
- Test: `src/lib/pricing/snapshot.test.ts`

**Interfaces:**
- Consumes: `calcItem` com `extraValue` (Task 1)
- Produces: `ItemSelection` ganha `extraValue: number | null` e `note: string`; `ItemSnapshot` ganha `extra_value: number` e `note: string` (snake_case, prontos p/ insert)

- [ ] **Step 1: Testes que falham** — em `snapshot.test.ts`: o helper `sel()` existente ganha os campos novos no objeto base (`extraValue: null, note: ''`) e adicionar ao `describe('buildSnapshot')`:

```ts
  it('congela ajuste e observação no snapshot', () => {
    const s = buildSnapshot(portao, sel({ optionIds: ['o1'], extraValue: -50, note: 'Instalação em 15 dias' }))
    expect(s.extra_value).toBe(-50)
    expect(s.note).toBe('Instalação em 15 dias')
    expect(s.line_total).toBe(250) // 300 − 50
  })
  it('sem ajuste/observação: defaults 0 e vazio', () => {
    const s = buildSnapshot(portao, sel())
    expect(s.extra_value).toBe(0)
    expect(s.note).toBe('')
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/pricing/snapshot.test.ts` → Expected: FAIL (campos ausentes; TS pode acusar antes).

- [ ] **Step 3: Implementar** — em `snapshot.ts`:

`ItemSelection` (após `manualPrice`):

```ts
  /** ajuste livre em R$ aplicado uma vez na linha (positivo ou negativo) */
  extraValue: number | null
  /** observação do item, visível ao cliente */
  note: string
```

`ItemSnapshot` (após `selected_options`):

```ts
  extra_value: number
  note: string
```

Em `buildSnapshot`: passar `extraValue: sel.extraValue` no objeto do `calcItem`, e no retorno adicionar:

```ts
    extra_value: sel.extraValue ?? 0,
    note: sel.note.trim(),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test` → Expected: verdes (38 + 2 = 40). `npm run build` compila? NÃO ainda — `item-form.tsx`, `quote-editor.tsx` e `[id]/page.tsx` constroem `ItemSelection` sem os campos novos → erro TS esperado. Para manter o commit compilável, ajustar os três call sites JÁ NESTA TASK com valores neutros (a UI real vem na Task 3):
  - `src/components/quote/item-form.tsx`: no objeto `sel` do `useMemo`, adicionar `extraValue: null, note: '',` (temporário)
  - `src/app/(app)/orcamentos/[id]/page.tsx`: no map da reconstrução, adicionar `extraValue: null, note: '',` (temporário)
  Rodar `npm run build` → Expected: compila.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing src/components/quote/item-form.tsx "src/app/(app)/orcamentos/[id]/page.tsx"
git commit -m "feat: snapshot congela ajuste e observação do item

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Banco + editor — persistir e editar ajuste/observação

**Files:**
- Create: `supabase/migrations/0005_item_extra_note.sql` (+ aplicar via MCP no projeto `nwtfesocleshvynxrpfh`, nome `0005_item_extra_note`)
- Modify: `src/components/quote/item-form.tsx` (campos reais)
- Modify: `src/components/quote/quote-editor.tsx` (resumo do item)
- Modify: `src/app/(app)/orcamentos/[id]/page.tsx` (reconstrução real)

**Interfaces:**
- Consumes: `ItemSelection`/`ItemSnapshot` da Task 2; `save_quote_atomic` existente (0004); `Textarea` de `@/components/ui/textarea`; `parseDecimal`, `formatBRL`
- Produces: colunas `quote_items.extra_value numeric(12,2) not null default 0` e `quote_items.note text not null default ''`; `save_quote_atomic` inserindo ambas

- [ ] **Step 1: Migration**

`supabase/migrations/0005_item_extra_note.sql`:

```sql
-- Ajuste livre (±R$, uma vez por linha) e observação visível ao cliente, por item.
alter table quote_items
  add column extra_value numeric(12,2) not null default 0,
  add column note text not null default '';

-- Recria a função atômica incluindo as colunas novas no insert.
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
    updated_at     = now()
  where id = p_quote_id;

  if not found then
    raise exception 'Orçamento não encontrado';
  end if;

  delete from quote_items where quote_id = p_quote_id;

  insert into quote_items (quote_id, product_type_id, product_name, model_id, model_name,
    model_photo_url, width_m, height_m, area_m2, qty, unit_base_price, selected_options,
    unit_total, line_total, extra_value, note, sort_order)
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
    (ord - 1)::int
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);
end;
$$;
```

Aplicar via MCP `apply_migration` (project `nwtfesocleshvynxrpfh`, name `0005_item_extra_note`, query = conteúdo acima).

- [ ] **Step 2: Verificar atomicidade e defaults no banco**

Via MCP `execute_sql`: `select extra_value, note from quote_items limit 2;` → Expected: linhas antigas com `0.00` e `''`.

- [ ] **Step 3: Campos no ItemForm** — `src/components/quote/item-form.tsx`:

Estados (junto de `manualStr`):

```ts
  const [extraStr, setExtraStr] = useState(initial?.extraValue?.toString() ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
```

No objeto do `useMemo` de `sel`, substituir os temporários da Task 2 por:

```ts
    extraValue: extraStr.trim() ? parseDecimal(extraStr) : null,
    note,
```

(e incluir `extraStr, note` no array de deps do `useMemo`).

JSX, entre o bloco de Quantidade e o preview de subtotal:

```tsx
      <div className="space-y-1">
        <Label>Ajuste do item (R$) — opcional, use − para abater</Label>
        <Input inputMode="text" value={extraStr} onChange={e => setExtraStr(e.target.value)}
          placeholder="ex: 150 ou -100" className="w-40" />
      </div>

      <div className="space-y-1">
        <Label>Observação (aparece no orçamento)</Label>
        <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
          placeholder="ex: Instalação em até 15 dias" />
      </div>
```

Import: `import { Textarea } from '@/components/ui/textarea'`.
Nota: `inputMode="text"` (não `decimal`) para o teclado móvel oferecer o sinal de menos.

- [ ] **Step 4: Resumo do item no editor** — `src/components/quote/quote-editor.tsx`, no bloco que renderiza cada item salvo (onde mostra `s.selected_options.map(...)` e o `formatBRL(s.line_total)`), adicionar após a linha das opções:

```tsx
                    {s.extra_value !== 0 && (
                      <p className="text-muted-foreground">
                        Ajuste: {s.extra_value > 0 ? '+' : '−'}{formatBRL(Math.abs(s.extra_value))}
                      </p>
                    )}
                    {s.note && <p className="italic text-muted-foreground">{s.note}</p>}
```

- [ ] **Step 5: Reconstrução na edição** — `src/app/(app)/orcamentos/[id]/page.tsx`, no map de `quote_items` → `ItemSelection`, substituir os temporários por:

```ts
      extraValue: Number(it.extra_value) !== 0 ? Number(it.extra_value) : null,
      note: it.note ?? '',
```

- [ ] **Step 6: Verificar**

Run: `npm run test` (40 verdes), `npm run lint`, `npm run build` → Expected: tudo verde. Verificação funcional no browser fica com o controlador.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0005_item_extra_note.sql src/components/quote "src/app/(app)/orcamentos/[id]/page.tsx"
git commit -m "feat: ajuste ±R$ e observação por item — banco e editor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Apresentação + nome do PDF

**Files:**
- Modify: `src/components/presentation/quote-presentation.tsx` (ajuste + observação no item)
- Modify: `src/app/(app)/orcamentos/[id]/apresentacao/page.tsx` (`generateMetadata`)
- Modify: `src/app/o/[token]/page.tsx` (`generateMetadata` substitui `export const metadata`)

**Interfaces:**
- Consumes: colunas `extra_value`/`note` (Task 3); `createServerSupabase`, `createAdminClient`, `formatBRL`
- Produces: título `Orçamento - {customer_name}` nas duas rotas (nome sugerido do PDF)

- [ ] **Step 1: Item na apresentação** — `quote-presentation.tsx`, dentro do bloco de cada item (após a linha das opções `selected_options`, antes do fechamento da div de texto):

```tsx
              {Number(it.extra_value ?? 0) !== 0 && (
                <p className="text-muted-foreground">
                  Ajuste: {Number(it.extra_value) > 0 ? '+' : '−'}{formatBRL(Math.abs(Number(it.extra_value)))}
                </p>
              )}
              {it.note && <p className="italic text-muted-foreground">{it.note}</p>}
```

- [ ] **Step 2: Título na apresentação interna** — `apresentacao/page.tsx`, adicionar antes do componente (import `createServerSupabase` de `@/lib/supabase/server`):

```ts
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('quotes').select('customer_name').eq('id', id).single()
  return { title: data ? `Orçamento - ${data.customer_name}` : 'Orçamento' }
}
```

- [ ] **Step 3: Título na pública** — `o/[token]/page.tsx`, REMOVER `export const metadata = ...` e adicionar:

```ts
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const robots = { index: false, follow: false }
  const { token } = await params
  if (!/^[a-f0-9]{32}$/.test(token)) return { robots }
  const admin = createAdminClient()
  const { data } = await admin.from('quotes').select('customer_name').eq('token', token).single()
  return { robots, title: data ? `Orçamento - ${data.customer_name}` : 'Orçamento' }
}
```

- [ ] **Step 4: Verificar**

Run: `npm run test`, `npm run lint`, `npm run build` → Expected: verdes; build lista as rotas sem erro. Checagem do `<title>` real e do diálogo de impressão fica com o controlador no browser.

- [ ] **Step 5: Commit**

```bash
git add src/components/presentation "src/app/(app)/orcamentos/[id]/apresentacao/page.tsx" "src/app/o/[token]/page.tsx"
git commit -m "feat: ajuste e observação na apresentação; PDF nomeado pelo cliente

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-review (feito na escrita)

- **Cobertura do spec:** §1 título/PDF → T4; §2 ajuste (linha, ±, validação <0, exibição) → T1/T3/T4; §3 observação → T2/T3/T4; §4 migration + save_quote_atomic + reconstrução → T3; §6 testes → T1/T2 TDD + verificação browser do controlador
- **Placeholders:** nenhum
- **Consistência de tipos:** `extraValue: number | null` em `ItemInput`/`ItemSelection`; `extra_value: number`/`note: string` em `ItemSnapshot` = colunas do banco = campos lidos na apresentação (`it.extra_value`, `it.note`); função SQL usa `coalesce` nos dois
