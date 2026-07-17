# Excluir orçamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o dono do orçamento ou um admin exclua um orçamento (e seus itens) definitivamente, a partir da tela de detalhe, com confirmação.

**Architecture:** Uma server action `deleteQuote` valida permissão (reusando `canReassignOwner`), apaga o orçamento (itens caem por cascade) e redireciona para a lista. Um client component `DeleteQuoteButton` faz a confirmação via `window.confirm` e é renderizado no detalhe só para quem tem permissão.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres + RLS), React 19.

**Base branch:** `feature/clonar-e-multiplicador` (branch atual).

---

## File Structure

- `src/app/(app)/orcamentos/actions.ts` — **modificar**: nova action `deleteQuote`.
- `src/components/quote/delete-quote-button.tsx` — **criar**: botão de exclusão com confirmação.
- `src/app/(app)/orcamentos/[id]/page.tsx` — **modificar**: renderizar o botão quando `canReassign`.

**Comandos de verificação:** `npm run lint`, `npm run build`.

Sem migration: a RLS `q_all` (`for all to authenticated using(true)`) já permite delete e `quote_items` tem `on delete cascade`.

---

## Task 1: Server action `deleteQuote`

**Files:**
- Modify: `src/app/(app)/orcamentos/actions.ts`

- [ ] **Step 1: Adicionar a action ao final do arquivo**

Ao final de `src/app/(app)/orcamentos/actions.ts`, adicionar:

```ts
export async function deleteQuote(id: string): Promise<{ error: string } | void> {
  const { supabase, user, profile } = await getProfile()

  const { data: quote, error: qErr } = await supabase
    .from('quotes').select('created_by').eq('id', id).single()
  if (qErr || !quote) return { error: 'Orçamento não encontrado' }

  if (!canReassignOwner({ role: profile.role, userId: user.id, quoteOwnerId: quote.created_by })) {
    return { error: 'Sem permissão para excluir' }
  }

  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) return { error: 'Erro ao excluir: ' + error.message }

  revalidatePath('/')
  redirect('/')
}
```

- [ ] **Step 2: Verificar tipos/lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "actions.ts" || echo "no actions.ts type errors"`
Expected: `no actions.ts type errors`

Contexto: `getProfile`, `revalidatePath`, `redirect` (de `next/navigation`) e `canReassignOwner` (de `@/lib/quotes/ownership`) JÁ estão importados no topo deste arquivo — não adicionar imports. `redirect` lança `NEXT_REDIRECT`, por isso fica fora de qualquer try/catch e só após o delete. A action é uma cópia estrutural de `setQuoteOwner`/`cloneQuote`, que já existem no arquivo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/orcamentos/actions.ts"
git commit -m "feat(orcamentos): action deleteQuote com checagem de permissão

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Client component `DeleteQuoteButton`

**Files:**
- Create: `src/components/quote/delete-quote-button.tsx`

- [ ] **Step 1: Criar o componente**

Criar `src/components/quote/delete-quote-button.tsx` com:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { deleteQuote } from '@/app/(app)/orcamentos/actions'

export function DeleteQuoteButton({ quoteId }: { quoteId: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function onDelete() {
    if (!window.confirm('Excluir este orçamento? Esta ação não pode ser desfeita.')) return
    setPending(true); setError('')
    const res = await deleteQuote(quoteId)
    // sucesso: a action redireciona para /; só chega aqui em caso de erro
    if (res?.error) { setError(res.error); setPending(false) }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" onClick={onDelete}
        disabled={pending} className="text-red-700">
        {pending ? 'Excluindo…' : 'Excluir'}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos/lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "delete-quote-button" || echo "no delete-quote-button type errors"`
Expected: `no delete-quote-button type errors`
Run: `npm run lint 2>&1 | tail -5`
Expected: sem erros novos (apenas os 2 warnings pré-existentes em `layout.tsx`).

Contexto: `Button` é o componente do design system em `@/components/ui/button` (aceita `variant`, `size`, `className`, `disabled`, `onClick`). O padrão `'use client'` com `useState` já é usado por `quote-editor.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/quote/delete-quote-button.tsx
git commit -m "feat(quote): DeleteQuoteButton com confirmação

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Renderizar o botão no detalhe (só dono/admin)

**Files:**
- Modify: `src/app/(app)/orcamentos/[id]/page.tsx`

- [ ] **Step 1: Importar o componente**

Adicionar o import junto aos outros imports de componentes de quote no topo de `src/app/(app)/orcamentos/[id]/page.tsx` (logo após a linha que importa `OwnerSelect`):

```ts
import { DeleteQuoteButton } from '@/components/quote/delete-quote-button'
```

- [ ] **Step 2: Renderizar o botão no grupo do cabeçalho**

O cabeçalho tem um `<div className="ml-auto flex gap-2">` contendo o form "Clonar" e o link "Apresentar / Compartilhar". Substituir esse bloco:

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

por:

```tsx
        <div className="ml-auto flex gap-2">
          {canReassign && <DeleteQuoteButton quoteId={quote.id} />}
          <form action={cloneQuote.bind(null, quote.id)}>
            <SubmitButton type="submit" variant="outline" size="sm">Clonar</SubmitButton>
          </form>
          <Link href={`/orcamentos/${quote.id}/apresentacao`}>
            <Button type="button" variant="outline" size="sm">Apresentar / Compartilhar</Button>
          </Link>
        </div>
```

Contexto: `canReassign` já é calculado nesta página (via `canReassignOwner({ role: profile.role, userId: user.id, quoteOwnerId: quote.created_by })`) e é a mesma regra de permissão (dono ou admin). `quote`, `canReassign`, `cloneQuote`, `SubmitButton`, `Button`, `Link` já estão disponíveis/importados.

- [ ] **Step 3: Verificar build/lint**

Run: `npm run lint 2>&1 | tail -5`
Expected: sem erros novos.
Run: `npm run build 2>&1 | tail -5`
Expected: build com sucesso.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/orcamentos/[id]/page.tsx"
git commit -m "feat(orcamentos): botão Excluir no detalhe para dono/admin

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Verificação final

- [ ] **Step 1: Testes**

Run: `npm run test`
Expected: PASS (71 testes; nenhum teste novo, mas garante que nada quebrou).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 0 erros (2 warnings pré-existentes em `layout.tsx`).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sucesso.

- [ ] **Step 4: (Manual) Smoke test**

Após deploy/preview:
- Como dono ou admin, abrir o detalhe → botão "Excluir" visível.
- Clicar → confirmar → orçamento some e volta para a lista; os `quote_items` foram removidos (cascade).
- Como vendedor que não é dono, o botão "Excluir" não aparece.
- Cancelar o `window.confirm` → nada acontece.
