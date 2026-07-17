# Vínculo de Usuários pelo admin_system — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/sistema/usuarios` para o `admin_system` criar usuários vinculados a uma empresa e reatribuir usuários existentes (empresa, papel, ativo).

**Architecture:** Server Component lista todos os perfis (via `createAdminClient`, service-role, cross-company) + selects de empresa/papel e toggle ativo por linha; duas server actions (`createPlatformUser`, `assignUser`) guardadas por `role === 'admin_system'`. Novo link no header do `SistemaLayout`. Não altera `/admin/usuarios` nem a RLS.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (service-role admin client), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-07-17-sistema-usuarios-design.md`

## Global Constraints

- Copy/UI em pt-BR.
- Papéis atribuíveis: apenas `admin` e `vendedor`, sempre com uma empresa (respeita o CHECK `profiles_admin_system_company`: `(role='admin_system') = (company_id IS NULL)`).
- Actions usam `createAdminClient()` (service-role) — mesmo padrão de `src/app/(app)/admin/usuarios/actions.ts`.
- Não há suíte de teste de páginas/actions Next; validação é `npx tsc --noEmit` + `npm test` (unit) + `npm run build`. As regras puras (normalização de papel / validação) ficam numa função testável.
- Commits em pt-BR estilo `feat(escopo): descrição`. Incluir trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

---

### Task 1: Helpers puros e testáveis

**Files:**
- Create: `src/lib/users/assign.ts`
- Create: `src/lib/users/assign.test.ts`

**Interfaces:**
- Produces: `normalizeCompanyRole(input: string): 'admin' | 'vendedor'` e `validateAssignInput(x): { ok: true } | { ok: false; error: string }`. Tasks 2-3 consomem esses helpers nas actions.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/lib/users/assign.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeCompanyRole, validateAssignInput } from './assign'

describe('normalizeCompanyRole', () => {
  it('mantém admin', () => expect(normalizeCompanyRole('admin')).toBe('admin'))
  it('qualquer outro valor vira vendedor', () => {
    expect(normalizeCompanyRole('vendedor')).toBe('vendedor')
    expect(normalizeCompanyRole('admin_system')).toBe('vendedor')
    expect(normalizeCompanyRole('')).toBe('vendedor')
  })
})

describe('validateAssignInput', () => {
  it('ok quando id e companyId presentes', () => {
    expect(validateAssignInput({ id: 'u1', companyId: 'c1' })).toEqual({ ok: true })
  })
  it('erro sem id', () => {
    expect(validateAssignInput({ id: '', companyId: 'c1' })).toEqual({ ok: false, error: 'Usuário inválido' })
  })
  it('erro sem empresa', () => {
    expect(validateAssignInput({ id: 'u1', companyId: '' })).toEqual({ ok: false, error: 'Selecione uma empresa' })
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/users/assign.test.ts`
Expected: FAIL (módulo `./assign` não existe).

- [ ] **Step 3: Implementar os helpers**

Create `src/lib/users/assign.ts`:

```ts
export function normalizeCompanyRole(input: string): 'admin' | 'vendedor' {
  return input === 'admin' ? 'admin' : 'vendedor'
}

export function validateAssignInput(x: { id: string; companyId: string }):
  { ok: true } | { ok: false; error: string } {
  if (!x.id) return { ok: false, error: 'Usuário inválido' }
  if (!x.companyId) return { ok: false, error: 'Selecione uma empresa' }
  return { ok: true }
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/users/assign.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/users/assign.ts src/lib/users/assign.test.ts
git commit -m "feat(sistema): helpers de vínculo de usuário (papel/validação)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Server actions

**Files:**
- Create: `src/app/sistema/usuarios/actions.ts`

**Interfaces:**
- Consumes: `normalizeCompanyRole`, `validateAssignInput` (Task 1); `createAdminClient` (`src/lib/supabase/admin.ts`); `getProfile` (`src/lib/auth.ts`).
- Produces: `createPlatformUser(fd: FormData)` e `assignUser(fd: FormData)`. Task 3 (page) importa ambas.

- [ ] **Step 1: Implementar as actions**

Create `src/app/sistema/usuarios/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeCompanyRole, validateAssignInput } from '@/lib/users/assign'

async function requireSystemAdmin() {
  const { profile } = await getProfile()
  if (profile.role !== 'admin_system') throw new Error('Apenas admin_system')
}

async function companyExists(companyId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('companies').select('id').eq('id', companyId).maybeSingle()
  return !!data
}

export async function createPlatformUser(fd: FormData) {
  await requireSystemAdmin()
  const name = String(fd.get('name') ?? '').trim()
  const email = String(fd.get('email') ?? '').trim()
  const password = String(fd.get('password') ?? '')
  const companyId = String(fd.get('company_id') ?? '')
  const role = normalizeCompanyRole(String(fd.get('role') ?? ''))

  const v = validateAssignInput({ id: 'novo', companyId })
  if (!v.ok) throw new Error(v.error)
  if (!name || !email || password.length < 8) {
    throw new Error('Dados inválidos (senha mínima: 8 caracteres)')
  }
  if (!(await companyExists(companyId))) throw new Error('Empresa inválida')

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(error.message)
  const { error: pErr } = await admin.from('profiles')
    .insert({ id: data.user.id, email, name, role, company_id: companyId })
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id) // rollback: sem profile órfão
    throw new Error(pErr.message)
  }
  revalidatePath('/sistema/usuarios')
}

export async function assignUser(fd: FormData) {
  await requireSystemAdmin()
  const id = String(fd.get('id') ?? '')
  const companyId = String(fd.get('company_id') ?? '')
  const role = normalizeCompanyRole(String(fd.get('role') ?? ''))
  const active = fd.get('active') === 'on'

  const v = validateAssignInput({ id, companyId })
  if (!v.ok) throw new Error(v.error)
  if (!(await companyExists(companyId))) throw new Error('Empresa inválida')

  const admin = createAdminClient()
  // não permite alterar perfis de plataforma
  const { data: target } = await admin.from('profiles').select('role').eq('id', id).maybeSingle()
  if (!target) throw new Error('Usuário não encontrado')
  if (target.role === 'admin_system') throw new Error('Não é possível alterar um usuário do sistema')

  const { error } = await admin.from('profiles')
    .update({ company_id: companyId, role, active }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/sistema/usuarios')
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/sistema/usuarios/actions.ts
git commit -m "feat(sistema): actions de criar e reatribuir usuários

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Página `/sistema/usuarios`

**Files:**
- Create: `src/app/sistema/usuarios/page.tsx`

**Interfaces:**
- Consumes: `createPlatformUser`, `assignUser` (Task 2); `createAdminClient`; componentes `Input`/`SubmitButton`.
- Produces: rota `/sistema/usuarios`. Task 4 adiciona o link do menu.

- [ ] **Step 1: Implementar a página**

Create `src/app/sistema/usuarios/page.tsx`:

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { assignUser, createPlatformUser } from './actions'

interface ProfileRow {
  id: string; name: string; email: string; role: string; active: boolean; company_id: string | null
}
interface CompanyRow { id: string; name: string }

export default async function SistemaUsuariosPage() {
  const admin = createAdminClient()
  const [{ data: users }, { data: companies }] = await Promise.all([
    admin.from('profiles').select('id, name, email, role, active, company_id').order('created_at'),
    admin.from('companies').select('id, name').order('name'),
  ])
  const rows = (users ?? []) as ProfileRow[]
  const comps = (companies ?? []) as CompanyRow[]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Usuários</h2>
        <p className="text-sm text-muted-foreground">Vincule usuários a uma empresa e defina o papel.</p>
      </div>

      <ul className="space-y-2">
        {rows.map(u => u.role === 'admin_system' ? (
          <li key={u.id} className="flex flex-wrap items-center gap-2 rounded border border-dashed p-3">
            <span className="font-medium">{u.name}</span>
            <span className="text-sm text-muted-foreground">{u.email}</span>
            <span className="ml-auto text-xs text-muted-foreground">admin do sistema (não editável)</span>
          </li>
        ) : (
          <li key={u.id}>
            <form action={assignUser} className="flex flex-wrap items-center gap-2 rounded border p-3">
              <input type="hidden" name="id" value={u.id} />
              <span className="font-medium">{u.name}</span>
              <span className="text-sm text-muted-foreground">{u.email}</span>
              <select name="company_id" defaultValue={u.company_id ?? ''} className="rounded border bg-background p-1 text-sm">
                <option value="" disabled>Empresa…</option>
                {comps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select name="role" defaultValue={u.role} className="rounded border bg-background p-1 text-sm">
                <option value="vendedor">Vendedor</option>
                <option value="admin">Admin</option>
              </select>
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="active" defaultChecked={u.active} /> Ativo
              </label>
              <SubmitButton size="sm" variant="outline">Salvar</SubmitButton>
            </form>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <h3 className="font-semibold">Novo usuário</h3>
        <form action={createPlatformUser} className="flex flex-wrap items-end gap-2 rounded border p-3">
          <div><label className="text-xs">Nome</label><Input name="name" required /></div>
          <div><label className="text-xs">E-mail</label><Input name="email" type="email" required /></div>
          <div><label className="text-xs">Senha (mín. 8)</label><Input name="password" type="password" required minLength={8} /></div>
          <select name="company_id" defaultValue="" required className="rounded border bg-background p-2 text-sm">
            <option value="" disabled>Empresa…</option>
            {comps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="role" defaultValue="vendedor" className="rounded border bg-background p-2 text-sm">
            <option value="vendedor">Vendedor</option>
            <option value="admin">Admin</option>
          </select>
          <SubmitButton size="sm" pendingLabel="Criando…">Criar</SubmitButton>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/sistema/usuarios/page.tsx
git commit -m "feat(sistema): página de vínculo de usuários

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Link no menu de Sistema

**Files:**
- Modify: `src/app/sistema/layout.tsx`

**Interfaces:**
- Consumes: rota `/sistema/usuarios` (Task 3).

- [ ] **Step 1: Adicionar o link**

Em `src/app/sistema/layout.tsx`, dentro do `<nav>`, após o link de "Áreas":

```tsx
              <Link href="/sistema/usuarios" className="text-muted-foreground hover:underline">Usuários</Link>
```

- [ ] **Step 2: Verificar build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS; rota `/sistema/usuarios` listada na saída do build.

- [ ] **Step 3: Verificação manual (preview)**

Subir dev server e, como `admin_system`:
1. Acessar `/sistema/usuarios` pelo link "Usuários".
2. Criar usuário vinculado à empresa A → aparece na lista com empresa/papel corretos.
3. Reatribuir esse usuário para a empresa B, trocar papel e desmarcar "Ativo" → salvar → recarregar → alterações persistem.
4. Confirmar que um perfil `admin_system` aparece apenas como leitura (sem formulário).
5. Confirmar que a página `/admin/usuarios` (modo suporte) continua mostrando só a empresa em atuação (inalterada).

- [ ] **Step 4: Commit**

```bash
git add src/app/sistema/layout.tsx
git commit -m "feat(sistema): link Usuários no menu de Sistema

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
