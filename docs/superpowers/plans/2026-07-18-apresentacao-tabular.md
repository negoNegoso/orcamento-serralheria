# Apresentação Tabular do Orçamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estilo "tabela" para os itens do orçamento, escolhido pelo admin por empresa, valendo para tela interna, link público e impressão/PDF.

**Architecture:** `QuotePresentation` vira orquestrador; a seção de itens é extraída em dois subcomponentes (`ItemsCards` = atual, `ItemsTable` = novo) escolhidos por `company.presentation_style` (coluna nova em `companies`, default `'cards'`). Header, totais, observações, pagamento e garantias permanecem compartilhados. Config editada em Admin → Empresa.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind 4, Supabase (Postgres), vitest (só lib — sem testes de componente no projeto).

**Spec:** `docs/superpowers/specs/2026-07-18-apresentacao-tabular-design.md`

## Global Constraints

- Default `'cards'` preserva comportamento atual de todas as empresas existentes.
- Valores exibidos continuam vindo de `itemDisplayGross` / `quoteDisplayFooter` (`src/lib/pricing/display.ts`) — nenhuma mudança de cálculo.
- Mesma tabela em todas as larguras (sem scroll horizontal, sem fallback para cards em mobile).
- Totais permanecem em bloco separado fora da tabela.
- Textos de UI em pt-BR.
- Verificação por task: `npm run lint && npm run test && npm run build` (sem testes de componente; lógica de valores já coberta em `src/lib/pricing/display.test.ts` se existir — não criar novos testes de lib, nada de lógica nova em lib).

---

### Task 1: Migration `presentation_style`

**Files:**
- Create: `supabase/migrations/0025_presentation_style.sql`

**Interfaces:**
- Produces: coluna `companies.presentation_style text not null default 'cards'`, valores permitidos `'cards' | 'tabela'`. Tasks 2–4 leem/gravam essa coluna.

- [ ] **Step 1: Criar arquivo da migration**

```sql
-- estilo de apresentação do orçamento (itens): cards (atual) ou tabela
alter table companies add column presentation_style text not null default 'cards'
  check (presentation_style in ('cards','tabela'));
```

- [ ] **Step 2: Aplicar a migration no projeto Supabase**

Aplicar via MCP do Supabase (`apply_migration`, name `presentation_style`, com o SQL acima) — mesmo fluxo das migrations anteriores. Alternativa CLI: `npx supabase db push`.

- [ ] **Step 3: Verificar coluna criada**

Via MCP `execute_sql`:

```sql
select column_name, column_default from information_schema.columns
where table_name = 'companies' and column_name = 'presentation_style';
```

Expected: 1 linha, default contendo `'cards'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0025_presentation_style.sql
git commit -m "feat(db): coluna presentation_style em companies"
```

---

### Task 2: Extrair `ItemsCards` (refactor, zero mudança de comportamento)

**Files:**
- Create: `src/components/presentation/items-cards.tsx`
- Modify: `src/components/presentation/quote-presentation.tsx` (seção de itens, hoje linhas 39–66)

**Interfaces:**
- Produces: `export function ItemsCards({ items, internal }: { items: any[]; internal: boolean })` — Task 4 usa a mesma assinatura para `ItemsTable`.

- [ ] **Step 1: Criar `src/components/presentation/items-cards.tsx`**

Conteúdo é o markup atual dos cards, movido sem alteração:

```tsx
import { formatBRL } from '@/lib/format'
import { itemDisplayGross } from '@/lib/pricing/display'

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
export function ItemsCards({ items, internal }: { items: any[]; internal: boolean }) {
  return (
    <section className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="flex gap-3 rounded border p-3">
          {it.model_photo_url && <img src={it.model_photo_url} alt="" className="h-20 w-24 rounded object-cover" />}
          <div className="flex-1 text-sm">
            <p className="font-semibold">{it.product_name}{it.model_name && ` — ${it.model_name}`}</p>
            {it.area_m2 != null && (
              <p className="text-muted-foreground">
                {it.width_m != null
                  ? `${Number(it.width_m).toLocaleString('pt-BR')} × ${Number(it.height_m).toLocaleString('pt-BR')} m (${Number(it.area_m2).toLocaleString('pt-BR')} m²)`
                  : `${Number(it.area_m2).toLocaleString('pt-BR')} m²`}
              </p>
            )}
            {(it.selected_options as any[]).length > 0 && (
              <p className="text-muted-foreground">{(it.selected_options as any[]).map(o => o.label).join(' · ')}</p>
            )}
            {it.qty > 1 && <p className="text-muted-foreground">Quantidade: {it.qty}</p>}
            {(Number(it.extra_value ?? 0) < 0 || (internal && Number(it.extra_value ?? 0) > 0)) && (
              <p className={Number(it.extra_value) < 0 ? 'text-green-700' : 'text-muted-foreground no-print'}>
                Ajuste: {Number(it.extra_value) > 0 ? '+' : '−'}{formatBRL(Math.abs(Number(it.extra_value)))}
              </p>
            )}
            {it.note && <p className="whitespace-pre-line italic text-muted-foreground">{it.note}</p>}
          </div>
          <p className="shrink-0 font-semibold">{formatBRL(itemDisplayGross(Number(it.line_total), Number(it.extra_value ?? 0)))}</p>
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 2: Substituir a seção de itens em `quote-presentation.tsx`**

Adicionar import:

```tsx
import { ItemsCards } from './items-cards'
```

Substituir todo o bloco `<section className="space-y-3">…</section>` dos itens por:

```tsx
<ItemsCards items={items} internal={internal} />
```

(O `formatBRL` e `itemDisplayGross` continuam usados no rodapé/ajuste? `itemDisplayGross` fica sem uso no arquivo — remover do import, mantendo `quoteDisplayFooter` e `formatBRL`.)

- [ ] **Step 3: Verificar**

Run: `npm run lint && npm run test && npm run build`
Expected: tudo passa, sem warnings novos de import não usado.

- [ ] **Step 4: Commit**

```bash
git add src/components/presentation/items-cards.tsx src/components/presentation/quote-presentation.tsx
git commit -m "refactor(presentation): extrai ItemsCards de QuotePresentation"
```

---

### Task 3: Novo componente `ItemsTable`

**Files:**
- Create: `src/components/presentation/items-table.tsx`

**Interfaces:**
- Consumes: `itemDisplayGross(lineTotal: number, extraValue: number): number` de `@/lib/pricing/display`; `formatBRL(n: number): string` de `@/lib/format`.
- Produces: `export function ItemsTable({ items, internal }: { items: any[]; internal: boolean })` — Task 4 importa.

- [ ] **Step 1: Criar `src/components/presentation/items-table.tsx`**

Regras: coluna de foto omitida se nenhum item tem `model_photo_url`; coluna Qtd omitida se todos têm `qty === 1`; descrição empilha nome, medidas, opções, ajuste (mesmas regras `internal`/negativo/`no-print` dos cards) e nota; valor à direita com `whitespace-nowrap`.

```tsx
import { formatBRL } from '@/lib/format'
import { itemDisplayGross } from '@/lib/pricing/display'

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
export function ItemsTable({ items, internal }: { items: any[]; internal: boolean }) {
  const hasPhoto = items.some(it => it.model_photo_url)
  const hasQty = items.some(it => Number(it.qty) > 1)
  return (
    <section>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            {hasPhoto && <th className="w-14 py-2 pr-2" aria-label="Foto" />}
            <th className="py-2 pr-2 font-medium">Descrição</th>
            {hasQty && <th className="w-12 py-2 pr-2 text-center font-medium">Qtd</th>}
            <th className="py-2 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((it, i) => (
            <tr key={i} className="align-top">
              {hasPhoto && (
                <td className="py-2 pr-2">
                  {it.model_photo_url && <img src={it.model_photo_url} alt="" className="h-12 w-12 rounded object-cover" />}
                </td>
              )}
              <td className="py-2 pr-2">
                <p className="font-semibold">{it.product_name}{it.model_name && ` — ${it.model_name}`}</p>
                {it.area_m2 != null && (
                  <p className="text-muted-foreground">
                    {it.width_m != null
                      ? `${Number(it.width_m).toLocaleString('pt-BR')} × ${Number(it.height_m).toLocaleString('pt-BR')} m (${Number(it.area_m2).toLocaleString('pt-BR')} m²)`
                      : `${Number(it.area_m2).toLocaleString('pt-BR')} m²`}
                  </p>
                )}
                {(it.selected_options as any[]).length > 0 && (
                  <p className="text-muted-foreground">{(it.selected_options as any[]).map(o => o.label).join(' · ')}</p>
                )}
                {(Number(it.extra_value ?? 0) < 0 || (internal && Number(it.extra_value ?? 0) > 0)) && (
                  <p className={Number(it.extra_value) < 0 ? 'text-green-700' : 'text-muted-foreground no-print'}>
                    Ajuste: {Number(it.extra_value) > 0 ? '+' : '−'}{formatBRL(Math.abs(Number(it.extra_value)))}
                  </p>
                )}
                {it.note && <p className="whitespace-pre-line italic text-muted-foreground">{it.note}</p>}
              </td>
              {hasQty && <td className="py-2 pr-2 text-center">{it.qty}</td>}
              <td className="whitespace-nowrap py-2 text-right font-semibold">
                {formatBRL(itemDisplayGross(Number(it.line_total), Number(it.extra_value ?? 0)))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
```

Nota: no modo tabela a quantidade vai na coluna Qtd (não há linha "Quantidade: X" na descrição, diferente dos cards — intencional).

- [ ] **Step 2: Verificar**

Run: `npm run lint && npm run test && npm run build`
Expected: tudo passa (componente ainda não referenciado — build confirma tipos/JSX).

- [ ] **Step 3: Commit**

```bash
git add src/components/presentation/items-table.tsx
git commit -m "feat(presentation): componente ItemsTable"
```

---

### Task 4: `QuotePresentation` escolhe estilo pela empresa

**Files:**
- Modify: `src/components/presentation/quote-presentation.tsx`

**Interfaces:**
- Consumes: `ItemsCards` (Task 2), `ItemsTable` (Task 3), `company.presentation_style` (Task 1).

- [ ] **Step 1: Adicionar import e dispatch**

Import:

```tsx
import { ItemsTable } from './items-table'
```

Substituir `<ItemsCards items={items} internal={internal} />` por:

```tsx
{company?.presentation_style === 'tabela'
  ? <ItemsTable items={items} internal={internal} />
  : <ItemsCards items={items} internal={internal} />}
```

(`company` já é prop existente; fallback para cards cobre `company` null e valores antigos.)

- [ ] **Step 2: Verificar**

Run: `npm run lint && npm run test && npm run build`
Expected: tudo passa.

- [ ] **Step 3: Commit**

```bash
git add src/components/presentation/quote-presentation.tsx
git commit -m "feat(presentation): estilo de itens por empresa (cards/tabela)"
```

---

### Task 5: Admin → Empresa — select do estilo

**Files:**
- Modify: `src/app/(app)/admin/empresa/company-form.tsx`
- Modify: `src/app/(app)/admin/empresa/actions.ts`

**Interfaces:**
- Consumes: coluna `presentation_style` (Task 1). Form field name: `presentation_style`.

- [ ] **Step 1: Adicionar select no `company-form.tsx`**

Inserir após o bloco de `default_validity_days`, antes do `<SubmitButton>`:

```tsx
<div className="space-y-2"><Label htmlFor="presentation_style">Estilo de apresentação do orçamento</Label>
  <select id="presentation_style" name="presentation_style" defaultValue={settings?.presentation_style ?? 'cards'}
    className="block rounded border bg-background p-2 text-sm">
    <option value="cards">Cards (padrão)</option>
    <option value="tabela">Tabela</option>
  </select>
  <span className="block text-xs text-muted-foreground">Como os itens aparecem na tela, no link público e no PDF.</span></div>
```

- [ ] **Step 2: Persistir em `actions.ts`**

Em `saveCompany`, antes do `.update({...})`:

```ts
const style = String(formData.get('presentation_style') ?? '')
```

Dentro do objeto do `.update({...})`, junto com os demais campos:

```ts
presentation_style: ['cards', 'tabela'].includes(style) ? style : 'cards',
```

- [ ] **Step 3: Verificar**

Run: `npm run lint && npm run test && npm run build`
Expected: tudo passa.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/admin/empresa/company-form.tsx" "src/app/(app)/admin/empresa/actions.ts"
git commit -m "feat(admin): empresa escolhe estilo de apresentação (cards/tabela)"
```

---

### Task 6: Verificação manual nas 3 superfícies

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir dev server via preview** (launch config `dev`/`npm run dev`, porta 3000)

- [ ] **Step 2: Estilo padrão (cards)**

Abrir `/orcamentos/<id>/apresentacao` de um orçamento existente. Expected: idêntico ao comportamento anterior (cards).

- [ ] **Step 3: Trocar para tabela**

Admin → Empresa → "Estilo de apresentação do orçamento" = Tabela → Salvar. Reabrir apresentação. Expected: itens em tabela (miniatura quando houver foto, Qtd só se algum item qty > 1, valores iguais aos de antes).

- [ ] **Step 4: Link público**

Abrir `/o/<token>` do mesmo orçamento. Expected: tabela; ajuste positivo interno NÃO aparece (regra `internal=false`); ajuste negativo aparece em verde.

- [ ] **Step 5: Mobile + print**

Viewport 375px: tabela comprime sem scroll horizontal. Print preview (botão Imprimir): tabela íntegra, elementos `no-print` ocultos.

- [ ] **Step 6: Reportar resultado com screenshots** (tela cards, tela tabela, público, mobile).
