# Catálogo de Áreas de Atuação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o campo "Área de atuação" das empresas numa caixa de pesquisa alimentada por um catálogo de áreas no banco, com auto-cadastro de áreas novas e tela de gestão para o `admin_system`.

**Architecture:** Nova tabela `business_areas` (denormalizada) alimenta um `<input list>`+`<datalist>` nativo. `companies.business_area` continua `text`. Ao salvar empresa, a área digitada é inserida no catálogo (`on conflict do nothing`). Tela `/sistema/areas` (só admin_system) permite adicionar/renomear/remover.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS), TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-17-business-areas-catalog-design.md`

---

## Estrutura de arquivos

- Criar: `supabase/migrations/0020_business_areas.sql` — tabela + índice único + seed + RLS.
- Criar: `src/lib/business-area.ts` — helper `normalizeAreaName`.
- Criar: `src/lib/business-area.test.ts` — testes do helper.
- Criar: `src/components/business-area-input.tsx` — caixa de pesquisa reutilizável (client).
- Criar: `src/app/sistema/areas/page.tsx` — tela de gestão (server).
- Criar: `src/app/sistema/areas/actions.ts` — `createArea`/`renameArea`/`deleteArea`.
- Modificar: `src/app/(app)/admin/empresa/page.tsx` — busca áreas e passa à form.
- Modificar: `src/app/(app)/admin/empresa/company-form.tsx` — usa `BusinessAreaInput`.
- Modificar: `src/app/(app)/admin/empresa/actions.ts` — auto-add da área.
- Modificar: `src/app/sistema/empresas/nova/page.tsx` — busca áreas, usa componente.
- Modificar: `src/app/sistema/empresas/[id]/page.tsx` — busca áreas, usa componente.
- Modificar: `src/app/sistema/empresas/actions.ts` — auto-add em create e update.
- Modificar: `src/app/sistema/layout.tsx` — menu com links Empresas / Áreas.

---

## Task 1: Migration do catálogo de áreas

**Files:**
- Create: `supabase/migrations/0020_business_areas.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Catálogo compartilhado de áreas de atuação. Denormalizado: companies.business_area
-- continua text; esta tabela apenas alimenta a caixa de pesquisa.
create table business_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Unicidade case-insensitive: evita "Serralheria" vs "serralheria".
create unique index business_areas_name_lower_uq on business_areas (lower(name));

insert into business_areas (name) values ('Serralheria'), ('Construção')
  on conflict do nothing;

alter table business_areas enable row level security;

-- Leitura: qualquer usuário autenticado (lista compartilhada, não isolada por empresa).
create policy ba_read on business_areas for select to authenticated using (true);

-- Inserção: admins e vendedores (auto-add ao salvar empresa em /admin/empresa).
create policy ba_insert on business_areas for insert to authenticated
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid() and active
        and role in ('admin', 'vendedor', 'admin_system')
    )
  );

-- Edição e remoção: apenas admin_system (tela de gestão).
create policy ba_update on business_areas for update to authenticated
  using (is_admin_system()) with check (is_admin_system());
create policy ba_delete on business_areas for delete to authenticated
  using (is_admin_system());
```

- [ ] **Step 2: Aplicar a migration em produção via MCP**

Usar o MCP tool `supabase-apply_migration` no projeto `nwtfesocleshvynxrpfh`:
- `name`: `0020_business_areas`
- `query`: o conteúdo SQL acima.

Depois validar com `supabase-execute_sql`:
```sql
select name from business_areas order by name;
```
Expected: duas linhas — `Construção`, `Serralheria`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0020_business_areas.sql
git commit -m "feat: tabela business_areas com seed e RLS

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Helper de normalização (TDD)

**Files:**
- Create: `src/lib/business-area.ts`
- Test: `src/lib/business-area.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeAreaName } from './business-area'

describe('normalizeAreaName', () => {
  it('remove espaços das pontas', () => {
    expect(normalizeAreaName('  Serralheria  ')).toBe('Serralheria')
  })
  it('colapsa espaços internos', () => {
    expect(normalizeAreaName('Estruturas   Metálicas')).toBe('Estruturas Metálicas')
  })
  it('string vazia ou só espaços vira vazio', () => {
    expect(normalizeAreaName('   ')).toBe('')
    expect(normalizeAreaName('')).toBe('')
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/business-area.test.ts`
Expected: FAIL — `normalizeAreaName` não existe / módulo não encontrado.

- [ ] **Step 3: Implementar o helper**

```ts
export function normalizeAreaName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/business-area.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/business-area.ts src/lib/business-area.test.ts
git commit -m "feat: helper normalizeAreaName

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Componente BusinessAreaInput

**Files:**
- Create: `src/components/business-area-input.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
'use client'

export function BusinessAreaInput({
  areas,
  defaultValue,
  required,
  className,
}: {
  areas: string[]
  defaultValue?: string
  required?: boolean
  className?: string
}) {
  const listId = 'business-areas-list'
  return (
    <>
      <input
        name="business_area"
        list={listId}
        defaultValue={defaultValue ?? ''}
        required={required}
        placeholder="Pesquise ou digite uma área"
        className={className ?? 'w-full rounded border px-3 py-2'}
        autoComplete="off"
      />
      <datalist id={listId}>
        {areas.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
    </>
  )
}
```

Notas: `name="business_area"` mantém compatibilidade com os server actions atuais. `<datalist>` é nativo — pesquisável e ainda permite digitar uma área nova.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/components/business-area-input.tsx
git commit -m "feat: componente BusinessAreaInput com datalist

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Usar o componente em /admin/empresa

**Files:**
- Modify: `src/app/(app)/admin/empresa/page.tsx`
- Modify: `src/app/(app)/admin/empresa/company-form.tsx`

- [ ] **Step 1: Buscar áreas na page e passar à form**

Substituir todo o conteúdo de `src/app/(app)/admin/empresa/page.tsx` por:

```tsx
import { getCompany } from '@/lib/auth'
import { saveCompany } from './actions'
import { CompanyForm } from './company-form'

export default async function EmpresaPage() {
  const { supabase, company } = await getCompany()
  const { data: areas } = await supabase.from('business_areas').select('name').order('name')
  return (
    <CompanyForm
      settings={company}
      action={saveCompany}
      areas={(areas ?? []).map((a) => a.name as string)}
    />
  )
}
```

- [ ] **Step 2: Aceitar `areas` na CompanyForm e trocar o Input**

Em `src/app/(app)/admin/empresa/company-form.tsx`:

Adicionar o import (junto aos outros imports do topo):
```tsx
import { BusinessAreaInput } from '@/components/business-area-input'
```

Trocar a assinatura da função:
```tsx
export function CompanyForm({ settings, action, areas }: { settings: any; action: (fd: FormData) => Promise<void>; areas: string[] }) {
```

Trocar o bloco atual do campo (o `<div>` que contém `id="business_area"`) por:
```tsx
      <div className="space-y-2"><Label htmlFor="business_area">Área de atuação</Label>
        <BusinessAreaInput areas={areas} defaultValue={settings?.business_area ?? 'Serralheria'} required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" />
        <span className="block text-xs text-muted-foreground">Aparece na barra lateral e no título das páginas.</span></div>
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/admin/empresa/page.tsx" "src/app/(app)/admin/empresa/company-form.tsx"
git commit -m "feat: caixa de pesquisa de área em /admin/empresa

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Usar o componente em /sistema/empresas (nova e edição)

**Files:**
- Modify: `src/app/sistema/empresas/nova/page.tsx`
- Modify: `src/app/sistema/empresas/[id]/page.tsx`

- [ ] **Step 1: Nova empresa — buscar áreas e usar o componente**

Substituir todo o conteúdo de `src/app/sistema/empresas/nova/page.tsx` por:

```tsx
import { createServerSupabase } from '@/lib/supabase/server'
import { BusinessAreaInput } from '@/components/business-area-input'
import { createCompany } from '../actions'

export default async function NovaEmpresaPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('business_areas').select('name').order('name')
  const areas = (data ?? []).map((a) => a.name as string)
  return (
    <form action={createCompany} className="max-w-md space-y-3">
      <h2 className="text-lg font-semibold">Nova empresa</h2>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Nome da empresa</span>
        <input name="name" required className="w-full rounded border px-3 py-2" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Cidade</span>
        <input name="city" className="w-full rounded border px-3 py-2" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Telefone</span>
        <input name="phone" className="w-full rounded border px-3 py-2" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Área de atuação</span>
        <BusinessAreaInput areas={areas} required />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Cor destaque</span>
        <input type="color" name="accent_color" defaultValue="#006688" className="h-10 w-20 cursor-pointer rounded border" />
      </label>
      <fieldset className="space-y-3 rounded border p-3">
        <legend className="px-1 text-sm font-medium">Primeiro admin da empresa</legend>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Nome</span>
          <input name="admin_name" required className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input name="admin_email" type="email" required className="w-full rounded border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Senha (mín. 8)</span>
          <input name="admin_password" type="password" required minLength={8} className="w-full rounded border px-3 py-2" />
        </label>
      </fieldset>
      <button className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Criar empresa</button>
    </form>
  )
}
```

- [ ] **Step 2: Edição — buscar áreas e usar o componente**

Em `src/app/sistema/empresas/[id]/page.tsx`:

Adicionar o import (junto aos outros do topo):
```tsx
import { BusinessAreaInput } from '@/components/business-area-input'
```

Buscar áreas junto das outras queries. Trocar o bloco `Promise.all` por:
```tsx
  const [{ data: company }, { data: users }, { data: areasData }] = await Promise.all([
    supabase.from('companies').select('*').eq('id', id).single(),
    supabase.from('profiles').select('id, name, email, role, active').eq('company_id', id).order('name'),
    supabase.from('business_areas').select('name').order('name'),
  ])
  if (!company) notFound()
  const c = company as Company
  const areas = (areasData ?? []).map((a) => a.name as string)
```

Trocar o `<label>` da área de atuação (o que tem `input name="business_area"`) por:
```tsx
        <label className="block space-y-1">
          <span className="text-sm font-medium">Área de atuação</span>
          <BusinessAreaInput areas={areas} defaultValue={c.business_area} required />
        </label>
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/sistema/empresas/nova/page.tsx" "src/app/sistema/empresas/[id]/page.tsx"
git commit -m "feat: caixa de pesquisa de área em /sistema/empresas

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Auto-add da área ao salvar empresa

**Files:**
- Modify: `src/app/(app)/admin/empresa/actions.ts`
- Modify: `src/app/sistema/empresas/actions.ts`

- [ ] **Step 1: Auto-add em /admin/empresa**

Em `src/app/(app)/admin/empresa/actions.ts`:

Adicionar o import no topo:
```ts
import { normalizeAreaName } from '@/lib/business-area'
```

Dentro de `saveCompany`, calcular a área normalizada antes do `update` e reusá-la. Trocar a linha atual:
```ts
    business_area: String(formData.get('business_area') ?? '').trim() || 'Serralheria',
```
por (mantendo o resto do objeto igual):
```ts
    business_area: normalizeAreaName(String(formData.get('business_area') ?? '')) || 'Serralheria',
```

Depois do bloco `if (error) throw new Error(error.message)` (após o update ter sucesso), inserir o auto-add antes dos `revalidatePath`:
```ts
  const area = normalizeAreaName(String(formData.get('business_area') ?? ''))
  if (area) await supabase.from('business_areas').insert({ name: area })
```

Nota: conflito de unicidade (área já existe) é esperado e ignorado — não tratamos o erro do insert.

- [ ] **Step 2: Auto-add em /sistema/empresas (create e update)**

Em `src/app/sistema/empresas/actions.ts`:

Adicionar o import no topo:
```ts
import { normalizeAreaName } from '@/lib/business-area'
```

Em `createCompany`, trocar:
```ts
      business_area: String(fd.get('business_area') ?? '').trim() || 'Serralheria',
```
por:
```ts
      business_area: normalizeAreaName(String(fd.get('business_area') ?? '')) || 'Serralheria',
```
E logo após `if (cErr) throw new Error(cErr.message)` adicionar:
```ts
  const createArea = normalizeAreaName(String(fd.get('business_area') ?? ''))
  if (createArea) await admin.from('business_areas').insert({ name: createArea })
```

Em `updateCompany`, trocar:
```ts
    business_area: String(fd.get('business_area') ?? '').trim() || 'Serralheria',
```
por:
```ts
    business_area: normalizeAreaName(String(fd.get('business_area') ?? '')) || 'Serralheria',
```
E logo após `if (error) throw new Error(error.message)` (do update) adicionar:
```ts
  const updateArea = normalizeAreaName(String(fd.get('business_area') ?? ''))
  if (updateArea) await admin.from('business_areas').insert({ name: updateArea })
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/admin/empresa/actions.ts" "src/app/sistema/empresas/actions.ts"
git commit -m "feat: auto-cadastro de área nova ao salvar empresa

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Tela de gestão /sistema/areas

**Files:**
- Create: `src/app/sistema/areas/actions.ts`
- Create: `src/app/sistema/areas/page.tsx`
- Modify: `src/app/sistema/layout.tsx`

- [ ] **Step 1: Criar os server actions**

`src/app/sistema/areas/actions.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeAreaName } from '@/lib/business-area'

async function requireAdminSystem() {
  const { profile } = await getProfile()
  if (profile.role !== 'admin_system') throw new Error('Apenas admin_system')
}

export async function createArea(fd: FormData) {
  await requireAdminSystem()
  const name = normalizeAreaName(String(fd.get('name') ?? ''))
  if (!name) throw new Error('Nome obrigatório')
  const admin = createAdminClient()
  const { error } = await admin.from('business_areas').insert({ name })
  if (error) throw new Error(error.code === '23505' ? 'Área já existe' : error.message)
  revalidatePath('/sistema/areas')
}

export async function renameArea(fd: FormData) {
  await requireAdminSystem()
  const id = String(fd.get('id'))
  const name = normalizeAreaName(String(fd.get('name') ?? ''))
  if (!name) throw new Error('Nome obrigatório')
  const admin = createAdminClient()
  const { error } = await admin.from('business_areas').update({ name }).eq('id', id)
  if (error) throw new Error(error.code === '23505' ? 'Área já existe' : error.message)
  revalidatePath('/sistema/areas')
}

export async function deleteArea(fd: FormData) {
  await requireAdminSystem()
  const id = String(fd.get('id'))
  const admin = createAdminClient()
  const { error } = await admin.from('business_areas').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/sistema/areas')
}
```

- [ ] **Step 2: Criar a página**

`src/app/sistema/areas/page.tsx`:

```tsx
import { createServerSupabase } from '@/lib/supabase/server'
import { createArea, deleteArea, renameArea } from './actions'

interface Area { id: string; name: string }

export default async function AreasPage() {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.from('business_areas').select('id, name').order('name')
  if (error) throw new Error(error.message)
  const areas = (data ?? []) as Area[]
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Áreas de atuação</h2>
      <form action={createArea} className="flex gap-2">
        <input name="name" required placeholder="Nova área" className="flex-1 rounded border px-3 py-2" />
        <button className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">Adicionar</button>
      </form>
      <ul className="divide-y rounded border">
        {areas.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 p-3">
            <form action={renameArea} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="id" value={a.id} />
              <input name="name" defaultValue={a.name} className="flex-1 rounded border px-2 py-1 text-sm" />
              <button className="rounded border px-2 py-1 text-xs">Salvar</button>
            </form>
            <form action={deleteArea}>
              <input type="hidden" name="id" value={a.id} />
              <button className="rounded border px-2 py-1 text-xs text-red-600">Remover</button>
            </form>
          </li>
        ))}
        {areas.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhuma área.</li>}
      </ul>
      <p className="text-xs text-muted-foreground">Remover uma área não altera empresas já cadastradas.</p>
    </div>
  )
}
```

- [ ] **Step 3: Adicionar menu no layout do /sistema**

Substituir todo o conteúdo de `src/app/sistema/layout.tsx` por:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'

export default async function SistemaLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getProfile()
  if (profile.role !== 'admin_system') redirect('/')
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b px-4 py-3">
        <div className="mx-auto flex max-w-[960px] items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-semibold">Administração do sistema</h1>
            <nav className="flex gap-3 text-sm">
              <Link href="/sistema/empresas" className="text-muted-foreground hover:underline">Empresas</Link>
              <Link href="/sistema/areas" className="text-muted-foreground hover:underline">Áreas</Link>
            </nav>
          </div>
          <span className="text-sm text-muted-foreground">{profile.name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-[960px] p-4 md:p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/sistema/areas/actions.ts" "src/app/sistema/areas/page.tsx" "src/app/sistema/layout.tsx"
git commit -m "feat: tela de gestão de áreas em /sistema/areas

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Verificação final

**Files:** nenhum (só validação).

- [ ] **Step 1: Rodar a suíte de testes**

Run: `npm test`
Expected: todos os testes passam (117 anteriores + 3 novos = 120).

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: compila sem erros.

- [ ] **Step 4: Teste manual rápido (opcional mas recomendado)**

Iniciar `npm run dev` e verificar:
- `/admin/empresa`: campo Área de atuação mostra sugestões (Serralheria, Construção) e aceita digitar nova.
- `/sistema/areas`: lista, adiciona, renomeia e remove áreas.
- Salvar uma empresa com área nova → ela aparece em `/sistema/areas`.
