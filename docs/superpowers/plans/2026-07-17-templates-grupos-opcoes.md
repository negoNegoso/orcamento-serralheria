# Templates de Grupos de Opções — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biblioteca de templates de grupos de opções por empresa, com tela admin própria, aplicação por cópia independente em produtos e "salvar grupo como template".

**Architecture:** Duas tabelas espelho (`option_group_templates`, `option_templates`) com RLS idêntica às tabelas de configuração existentes. Tela `/admin/templates` segue o padrão CRUD inline de `group-editor.tsx`. Aplicar/salvar são server actions que copiam linhas entre tabelas (rollback manual em falha).

**Tech Stack:** Next.js App Router (server components + server actions), Supabase (Postgres + RLS), TypeScript, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-17-templates-grupos-opcoes-design.md`

## Global Constraints

- Multi-tenant: toda linha nova leva `company_id`; toda action valida empresa via `getCompany()` e lança `Error('Sem empresa ativa')` se ausente.
- Padrão de erro das actions: `throw new Error(mensagem)` em português.
- Cópia independente: aplicar template NUNCA cria vínculo; editar template não afeta produtos.
- Nome duplicado de template é permitido (sem unique constraint).
- Projeto não tem testes de server actions — verificação por typecheck/lint/build + manual via preview.
- Este Next.js tem breaking changes: consultar `node_modules/next/dist/docs/` em caso de dúvida de API.

---

### Task 1: Migração — tabelas e RLS

**Files:**
- Create: `supabase/migrations/0023_group_templates.sql`

**Interfaces:**
- Produces: tabelas `option_group_templates(id, company_id, name, required, created_at)` e `option_templates(id, template_id, company_id, label, surcharge_type, surcharge_value, sort_order)` com RLS (leitura por membro, escrita por admin da empresa).

- [ ] **Step 1: Escrever a migração**

```sql
-- Templates de grupos de opções (biblioteca por empresa)
create table option_group_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  required boolean not null default false,
  created_at timestamptz not null default now()
);
create index option_group_templates_company_idx on option_group_templates(company_id);

create table option_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references option_group_templates(id) on delete cascade,
  company_id uuid not null references companies(id),
  label text not null,
  surcharge_type text not null default 'fixo' check (surcharge_type in ('fixo','por_m2')),
  surcharge_value numeric not null default 0,
  sort_order int not null default 0
);
create index option_templates_company_idx on option_templates(company_id);
create index option_templates_template_idx on option_templates(template_id);

alter table option_group_templates enable row level security;
alter table option_templates enable row level security;

create policy ogt_read on option_group_templates for select to authenticated
  using (company_id = current_company_id());
create policy ogt_write on option_group_templates for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());

create policy ot_read on option_templates for select to authenticated
  using (company_id = current_company_id());
create policy ot_write on option_templates for all to authenticated
  using (company_id = current_company_id() and is_company_admin())
  with check (company_id = current_company_id() and is_company_admin());
```

- [ ] **Step 2: Aplicar a migração**

Aplicar no projeto Supabase via MCP (`apply_migration` com name `0023_group_templates`) ou, se houver CLI linkada, `npx supabase db push`.
Expected: sem erro; migração listada.

- [ ] **Step 3: Verificar tabelas**

Executar SQL (MCP `execute_sql`):
```sql
select table_name from information_schema.tables
where table_name in ('option_group_templates','option_templates');
```
Expected: 2 linhas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0023_group_templates.sql
git commit -m "feat(db): tabelas de templates de grupos de opções com RLS"
```

---

### Task 2: Tipos

**Files:**
- Modify: `src/lib/config-types.ts` (adicionar ao final do arquivo)

**Interfaces:**
- Produces: `OptionTemplateRow { id, label, surcharge_type: 'fixo' | 'por_m2', surcharge_value: number, sort_order: number }` e `GroupTemplateRow { id, name, required: boolean, option_templates: OptionTemplateRow[] }` — usados pelas Tasks 3 e 4. Nome do array é `option_templates` (igual ao nome da tabela, como o Supabase retorna em select aninhado).

- [ ] **Step 1: Adicionar tipos**

Ao final de `src/lib/config-types.ts`:

```ts
export interface OptionTemplateRow {
  id: string
  label: string
  surcharge_type: 'fixo' | 'por_m2'
  surcharge_value: number
  sort_order: number
}

export interface GroupTemplateRow {
  id: string
  name: string
  required: boolean
  option_templates: OptionTemplateRow[]
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/config-types.ts
git commit -m "feat(types): tipos de template de grupo de opções"
```

---

### Task 3: Tela admin `/admin/templates`

**Files:**
- Create: `src/app/(app)/admin/templates/page.tsx`
- Create: `src/app/(app)/admin/templates/template-editor.tsx`
- Create: `src/app/(app)/admin/templates/actions.ts`
- Create: `src/app/(app)/admin/templates/loading.tsx`
- Modify: `src/lib/nav/items.ts` (adicionar item de menu)

**Interfaces:**
- Consumes: `GroupTemplateRow`/`OptionTemplateRow` (Task 2); tabelas da Task 1; `getCompany`/`getProfile` de `@/lib/auth`; `parseDecimal` de `@/lib/format`; `Input`, `SubmitButton` de `@/components/ui`.
- Produces: actions exportadas `saveTemplate(fd)`, `deleteTemplate(fd)`, `saveTemplateOption(fd)`, `deleteTemplateOption(fd)` — todas `(fd: FormData) => Promise<void>`.

- [ ] **Step 1: Criar `actions.ts`**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getCompany, getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'

function reval() {
  revalidatePath('/admin/templates')
}

export async function saveTemplate(fd: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const id = String(fd.get('id') ?? '')
  const row = {
    name: String(fd.get('name') ?? '').trim(),
    required: fd.get('required') === 'on',
    company_id: company.id,
  }
  if (!row.name) throw new Error('Nome obrigatório')
  const { error } = await (id
    ? supabase.from('option_group_templates').update(row).eq('id', id)
    : supabase.from('option_group_templates').insert(row))
  if (error) throw new Error(error.message)
  reval()
}

export async function deleteTemplate(fd: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('option_group_templates').delete().eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  reval()
}

export async function saveTemplateOption(fd: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const id = String(fd.get('id') ?? '')
  const row = {
    template_id: String(fd.get('template_id')),
    label: String(fd.get('label') ?? '').trim(),
    surcharge_type: String(fd.get('surcharge_type')) as 'fixo' | 'por_m2',
    surcharge_value: parseDecimal(String(fd.get('surcharge_value') ?? '0')),
    sort_order: Number(fd.get('sort_order') ?? 0),
    company_id: company.id,
  }
  if (!row.label) throw new Error('Rótulo obrigatório')
  const { error } = await (id
    ? supabase.from('option_templates').update(row).eq('id', id)
    : supabase.from('option_templates').insert(row))
  if (error) throw new Error(error.message)
  reval()
}

export async function deleteTemplateOption(fd: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('option_templates').delete().eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  reval()
}
```

- [ ] **Step 2: Criar `template-editor.tsx`**

```tsx
'use client'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import type { GroupTemplateRow } from '@/lib/config-types'
import { deleteTemplate, deleteTemplateOption, saveTemplate, saveTemplateOption } from './actions'

export function TemplateEditor({ templates }: { templates: GroupTemplateRow[] }) {
  return (
    <section className="space-y-4">
      {templates.map(t => (
        <div key={t.id} className="space-y-2 rounded border p-3">
          <form action={saveTemplate} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={t.id} />
            <Input name="name" defaultValue={t.name} className="w-44" aria-label="Nome do template" />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="required" defaultChecked={t.required} /> Obrigatório
            </label>
            <SubmitButton size="sm">Salvar</SubmitButton>
          </form>
          <form action={deleteTemplate}>
            <input type="hidden" name="id" value={t.id} />
            <SubmitButton variant="link" className="h-auto px-0 text-xs text-red-600 underline">Excluir template (e opções)</SubmitButton>
          </form>
          <ul className="space-y-2 pl-2">
            {t.option_templates.map(o => (
              <li key={o.id} className="flex flex-wrap items-end gap-2">
                <form action={saveTemplateOption} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="template_id" value={t.id} />
                  <input type="hidden" name="id" value={o.id} />
                  <Input name="label" defaultValue={o.label} className="w-36" aria-label="Opção" />
                  <select name="surcharge_type" defaultValue={o.surcharge_type} className="rounded border bg-background p-2 text-sm">
                    <option value="fixo">R$ fixo</option>
                    <option value="por_m2">R$ por m²</option>
                  </select>
                  <Input name="surcharge_value" inputMode="decimal" defaultValue={o.surcharge_value} className="w-24" aria-label="Adicional" />
                  <Input name="sort_order" type="number" defaultValue={o.sort_order} className="w-14" aria-label="Ordem" />
                  <SubmitButton size="sm" variant="outline">OK</SubmitButton>
                </form>
                <form action={deleteTemplateOption}>
                  <input type="hidden" name="id" value={o.id} />
                  <SubmitButton variant="link" className="h-auto px-0 text-xs text-red-600 underline">excluir</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveTemplateOption} className="flex flex-wrap items-end gap-2 border-t pt-2">
            <input type="hidden" name="template_id" value={t.id} />
            <Input name="label" placeholder="Nova opção" className="w-36" />
            <select name="surcharge_type" defaultValue="fixo" className="rounded border bg-background p-2 text-sm">
              <option value="fixo">R$ fixo</option>
              <option value="por_m2">R$ por m²</option>
            </select>
            <Input name="surcharge_value" inputMode="decimal" defaultValue={0} className="w-24" />
            <SubmitButton size="sm">Adicionar opção</SubmitButton>
          </form>
        </div>
      ))}
      <form action={saveTemplate} className="flex flex-wrap items-end gap-2 rounded border border-dashed p-3">
        <Input name="name" placeholder="Novo template (ex: Cor do Alumínio)" className="w-56" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="required" /> Obrigatório
        </label>
        <SubmitButton size="sm">Adicionar template</SubmitButton>
      </form>
    </section>
  )
}
```

- [ ] **Step 3: Criar `page.tsx`**

```tsx
import type { GroupTemplateRow } from '@/lib/config-types'
import { getCompany } from '@/lib/auth'
import { TemplateEditor } from './template-editor'

export default async function TemplatesPage() {
  const { supabase } = await getCompany()
  const { data } = await supabase.from('option_group_templates')
    .select('*, option_templates(*)')
    .order('name')
  const templates = (data ?? []) as unknown as GroupTemplateRow[]
  templates.forEach(t => t.option_templates.sort((a, b) => a.sort_order - b.sort_order))
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Templates de grupos de opções</h1>
      <p className="text-sm text-on-surface-variant">
        Templates são pontos de partida: ao aplicar num produto, o grupo vira uma cópia independente.
      </p>
      <TemplateEditor templates={templates} />
    </div>
  )
}
```

- [ ] **Step 4: Criar `loading.tsx`**

```tsx
import { LoadingScreen } from '@/components/ui/loading-screen'

export default function Loading() {
  return <LoadingScreen />
}
```

- [ ] **Step 5: Adicionar item de menu**

Em `src/lib/nav/items.ts`, inserir na `NAV_ITEMS` após a linha de Produtos:

```ts
  { label: 'Templates', href: '/admin/templates', icon: 'dashboard_customize', adminOnly: true },
```

- [ ] **Step 6: Typecheck + lint + build**

Run: `npx tsc --noEmit && npx next lint 2>/dev/null || npx eslint src/app/\(app\)/admin/templates`
Run: `npm run build`
Expected: sem erros.

- [ ] **Step 7: Verificação manual (preview)**

Com dev server: logar como admin → menu "Templates" → criar template "Cor do Alumínio" (obrigatório) → adicionar opções ("Branco" fixo 0, "Preto" fixo 50, "Amadeirado" por_m2 30) → editar valor → excluir opção → recarregar página e conferir persistência.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/admin/templates src/lib/nav/items.ts
git commit -m "feat(admin): tela de templates de grupos de opções"
```

---

### Task 4: Aplicar template e salvar como template no produto

**Files:**
- Modify: `src/app/(app)/admin/produtos/[id]/actions.ts` (adicionar 2 actions ao final)
- Modify: `src/app/(app)/admin/produtos/[id]/page.tsx` (buscar templates, passar ao editor)
- Modify: `src/app/(app)/admin/produtos/[id]/group-editor.tsx` (busca "Usar template" + botão "Salvar como template")

**Interfaces:**
- Consumes: `GroupTemplateRow` (Task 2); actions/tabelas das Tasks 1–3.
- Produces: `applyTemplate(fd)` (campos `template_id`, `product_id`) e `saveGroupAsTemplate(fd)` (campos `group_id`, `product_id`) — ambas `(fd: FormData) => Promise<void>`; `GroupEditor` passa a receber prop `templates: GroupTemplateRow[]`.

- [ ] **Step 1: Adicionar actions em `produtos/[id]/actions.ts`**

Ao final do arquivo:

```ts
export async function applyTemplate(fd: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const templateId = String(fd.get('template_id') ?? '')
  const productId = String(fd.get('product_id') ?? '')
  if (!templateId) throw new Error('Template não informado')
  const { data: tpl, error: tplError } = await supabase
    .from('option_group_templates')
    .select('*, option_templates(*)')
    .eq('id', templateId)
    .single()
  if (tplError || !tpl) throw new Error('Template não encontrado')
  const { data: group, error: groupError } = await supabase
    .from('option_groups')
    .insert({
      product_type_id: productId,
      name: tpl.name,
      required: tpl.required,
      sort_order: 0,
      company_id: company.id,
    })
    .select('id')
    .single()
  if (groupError || !group) throw new Error(groupError?.message ?? 'Falha ao criar grupo')
  const options = (tpl.option_templates ?? []).map((o: { label: string; surcharge_type: string; surcharge_value: number; sort_order: number }) => ({
    group_id: group.id,
    label: o.label,
    surcharge_type: o.surcharge_type,
    surcharge_value: o.surcharge_value,
    sort_order: o.sort_order,
    active: true,
    company_id: company.id,
  }))
  if (options.length > 0) {
    const { error: optError } = await supabase.from('options').insert(options)
    if (optError) {
      await supabase.from('option_groups').delete().eq('id', group.id)
      throw new Error(optError.message)
    }
  }
  reval(fd)
}

export async function saveGroupAsTemplate(fd: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const groupId = String(fd.get('group_id') ?? '')
  const { data: group, error: groupError } = await supabase
    .from('option_groups')
    .select('*, options(*)')
    .eq('id', groupId)
    .single()
  if (groupError || !group) throw new Error('Grupo não encontrado')
  const { data: tpl, error: tplError } = await supabase
    .from('option_group_templates')
    .insert({ name: group.name, required: group.required, company_id: company.id })
    .select('id')
    .single()
  if (tplError || !tpl) throw new Error(tplError?.message ?? 'Falha ao criar template')
  const options = (group.options ?? []).map((o: { label: string; surcharge_type: string; surcharge_value: number; sort_order: number }) => ({
    template_id: tpl.id,
    label: o.label,
    surcharge_type: o.surcharge_type,
    surcharge_value: o.surcharge_value,
    sort_order: o.sort_order,
    company_id: company.id,
  }))
  if (options.length > 0) {
    const { error: optError } = await supabase.from('option_templates').insert(options)
    if (optError) {
      await supabase.from('option_group_templates').delete().eq('id', tpl.id)
      throw new Error(optError.message)
    }
  }
  revalidatePath('/admin/templates')
  reval(fd)
}
```

- [ ] **Step 2: Buscar templates em `page.tsx`**

Substituir o corpo de `ProdutoDetalhe` (mantendo o que existe, adicionando a busca de templates e a prop):

```tsx
import { notFound } from 'next/navigation'
import { getCompany } from '@/lib/auth'
import type { GroupTemplateRow, ProductConfig } from '@/lib/config-types'
import { saveProduct } from '../actions'
import { ProductForm } from '../product-form'
import { GroupEditor } from './group-editor'
import { ModelEditor } from './model-editor'

export default async function ProdutoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, company } = await getCompany()
  const [{ data }, { data: templateData }] = await Promise.all([
    supabase.from('product_types')
      .select('*, option_groups(*, options(*)), models(*)')
      .eq('id', id).single(),
    supabase.from('option_group_templates')
      .select('*, option_templates(*)')
      .order('name'),
  ])
  if (!data) notFound()
  const product = data as unknown as ProductConfig
  product.option_groups.sort((a, b) => a.sort_order - b.sort_order)
  product.option_groups.forEach(g => g.options.sort((a, b) => a.sort_order - b.sort_order))
  product.models.sort((a, b) => a.sort_order - b.sort_order)
  const templates = (templateData ?? []) as unknown as GroupTemplateRow[]
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{product.name}</h1>
      <ProductForm product={product} action={saveProduct} />
      <GroupEditor productId={product.id} groups={product.option_groups} templates={templates} />
      <ModelEditor productId={product.id} models={product.models} companyId={company!.id} />
    </div>
  )
}
```

- [ ] **Step 3: UI em `group-editor.tsx`**

Alterações:
1. Adicionar `useState` e tipos de template aos imports.
2. Nova prop `templates`.
3. Botão "Salvar como template" ao lado de "Excluir grupo".
4. Bloco "Usar template" com filtro client-side antes do form "Novo grupo".

Arquivo completo resultante:

```tsx
'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import type { GroupTemplateRow, OptionGroupRow } from '@/lib/config-types'
import { applyTemplate, deleteGroup, deleteOption, saveGroup, saveGroupAsTemplate, saveOption } from './actions'

export function GroupEditor({ productId, groups, templates }: { productId: string; groups: OptionGroupRow[]; templates: GroupTemplateRow[] }) {
  const [search, setSearch] = useState('')
  const filtered = search.trim()
    ? templates.filter(t => t.name.toLowerCase().includes(search.trim().toLowerCase()))
    : templates
  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Grupos de opções</h2>
      {groups.map(g => (
        <div key={g.id} className="space-y-2 rounded border p-3">
          <form action={saveGroup} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="id" value={g.id} />
            <Input name="name" defaultValue={g.name} className="w-44" aria-label="Nome do grupo" />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="required" defaultChecked={g.required} /> Obrigatório
            </label>
            <Input name="sort_order" type="number" defaultValue={g.sort_order} className="w-16" aria-label="Ordem" />
            <SubmitButton size="sm">Salvar</SubmitButton>
          </form>
          <div className="flex gap-4">
            <form action={deleteGroup}>
              <input type="hidden" name="product_id" value={productId} />
              <input type="hidden" name="id" value={g.id} />
              <SubmitButton variant="link" className="h-auto px-0 text-xs text-red-600 underline">Excluir grupo (e opções)</SubmitButton>
            </form>
            <form action={saveGroupAsTemplate}>
              <input type="hidden" name="product_id" value={productId} />
              <input type="hidden" name="group_id" value={g.id} />
              <SubmitButton variant="link" className="h-auto px-0 text-xs underline">Salvar como template</SubmitButton>
            </form>
          </div>
          <ul className="space-y-2 pl-2">
            {g.options.map(o => (
              <li key={o.id} className="flex flex-wrap items-end gap-2">
                <form action={saveOption} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="product_id" value={productId} />
                  <input type="hidden" name="group_id" value={g.id} />
                  <input type="hidden" name="id" value={o.id} />
                  <Input name="label" defaultValue={o.label} className="w-36" aria-label="Opção" />
                  <select name="surcharge_type" defaultValue={o.surcharge_type} className="rounded border bg-background p-2 text-sm">
                    <option value="fixo">R$ fixo</option>
                    <option value="por_m2">R$ por m²</option>
                  </select>
                  <Input name="surcharge_value" inputMode="decimal" defaultValue={o.surcharge_value} className="w-24" aria-label="Adicional" />
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={o.active} /> Ativa
                  </label>
                  <Input name="sort_order" type="number" defaultValue={o.sort_order} className="w-14" aria-label="Ordem" />
                  <SubmitButton size="sm" variant="outline">OK</SubmitButton>
                </form>
                <form action={deleteOption}>
                  <input type="hidden" name="product_id" value={productId} />
                  <input type="hidden" name="id" value={o.id} />
                  <SubmitButton variant="link" className="h-auto px-0 text-xs text-red-600 underline">excluir</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveOption} className="flex flex-wrap items-end gap-2 border-t pt-2">
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="group_id" value={g.id} />
            <input type="hidden" name="active" value="on" />
            <Input name="label" placeholder="Nova opção" className="w-36" />
            <select name="surcharge_type" defaultValue="fixo" className="rounded border bg-background p-2 text-sm">
              <option value="fixo">R$ fixo</option>
              <option value="por_m2">R$ por m²</option>
            </select>
            <Input name="surcharge_value" inputMode="decimal" defaultValue={0} className="w-24" />
            <SubmitButton size="sm">Adicionar opção</SubmitButton>
          </form>
        </div>
      ))}
      {templates.length > 0 && (
        <div className="space-y-2 rounded border border-dashed p-3">
          <h3 className="text-sm font-semibold">Usar template</h3>
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar template (ex: Cor do Alumínio)"
            className="w-56"
            aria-label="Buscar template"
          />
          <ul className="space-y-1">
            {filtered.map(t => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span>{t.name} ({t.option_templates.length} {t.option_templates.length === 1 ? 'opção' : 'opções'})</span>
                <form action={applyTemplate}>
                  <input type="hidden" name="product_id" value={productId} />
                  <input type="hidden" name="template_id" value={t.id} />
                  <SubmitButton size="sm" variant="outline">Aplicar</SubmitButton>
                </form>
              </li>
            ))}
            {filtered.length === 0 && <li className="text-xs text-on-surface-variant">Nenhum template encontrado.</li>}
          </ul>
        </div>
      )}
      <form action={saveGroup} className="flex flex-wrap items-end gap-2 rounded border border-dashed p-3">
        <input type="hidden" name="product_id" value={productId} />
        <Input name="name" placeholder="Novo grupo (ex: Cor do Alumínio)" className="w-56" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="required" /> Obrigatório
        </label>
        <SubmitButton size="sm">Adicionar grupo</SubmitButton>
      </form>
    </section>
  )
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit`
Run: `npm run build`
Expected: sem erros.

- [ ] **Step 5: Verificação manual (preview)**

1. Produto qualquer → seção "Usar template" → buscar "cor" → Aplicar "Cor do Alumínio" → grupo aparece com todas as opções ativas, valores e ordem preservados.
2. Editar o grupo aplicado (mudar valor) → tela de Templates → template inalterado (cópia independente).
3. Grupo existente → "Salvar como template" → aparece em /admin/templates com opções.
4. Editar template → produto NÃO muda.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/admin/produtos/\[id\]
git commit -m "feat(admin): aplicar template e salvar grupo como template"
```

---

## Self-review

- **Spec coverage:** migração/RLS (Task 1), tipos (Task 2), tela admin + nav (Task 3), aplicar + salvar-como + rollback manual + verificação de cópia independente (Task 4). Fora de escopo respeitado (sem vínculo, sem paginação).
- **Placeholders:** nenhum — todo step com código completo.
- **Type consistency:** `GroupTemplateRow.option_templates` usado igual em Tasks 2, 3 e 4; assinaturas de actions `(fd: FormData) => Promise<void>` consistentes com padrão do projeto.
