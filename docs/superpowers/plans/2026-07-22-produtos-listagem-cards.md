# Redesenho da listagem de Preços (cards) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a listagem `<ul>` da tela `/admin/produtos` por cards com badge de modo, contagem de grupos, toggle de ativo funcional e ações por ícone.

**Architecture:** Server Component busca produtos + contagem de grupos via Supabase. Labels de exibição ficam num módulo puro testável (`product-listing.ts`). O toggle de ativo e o painel de novo produto são pequenos Client Components; toggle usa `useTransition` chamando a server action `toggleProductActive`. Excluir e novo-produto reusam as actions existentes.

**Tech Stack:** Next.js (App Router, Server Actions), React 19, `@base-ui/react` (Switch, Button, Badge), Material Symbols (`Icon`), Supabase, Tailwind, Vitest.

## Global Constraints

- Rota: `src/app/(app)/admin/produtos/page.tsx` (Server Component, `async`).
- `pricing_mode`: `'m2' | 'm2_direto' | 'fixo' | 'manual'` (valores exatos).
- Server actions do projeto lançam `throw new Error(error.message)` em falha e chamam `revalidatePath('/admin/produtos')`.
- Escopo de dados por RLS; actions de leitura/escrita simples usam `getProfile()` (padrão do `deleteProduct`).
- Formatação monetária: `formatBRL` de `@/lib/format`.
- Ícones via componente `Icon` (`@/components/ui/icon`), `name` = Material Symbol.
- Testes unitários ficam em `src/lib/**/*.test.ts`, ambiente `node` (vitest). Rodar: `npx vitest run <arquivo>`.
- Sem migration / sem mudança de schema.

---

### Task 1: Helpers puros de exibição (`product-listing.ts`)

**Files:**
- Create: `src/lib/pricing/product-listing.ts`
- Test: `src/lib/pricing/product-listing.test.ts`

**Interfaces:**
- Consumes: `formatBRL` de `@/lib/format`.
- Produces:
  - `type PricingMode = 'm2' | 'm2_direto' | 'fixo' | 'manual'`
  - `pricingModeLabel(mode: PricingMode): string`
  - `priceLabel(p: { pricing_mode: PricingMode; price_per_m2: number | null; base_price: number | null }): string | null`
  - `groupsCountLabel(n: number): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/pricing/product-listing.test.ts
import { describe, it, expect } from 'vitest'
import { pricingModeLabel, priceLabel, groupsCountLabel } from './product-listing'

describe('pricingModeLabel', () => {
  it('mapeia cada modo', () => {
    expect(pricingModeLabel('m2')).toBe('Por m²')
    expect(pricingModeLabel('m2_direto')).toBe('Por m² direto')
    expect(pricingModeLabel('fixo')).toBe('Fixo')
    expect(pricingModeLabel('manual')).toBe('Sob consulta')
  })
})

describe('priceLabel', () => {
  it('m2 e m2_direto usam price_per_m2 com sufixo /m²', () => {
    expect(priceLabel({ pricing_mode: 'm2', price_per_m2: 650, base_price: null }))
      .toBe('R$ 650,00/m²')
    expect(priceLabel({ pricing_mode: 'm2_direto', price_per_m2: 450, base_price: null }))
      .toBe('R$ 450,00/m²')
  })
  it('fixo usa base_price sem sufixo', () => {
    expect(priceLabel({ pricing_mode: 'fixo', price_per_m2: null, base_price: 4800 }))
      .toBe('R$ 4.800,00')
  })
  it('manual não tem preço', () => {
    expect(priceLabel({ pricing_mode: 'manual', price_per_m2: null, base_price: null }))
      .toBeNull()
  })
  it('trata nulos como zero', () => {
    expect(priceLabel({ pricing_mode: 'm2', price_per_m2: null, base_price: null }))
      .toBe('R$ 0,00/m²')
  })
})

describe('groupsCountLabel', () => {
  it('singular e plural', () => {
    expect(groupsCountLabel(0)).toBe('0 grupos de opções')
    expect(groupsCountLabel(1)).toBe('1 grupo de opções')
    expect(groupsCountLabel(2)).toBe('2 grupos de opções')
  })
})
```

> Nota: `formatBRL` usa `Intl.NumberFormat('pt-BR', currency)`, que insere espaço **não-quebrável** (` `) entre `R$` e o número. Por isso os `expect` usam ` `.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pricing/product-listing.test.ts`
Expected: FAIL — `Failed to resolve import "./product-listing"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/pricing/product-listing.ts
import { formatBRL } from '@/lib/format'

export type PricingMode = 'm2' | 'm2_direto' | 'fixo' | 'manual'

const MODE_LABELS: Record<PricingMode, string> = {
  m2: 'Por m²',
  m2_direto: 'Por m² direto',
  fixo: 'Fixo',
  manual: 'Sob consulta',
}

export function pricingModeLabel(mode: PricingMode): string {
  return MODE_LABELS[mode]
}

export function priceLabel(p: {
  pricing_mode: PricingMode
  price_per_m2: number | null
  base_price: number | null
}): string | null {
  if (p.pricing_mode === 'm2' || p.pricing_mode === 'm2_direto') {
    return `${formatBRL(p.price_per_m2 ?? 0)}/m²`
  }
  if (p.pricing_mode === 'fixo') {
    return formatBRL(p.base_price ?? 0)
  }
  return null
}

export function groupsCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'grupo' : 'grupos'} de opções`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pricing/product-listing.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/product-listing.ts src/lib/pricing/product-listing.test.ts
git commit -m "feat(precos): helpers de exibicao da listagem de produtos"
```

---

### Task 2: Server action `toggleProductActive`

**Files:**
- Modify: `src/app/(app)/admin/produtos/actions.ts`

**Interfaces:**
- Consumes: `getProfile` de `@/lib/auth`, `revalidatePath` de `next/cache`.
- Produces: `toggleProductActive(id: string, active: boolean): Promise<void>`.

- [ ] **Step 1: Add the action**

Adicionar ao fim de `src/app/(app)/admin/produtos/actions.ts` (o arquivo já importa `revalidatePath` e `getProfile`):

```ts
export async function toggleProductActive(id: string, active: boolean) {
  const { supabase } = await getProfile()
  const { error } = await supabase
    .from('product_types')
    .update({ active })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/produtos')
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos referentes a `actions.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/admin/produtos/actions.ts
git commit -m "feat(precos): action toggleProductActive"
```

---

### Task 3: `ActiveToggle` (Client Component, Switch funcional)

**Files:**
- Create: `src/app/(app)/admin/produtos/active-toggle.tsx`

**Interfaces:**
- Consumes: `toggleProductActive` (Task 2), `Switch` de `@base-ui/react/switch`, `cn` de `@/lib/utils`.
- Produces: `ActiveToggle({ id, active }: { id: string; active: boolean })`.

Base UI Switch expõe `Switch.Root` (props `checked`, `onCheckedChange(checked, details)`, `disabled`) e `Switch.Thumb`. O estado marcado aplica o atributo `data-checked` no Root (e `data-unchecked` quando desligado), usados para estilizar via Tailwind.

- [ ] **Step 1: Implement component**

```tsx
// src/app/(app)/admin/produtos/active-toggle.tsx
'use client'
import { useState, useTransition } from 'react'
import { Switch } from '@base-ui/react/switch'
import { cn } from '@/lib/utils'
import { toggleProductActive } from './actions'

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [checked, setChecked] = useState(active)
  const [pending, startTransition] = useTransition()

  function onCheckedChange(next: boolean) {
    setChecked(next) // otimista
    startTransition(async () => {
      try {
        await toggleProductActive(id, next)
      } catch {
        setChecked(!next) // reverte em erro
      }
    })
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={pending}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
          'border border-transparent transition-colors outline-none',
          'focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
          'bg-input data-[checked]:bg-primary',
        )}
      >
        <Switch.Thumb
          className={cn(
            'block size-5 rounded-full bg-background shadow transition-transform',
            'translate-x-0.5 data-[checked]:translate-x-[22px]',
          )}
        />
      </Switch.Root>
      <span className="text-muted-foreground">{checked ? 'Ativo' : 'Inativo'}</span>
    </label>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros em `active-toggle.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/admin/produtos/active-toggle.tsx
git commit -m "feat(precos): ActiveToggle com switch funcional"
```

---

### Task 4: `NewProductPanel` (Client Component, expande o form inline)

**Files:**
- Create: `src/app/(app)/admin/produtos/new-product-panel.tsx`

**Interfaces:**
- Consumes: `Button` de `@/components/ui/button`, `Icon` de `@/components/ui/icon`.
- Produces: `NewProductPanel({ children }: { children: React.ReactNode })` — recebe o `<ProductForm>` já renderizado no server como children e alterna sua visibilidade.

- [ ] **Step 1: Implement component**

```tsx
// src/app/(app)/admin/produtos/new-product-panel.tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

export function NewProductPanel({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant={open ? 'outline' : 'default'} onClick={() => setOpen(o => !o)}>
          {open ? 'Cancelar' : (<><Icon name="add" /> Novo produto</>)}
        </Button>
      </div>
      {open && children}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros em `new-product-panel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/admin/produtos/new-product-panel.tsx
git commit -m "feat(precos): NewProductPanel para novo produto inline"
```

---

### Task 5: Reescrever `page.tsx` com o layout de cards

**Files:**
- Modify (reescrever o corpo): `src/app/(app)/admin/produtos/page.tsx`

**Interfaces:**
- Consumes: `pricingModeLabel`, `priceLabel`, `groupsCountLabel` (Task 1); `ActiveToggle` (Task 3); `NewProductPanel` (Task 4); `saveProduct`, `deleteProduct` (existentes); `ProductForm`, `SubmitButton`, `Badge`, `Icon`, `Link`.
- Produces: página renderizada.

Query passa a incluir a contagem de grupos: `select('*, option_groups(count)')`. O Supabase retorna `option_groups: [{ count: N }]` (array com um objeto). Deriva-se `groupsCount = p.option_groups?.[0]?.count ?? 0`.

- [ ] **Step 1: Reescrever o arquivo**

```tsx
// src/app/(app)/admin/produtos/page.tsx
import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  pricingModeLabel,
  priceLabel,
  groupsCountLabel,
  type PricingMode,
} from '@/lib/pricing/product-listing'
import { deleteProduct, saveProduct } from './actions'
import { ProductForm } from './product-form'
import { ActiveToggle } from './active-toggle'
import { NewProductPanel } from './new-product-panel'

export default async function ProdutosPage({ searchParams }: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const { supabase } = await getProfile()
  let query = supabase
    .from('product_types')
    .select('*, option_groups(count)')
    .order('sort_order')
    .order('name')
  if (q) query = query.ilike('name', `%${q}%`)
  const { data } = await query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products = (data ?? []) as any[]

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Preços</h1>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {products.length} {products.length === 1 ? 'produto cadastrado' : 'produtos cadastrados'}
        </p>
      </div>

      <NewProductPanel>
        <ProductForm action={saveProduct} />
      </NewProductPanel>

      {products.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Nenhum produto cadastrado.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border">
          {products.map((p, i) => {
            const groupsCount = p.option_groups?.[0]?.count ?? 0
            const price = priceLabel(p)
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-4 p-4 ${i > 0 ? 'border-t' : ''} ${!p.active ? 'opacity-60' : ''}`}
              >
                <div className="min-w-0 space-y-1">
                  <Link href={`/admin/produtos/${p.id}`} className="font-semibold hover:underline">
                    {p.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <Badge variant="secondary">{pricingModeLabel(p.pricing_mode as PricingMode)}</Badge>
                    {price && <span className="font-medium text-foreground">{price}</span>}
                    <span>{groupsCountLabel(groupsCount)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ActiveToggle id={p.id} active={p.active} />
                  <Button
                    render={<Link href={`/admin/produtos/${p.id}`} />}
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Editar"
                  >
                    <Icon name="edit" />
                  </Button>
                  <form action={deleteProduct.bind(null, p.id)}>
                    <SubmitButton variant="ghost" size="icon-sm" className="text-destructive" aria-label="Excluir">
                      <Icon name="delete" />
                    </SubmitButton>
                  </form>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

> Nota sobre `Button render={<Link/>}`: o `Button` do projeto é base-ui e aceita `render` para trocar o elemento raiz (padrão base-ui `useRender`). Se o typecheck acusar incompatibilidade na prop `render`, trocar por um `<Link>` estilizado com `buttonVariants({ variant: 'ghost', size: 'icon-sm' })` importado de `@/components/ui/button`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros. Se `render` falhar, aplicar o fallback da nota acima e repetir.

- [ ] **Step 3: Lint**

Run: `npx eslint src/app/\(app\)/admin/produtos/page.tsx`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/admin/produtos/page.tsx"
git commit -m "feat(precos): listagem de produtos em cards com toggle e acoes"
```

---

### Task 6: Verificação no preview

**Files:** nenhuma alteração — verificação manual guiada.

- [ ] **Step 1: Subir o dev server** via preview (`.claude/launch.json`, ou criar entrada `npm run dev`). Navegar para `/admin/produtos` autenticado como admin de uma empresa com produtos cadastrados.

- [ ] **Step 2: Conferir visual e dados**
  - Contagem "N produtos cadastrados" bate com a lista.
  - Cada card mostra badge correta por modo (Por m² / Por m² direto / Fixo / Sob consulta).
  - Preço formatado: `R$ x,xx/m²` para m²/m²-direto, valor cheio para fixo, sem preço para manual.
  - "N grupos de opções" com singular/plural correto.

- [ ] **Step 3: Testar toggle**
  - Clicar no Switch de um produto → rótulo muda Ativo/Inativo na hora.
  - Recarregar → estado persistiu (via `toggleProductActive` + revalidate).
  - Verificar console/network sem erros (`read_console_messages`).

- [ ] **Step 4: Testar novo produto e excluir**
  - `+ Novo produto` expande o `ProductForm`; "Cancelar" recolhe.
  - Adicionar produto → aparece na lista; contagem incrementa.
  - Ícone lixeira exclui → some da lista; contagem decrementa.

- [ ] **Step 5: Screenshot** da tela final e comparar com o mockup aprovado.

- [ ] **Step 6: Rodar suíte completa e typecheck finais**

```bash
npx vitest run && npx tsc --noEmit
```
Expected: todos verdes.

---

## Self-Review

**Cobertura do spec:**
- Cabeçalho com contagem + botão Novo produto → Task 5 (contagem) + Task 4 (botão/expansão).
- Card container com linhas divididas, nome, badge, preço, contagem de grupos → Task 5.
- Toggle Ativo funcional → Task 2 (action) + Task 3 (componente) + Task 5 (uso).
- Ícone editar (link detalhe) + excluir (deleteProduct mantido) → Task 5.
- Query com `option_groups(count)` → Task 5.
- Labels de modo/preço/grupos → Task 1 (com testes).
- Sem migration → respeitado.
- Fora de escopo (ProductForm interno, group/model-editor, detalhe) → não tocados.

**Placeholder scan:** sem TBD/TODO; todo código presente; testes com asserts reais.

**Consistência de tipos:** `PricingMode` definido na Task 1 e reusado na Task 5; `toggleProductActive(id, active)` idêntico entre Task 2/3; `ActiveToggle({id, active})` e `NewProductPanel({children})` consistentes com os usos na Task 5.
