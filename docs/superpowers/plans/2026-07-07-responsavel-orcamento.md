# Responsável do Orçamento (exibir + reatribuir) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar o vendedor responsável (`quotes.created_by`) na lista e no detalhe, e permitir reatribuir via server action autorizada a "admin ou dono".

**Architecture:** Reusa a coluna existente `quotes.created_by` (FK → profiles). A regra de autorização é uma função pura testável (`canReassignOwner`); a server action `setQuoteOwner` a aplica no servidor antes de gravar. Exibição via embed do nome do perfil nas queries. Sem migration.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-responsavel-orcamento-design.md`

## Global Constraints

- `quotes.created_by` já existe (FK → `profiles(id)`, `on delete set null`) — reusado
- **Migration 0007** afrouxa `pr_read` de `profiles`: leitura liberada a qualquer autenticado (decisão do usuário) — necessária para vendedores verem/atribuírem colegas; escrita segue admin-only
- Autorização "admin ou dono" vive na **server action** (opção A); RLS de `quotes` permanece permissivo — não endurecer
- `created_by` nulo → exibir "Sem vendedor"
- Reatribuir para **qualquer usuário ativo** (`profiles.active = true`)
- pt-BR em toda UI; dinheiro/format já existentes; `SubmitButton` de `@/components/ui/submit-button`
- Verificação: `npm run test` (suíte atual = 57, sobe com os testes novos), `npm run lint`, `npm run build` limpos por task; verificação visual no browser fica com o controlador
- Não iniciar/matar dev server nas tasks

---

### Task 1: Regra de autorização `canReassignOwner` (TDD)

**Files:**
- Create: `src/lib/quotes/ownership.ts`
- Test: `src/lib/quotes/ownership.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `canReassignOwner(input: { role: 'admin' | 'vendedor'; userId: string; quoteOwnerId: string | null }): boolean` — true se admin OU se `userId === quoteOwnerId`; false caso contrário

- [ ] **Step 1: Teste que falha**

`src/lib/quotes/ownership.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canReassignOwner } from './ownership'

describe('canReassignOwner', () => {
  it('admin pode sempre, mesmo não sendo dono', () => {
    expect(canReassignOwner({ role: 'admin', userId: 'a', quoteOwnerId: 'b' })).toBe(true)
    expect(canReassignOwner({ role: 'admin', userId: 'a', quoteOwnerId: null })).toBe(true)
  })
  it('dono (vendedor) pode trocar o próprio orçamento', () => {
    expect(canReassignOwner({ role: 'vendedor', userId: 'a', quoteOwnerId: 'a' })).toBe(true)
  })
  it('vendedor não-dono não pode', () => {
    expect(canReassignOwner({ role: 'vendedor', userId: 'a', quoteOwnerId: 'b' })).toBe(false)
    expect(canReassignOwner({ role: 'vendedor', userId: 'a', quoteOwnerId: null })).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/quotes/ownership.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/lib/quotes/ownership.ts`:

```ts
export function canReassignOwner(input: {
  role: 'admin' | 'vendedor'
  userId: string
  quoteOwnerId: string | null
}): boolean {
  return input.role === 'admin' || input.userId === input.quoteOwnerId
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test`
Expected: verdes (57 + 3 novos = 60).

- [ ] **Step 5: Commit**

```bash
git add src/lib/quotes && git commit -m "feat: regra de autorização canReassignOwner (admin ou dono)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Server action `setQuoteOwner`

**Files:**
- Modify: `src/app/(app)/orcamentos/actions.ts` (adicionar a action ao final)

**Interfaces:**
- Consumes: `canReassignOwner` (Task 1); `getProfile` de `@/lib/auth`; `revalidatePath`
- Produces: `setQuoteOwner(quoteId: string, newOwnerId: string): Promise<{ ok: true } | { error: string }>`

- [ ] **Step 1: Adicionar imports**

No topo de `src/app/(app)/orcamentos/actions.ts`, adicionar (junto dos imports existentes):

```ts
import { canReassignOwner } from '@/lib/quotes/ownership'
```

- [ ] **Step 2: Adicionar a action ao final do arquivo**

```ts
export async function setQuoteOwner(
  quoteId: string,
  newOwnerId: string
): Promise<{ ok: true } | { error: string }> {
  const { supabase, user, profile } = await getProfile()

  const { data: quote, error: qErr } = await supabase
    .from('quotes').select('created_by').eq('id', quoteId).single()
  if (qErr || !quote) return { error: 'Orçamento não encontrado' }

  if (!canReassignOwner({ role: profile.role, userId: user.id, quoteOwnerId: quote.created_by })) {
    return { error: 'Sem permissão para trocar o responsável' }
  }

  const { data: target } = await supabase
    .from('profiles').select('id').eq('id', newOwnerId).eq('active', true).single()
  if (!target) return { error: 'Selecione um vendedor ativo' }

  const { error } = await supabase.from('quotes')
    .update({ created_by: newOwnerId, updated_at: new Date().toISOString() })
    .eq('id', quoteId)
  if (error) return { error: 'Erro ao trocar o responsável: ' + error.message }

  revalidatePath('/')
  revalidatePath(`/orcamentos/${quoteId}`)
  revalidatePath('/admin/dashboard')
  return { ok: true }
}
```

Nota: `getProfile()` retorna `{ user, profile, supabase }` — `profile.role` é `'admin' | 'vendedor'`.

- [ ] **Step 3: Verificar**

Run: `npm run build && npm run lint`
Expected: compila e lint limpo. `npm run test` → 60 verdes (sem novos testes aqui; a regra pura já é coberta na Task 1).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/orcamentos/actions.ts"
git commit -m "feat: server action setQuoteOwner (autoriza admin ou dono)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2b: Migration 0007 — afrouxar leitura de `profiles`

Sem essa mudança, o embed `creator:created_by(name)` e o dropdown de vendedores retornam vazio para não-admins (RLS `pr_read` restringe leitura ao próprio perfil), quebrando exibição e reatribuição por vendedores.

**Files:**
- Create: `supabase/migrations/0007_profiles_read_all.sql` (+ aplicar via MCP `apply_migration`, name `0007_profiles_read_all`, projeto `nwtfesocleshvynxrpfh`)

**Interfaces:**
- Consumes: —
- Produces: qualquer autenticado pode `select` em `profiles`; `pr_write` inalterado (admin-only)

- [ ] **Step 1: Migration**

`supabase/migrations/0007_profiles_read_all.sql`:

```sql
-- Leitura de perfis liberada a qualquer autenticado (nome/e-mail/papel visíveis
-- entre a equipe) — necessário para exibir e reatribuir o vendedor responsável.
-- Escrita permanece admin-only (pr_write inalterado). Anon continua sem acesso.
drop policy if exists pr_read on profiles;
create policy pr_read on profiles for select to authenticated using (true);
```

- [ ] **Step 2: Aplicar e verificar**

Aplicar via MCP `apply_migration` (projeto `nwtfesocleshvynxrpfh`, name `0007_profiles_read_all`, query acima). Depois, via `execute_sql`: `select polname, polcmd from pg_policies where tablename = 'profiles';` → Expected: `pr_read` (select) e `pr_write` (all) presentes; nenhuma política para `anon`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_profiles_read_all.sql
git commit -m "feat: leitura de profiles liberada a autenticados (RLS)

Permite exibir/reatribuir o vendedor responsável; escrita segue admin-only.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Exibir responsável (lista + detalhe) e seletor de reatribuição

**Files:**
- Modify: `src/app/(app)/page.tsx` (lista — embed do nome + exibição)
- Modify: `src/app/(app)/orcamentos/[id]/page.tsx` (detalhe — exibição + seletor)
- Create: `src/components/quote/owner-select.tsx` (client — form de troca com feedback de erro)

**Interfaces:**
- Consumes: `setQuoteOwner` (Task 2); `canReassignOwner` (Task 1); `SubmitButton`; `getProfile`
- Produces: `OwnerSelect({ quoteId, currentOwnerId, users }: { quoteId: string; currentOwnerId: string | null; users: { id: string; name: string }[] })` — client component

- [ ] **Step 1: Lista — embed do criador e exibição**

Em `src/app/(app)/page.tsx`, trocar a linha da query:

```tsx
  let query = supabase.from('quotes').select('*').order('created_at', { ascending: false }).limit(100)
```

por:

```tsx
  let query = supabase.from('quotes').select('*, creator:created_by(name)').order('created_at', { ascending: false }).limit(100)
```

E trocar o parágrafo de metadados da linha:

```tsx
                <p className="text-sm text-muted-foreground">
                  {new Date(qt.created_at).toLocaleDateString('pt-BR')} · {formatBRL(qt.total)}
                </p>
```

por:

```tsx
                <p className="text-sm text-muted-foreground">
                  {new Date(qt.created_at).toLocaleDateString('pt-BR')} · {formatBRL(qt.total)}
                  {' · '}Vendedor: {qt.creator?.name ?? 'Sem vendedor'}
                </p>
```

Nota: o embed `creator:created_by(name)` retorna `qt.creator` como objeto `{ name }` ou `null`. Para o TypeScript aceitar, o map já usa `qt` sem tipo explícito (inferido do select); se o lint acusar, anotar o callback como `(qt: any)` com `// eslint-disable-next-line @typescript-eslint/no-explicit-any` acima do `.map`.

- [ ] **Step 2: OwnerSelect (client)**

`src/components/quote/owner-select.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SubmitButton } from '@/components/ui/submit-button'
import { setQuoteOwner } from '@/app/(app)/orcamentos/actions'

export function OwnerSelect({ quoteId, currentOwnerId, users }: {
  quoteId: string
  currentOwnerId: string | null
  users: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [error, setError] = useState('')

  async function action(formData: FormData) {
    setError('')
    const newOwnerId = String(formData.get('owner') ?? '')
    const res = await setQuoteOwner(quoteId, newOwnerId)
    if ('error' in res) { setError(res.error); return }
    router.refresh()
  }

  return (
    <form action={action} className="flex items-center gap-2 text-sm">
      <label className="text-muted-foreground">Responsável:</label>
      <select name="owner" defaultValue={currentOwnerId ?? ''} className="rounded border bg-background p-1 text-sm">
        {currentOwnerId == null && <option value="">Sem vendedor</option>}
        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <SubmitButton size="sm" variant="outline">Alterar responsável</SubmitButton>
      {error && <span className="text-red-600">{error}</span>}
    </form>
  )
}
```

- [ ] **Step 3: Detalhe — carregar dados e renderizar**

Em `src/app/(app)/orcamentos/[id]/page.tsx`:

Adicionar imports:

```tsx
import { canReassignOwner } from '@/lib/quotes/ownership'
import { OwnerSelect } from '@/components/quote/owner-select'
```

Trocar a desestruturação e a query (linhas 14-18) para também trazer `user`, `profile`, o `created_by` do quote e a lista de usuários ativos:

```tsx
  const { supabase, user, profile } = await getProfile()
  const [{ data: quote }, products, { data: activeUsers }] = await Promise.all([
    supabase.from('quotes').select('*, quote_items(*), creator:created_by(name)').eq('id', id).single(),
    fetchProductConfigs(supabase),
    supabase.from('profiles').select('id, name').eq('active', true).order('name'),
  ])
  if (!quote) notFound()
```

Logo após `if (!quote) notFound()`, calcular a permissão:

```tsx
  const canReassign = canReassignOwner({
    role: profile.role,
    userId: user.id,
    quoteOwnerId: quote.created_by,
  })
```

No JSX, dentro da `div.no-print` (após os botões de status, antes de `</div>`), adicionar a exibição/seletor:

```tsx
        {canReassign
          ? <OwnerSelect quoteId={quote.id} currentOwnerId={quote.created_by}
              users={(activeUsers ?? []) as { id: string; name: string }[]} />
          : <span className="text-muted-foreground">Responsável: {quote.creator?.name ?? 'Sem vendedor'}</span>}
```

Nota: `quote.creator` vem do embed como `{ name } | null`. Se o TS reclamar do acesso `quote.created_by`/`quote.creator`, o `quote` já é tratado de forma flexível no arquivo (usa `as any[]` no `quote_items`); manter consistência com `// eslint-disable-next-line @typescript-eslint/no-explicit-any` se necessário sobre acessos ao `quote`.

- [ ] **Step 4: Verificar**

Run: `npm run build && npm run lint && npm run test`
Expected: build compila, lint limpo, 60 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/page.tsx" "src/app/(app)/orcamentos/[id]/page.tsx" src/components/quote/owner-select.tsx
git commit -m "feat: exibir responsável na lista/detalhe e seletor de reatribuição

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-review (feito na escrita)

- **Cobertura do spec:** §2 exibição lista+detalhe → T3 (embed `creator:created_by(name)`, "Sem vendedor" quando nulo); §3 reatribuição → T2 (action, autoriza, valida alvo ativo, revalida `/`, detalhe e dashboard) + T3 (seletor só quando `canReassign`); §4 segurança (controle na action) → T2; §5 testes (função pura de autorização) → T1
- **Placeholders:** nenhum
- **Consistência de tipos:** `canReassignOwner({ role, userId, quoteOwnerId })` idêntico em T1/T2/T3; `setQuoteOwner(quoteId, newOwnerId) → { ok: true } | { error: string }` idêntico em T2/T3; `OwnerSelect` props batem com o que o detalhe passa; embed usa o alias `creator` consistentemente em lista e detalhe
- **Risco conhecido:** tipos do embed do Supabase (`creator` como objeto vs array) — o Supabase retorna objeto para relação to-one via FK; acesso `?.name` é seguro; anotações `any` locais previstas onde o lint estrito reclamar, seguindo o padrão já usado no arquivo do detalhe
