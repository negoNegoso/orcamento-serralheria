# Categorização de preços (repasse/custo/insumo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar cada preço do catálogo (preço base do produto, grupo de opções, opção) com uma categoria financeira — `custo`, `insumo` ou `repasse` — sem alterar nenhum cálculo.

**Architecture:** Tabela global `price_categories` (sem `tenant_id`, igual `business_areas`) e uma FK nullable `price_category_id` em `options`, `option_groups` e `product_types`. A opção herda a categoria do grupo em tempo de leitura, via helper puro `categoriaEfetiva()`. A UI é apenas três `<select>` encaixados nos formulários já existentes.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase Postgres com RLS, TypeScript, Tailwind, vitest.

Spec: `docs/superpowers/specs/2026-07-23-categorizacao-precos-design.md`

## Global Constraints

- Nenhuma mudança em `src/lib/pricing/calc.ts` nem em qualquer cálculo de preço. Categoria é só marcação.
- `price_category_id` é sempre nullable. Sem backfill: todo registro existente começa sem categoria, e "sem categoria" segue válido depois.
- `price_categories` é global — **não** tem coluna `company_id` / `tenant_id`. As categorias são as mesmas para todas as empresas.
- Os três slugs são exatamente `custo`, `insumo`, `repasse`. Rótulos exibidos: `Custo`, `Insumo`, `Repasse`.
- `models` não recebe categoria. Não tocar em `saveModel`, `model-card.tsx` nem `model-editor.tsx`.
- Nenhuma categoria no snapshot do orçamento, no PDF, no dashboard financeiro, na produção, no contrato ou no recibo.
- `saveOption`, `saveGroup` e `saveProduct` gravam a **linha inteira**. Todo `FormData` enviado a elas precisa continuar carregando todos os campos que já carregava — nunca mandar um FormData parcial.
- Idioma da UI e das mensagens de erro: pt-BR, como no resto do app.
- Comandos: `npm test` (vitest), `npm run lint` (eslint), `npm run build` (next build).

---

### Task 1: Migration `price_categories` + FKs

**Files:**
- Create: `supabase/migrations/0029_price_categories.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabela `price_categories(id uuid, slug text, name text, sort_order int)` com 3 linhas seed (`custo`, `insumo`, `repasse`); coluna `price_category_id uuid null` em `options`, `option_groups` e `product_types`.

Esta task não tem teste automatizado — o projeto não tem harness de teste de banco. A verificação é aplicar a migration e consultar o resultado.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/0029_price_categories.sql`:

```sql
-- Catálogo global de categorias de preço. Sem company_id: as categorias são
-- as mesmas para todas as empresas (mesmo padrão de business_areas, 0020).
create table price_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0
);

insert into price_categories (slug, name, sort_order) values
  ('custo', 'Custo', 0),
  ('insumo', 'Insumo', 1),
  ('repasse', 'Repasse', 2);

-- Nullable em todas: "sem categoria" é o estado inicial de tudo e segue válido.
-- product_types categoriza o preço base (base_price / price_per_m2).
alter table options       add column price_category_id uuid references price_categories(id);
alter table option_groups add column price_category_id uuid references price_categories(id);
alter table product_types add column price_category_id uuid references price_categories(id);

alter table price_categories enable row level security;

-- Leitura para qualquer autenticado. Sem insert/update/delete: o seed é fixo e
-- o app não edita categorias; categoria nova entra por migration.
create policy pc_read on price_categories for select to authenticated using (true);
```

- [ ] **Step 2: Aplicar a migration no banco**

O projeto não tem script de migration no `package.json` e o README é o boilerplate do
create-next-app. Aplicar pelo MCP do Supabase que a sessão tem conectado — ferramenta
`apply_migration`, com `name: "0029_price_categories"` e o SQL do Step 1 como `query`.

Sem o MCP disponível: colar o mesmo SQL no SQL Editor do projeto Supabase e executar.

- [ ] **Step 3: Verificar o resultado**

Rodar no banco:

```sql
select slug, name, sort_order from price_categories order by sort_order;
```

Esperado: exatamente 3 linhas — `custo|Custo|0`, `insumo|Insumo|1`, `repasse|Repasse|2`.

```sql
select table_name, column_name, is_nullable
from information_schema.columns
where column_name = 'price_category_id'
order by table_name;
```

Esperado: 3 linhas (`option_groups`, `options`, `product_types`), todas com `is_nullable = YES`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0029_price_categories.sql
git commit -m "feat(db): tabela price_categories e FK nos preços"
```

---

### Task 2: Types e helper de herança

**Files:**
- Modify: `src/lib/config-types.ts`
- Create: `src/lib/pricing/price-category.ts`
- Test: `src/lib/pricing/price-category.test.ts`

**Interfaces:**
- Consumes: as colunas criadas na Task 1.
- Produces:
  - `interface PriceCategory { id: string; name: string; slug: string; sort_order: number }` (exportado de `@/lib/config-types`)
  - `price_category_id: string | null` em `OptionRow`, `OptionGroupRow` e `ProductConfig` (`@/lib/config-types`)
  - `categoriaEfetiva(optionCategoryId: string | null, groupCategoryId: string | null): string | null` (exportado de `@/lib/pricing/price-category`)
  - `categoryName(categories: PriceCategory[], id: string | null): string | null` (exportado de `@/lib/pricing/price-category`)

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/pricing/price-category.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PriceCategory } from '@/lib/config-types'
import { categoriaEfetiva, categoryName } from './price-category'

const CATEGORIES: PriceCategory[] = [
  { id: 'c1', slug: 'custo', name: 'Custo', sort_order: 0 },
  { id: 'c2', slug: 'insumo', name: 'Insumo', sort_order: 1 },
  { id: 'c3', slug: 'repasse', name: 'Repasse', sort_order: 2 },
]

describe('categoriaEfetiva', () => {
  it('categoria própria da opção vence a do grupo', () => {
    expect(categoriaEfetiva('c3', 'c2')).toBe('c3')
  })
  it('opção sem categoria herda a do grupo', () => {
    expect(categoriaEfetiva(null, 'c2')).toBe('c2')
  })
  it('opção e grupo sem categoria resulta em null', () => {
    expect(categoriaEfetiva(null, null)).toBeNull()
  })
})

describe('categoryName', () => {
  it('resolve o rótulo pelo id', () => {
    expect(categoryName(CATEGORIES, 'c1')).toBe('Custo')
  })
  it('id nulo não tem rótulo', () => {
    expect(categoryName(CATEGORIES, null)).toBeNull()
  })
  it('id desconhecido não tem rótulo', () => {
    expect(categoryName(CATEGORIES, 'inexistente')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx vitest run src/lib/pricing/price-category.test.ts
```

Esperado: FAIL — `Failed to resolve import "./price-category"`.

- [ ] **Step 3: Adicionar os types**

Em `src/lib/config-types.ts`, adicionar `price_category_id: string | null` a `OptionRow`, `OptionGroupRow` e `ProductConfig`, e criar `PriceCategory`.

Em `OptionRow`, depois de `surcharge_value`:

```ts
  price_category_id: string | null
```

Em `OptionGroupRow`, depois de `required`:

```ts
  price_category_id: string | null
```

Em `ProductConfig`, depois de `base_price`:

```ts
  price_category_id: string | null
```

E no fim do arquivo:

```ts
// Catálogo global de categorias de preço (custo | insumo | repasse).
// Igual para todas as empresas — ver supabase/migrations/0029_price_categories.sql
export interface PriceCategory {
  id: string
  slug: string
  name: string
  sort_order: number
}
```

- [ ] **Step 4: Escrever o helper**

Criar `src/lib/pricing/price-category.ts`:

```ts
import type { PriceCategory } from '@/lib/config-types'

// A opção usa a própria categoria; sem ela, herda a do grupo. Resolvido na
// leitura — nada é copiado para a linha da opção, então trocar a categoria do
// grupo reflete em todas as opções que não definiram a sua.
export function categoriaEfetiva(
  optionCategoryId: string | null,
  groupCategoryId: string | null
): string | null {
  return optionCategoryId ?? groupCategoryId ?? null
}

export function categoryName(
  categories: PriceCategory[],
  id: string | null
): string | null {
  if (!id) return null
  return categories.find(c => c.id === id)?.name ?? null
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
npx vitest run src/lib/pricing/price-category.test.ts
```

Esperado: PASS — 6 testes.

- [ ] **Step 6: Rodar a suíte inteira**

```bash
npm test
```

Esperado: todos os testes passam. Os testes de `calc.ts` e `snapshot.test.ts` não mudam.

- [ ] **Step 7: Commit**

```bash
git add src/lib/config-types.ts src/lib/pricing/price-category.ts src/lib/pricing/price-category.test.ts
git commit -m "feat: types de categoria de preço e herança grupo→opção"
```

---

### Task 3: Server actions aceitam `price_category_id`

**Files:**
- Modify: `src/app/(app)/admin/produtos/[id]/actions.ts` (`saveOption`, `saveGroup`)
- Modify: `src/app/(app)/admin/produtos/actions.ts` (`saveProduct`)
- Create: `src/lib/pricing/price-category-input.ts`
- Test: `src/lib/pricing/price-category-input.test.ts`

**Interfaces:**
- Consumes: `PriceCategory` de `@/lib/config-types` (Task 2).
- Produces: `parseCategoryId(raw: FormDataEntryValue | null): string | null` (exportado de `@/lib/pricing/price-category-input`). As três actions passam a gravar `price_category_id`.

A validação de "id existe em `price_categories`" é feita pelo próprio banco: a FK rejeita um uuid inexistente e a action já converte `error` em `throw`. O helper cobre só o parse de FormData (string vazia → `null`), que é lógica pura e testável.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/pricing/price-category-input.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseCategoryId } from './price-category-input'

describe('parseCategoryId', () => {
  it('uuid vira o próprio id', () => {
    expect(parseCategoryId('3f0c7c1e-0000-4000-8000-000000000001')).toBe(
      '3f0c7c1e-0000-4000-8000-000000000001'
    )
  })
  it('string vazia vira null', () => {
    expect(parseCategoryId('')).toBeNull()
  })
  it('campo ausente vira null', () => {
    expect(parseCategoryId(null)).toBeNull()
  })
  it('só espaços vira null', () => {
    expect(parseCategoryId('   ')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx vitest run src/lib/pricing/price-category-input.test.ts
```

Esperado: FAIL — `Failed to resolve import "./price-category-input"`.

- [ ] **Step 3: Escrever o helper**

Criar `src/lib/pricing/price-category-input.ts`:

```ts
// Select vazio ("— sem categoria —" / "— herdar do grupo —") chega como string
// vazia no FormData e precisa virar null, não ''. A existência do id é
// garantida pela FK de price_categories no banco.
export function parseCategoryId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  return value === '' ? null : value
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npx vitest run src/lib/pricing/price-category-input.test.ts
```

Esperado: PASS — 4 testes.

- [ ] **Step 5: Usar o helper em `saveGroup` e `saveOption`**

Em `src/app/(app)/admin/produtos/[id]/actions.ts`, adicionar o import junto dos outros:

```ts
import { parseCategoryId } from '@/lib/pricing/price-category-input'
```

Em `saveGroup`, adicionar no objeto `row`, depois de `sort_order`:

```ts
    price_category_id: parseCategoryId(fd.get('price_category_id')),
```

Em `saveOption`, adicionar no objeto `row`, depois de `sort_order`:

```ts
    price_category_id: parseCategoryId(fd.get('price_category_id')),
```

Não mexer em `saveModel`, `applyTemplate` nem `saveGroupAsTemplate`.

- [ ] **Step 6: Usar o helper em `saveProduct`**

Em `src/app/(app)/admin/produtos/actions.ts`, adicionar o import:

```ts
import { parseCategoryId } from '@/lib/pricing/price-category-input'
```

Em `saveProduct`, adicionar no objeto `row`, depois de `sort_order`:

```ts
    price_category_id: parseCategoryId(formData.get('price_category_id')),
```

- [ ] **Step 7: Verificar lint e build**

```bash
npm run lint && npm test
```

Esperado: sem erros de lint; todos os testes passam.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pricing/price-category-input.ts src/lib/pricing/price-category-input.test.ts "src/app/(app)/admin/produtos/[id]/actions.ts" "src/app/(app)/admin/produtos/actions.ts"
git commit -m "feat: actions gravam price_category_id"
```

---

### Task 4: Select de categoria no preço base do produto

**Files:**
- Modify: `src/app/(app)/admin/produtos/product-form.tsx`
- Modify: `src/app/(app)/admin/produtos/page.tsx`
- Modify: `src/app/(app)/admin/produtos/[id]/page.tsx`

**Interfaces:**
- Consumes: `PriceCategory` (Task 2); `saveProduct` gravando `price_category_id` (Task 3).
- Produces: `ProductForm` passa a exigir a prop `categories: PriceCategory[]`. As duas páginas que a renderizam buscam `price_categories` e passam a prop.

`ProductForm` é usada em dois lugares — `produtos/page.tsx` (produto novo) e `produtos/[id]/page.tsx` (edição). As duas precisam da prop, senão o build de tipos quebra.

Sem teste automatizado: são componentes React e o projeto só roda vitest em `src/**/*.test.ts` com `environment: 'node'`, sem testing-library. A verificação é `npm run build` mais um check manual no navegador.

- [ ] **Step 1: Adicionar o select ao `ProductForm`**

Em `src/app/(app)/admin/produtos/product-form.tsx`, trocar o import e a assinatura:

```tsx
'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'
import type { PriceCategory } from '@/lib/config-types'

export function ProductForm({
  product,
  action,
  categories,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product?: any
  action: (fd: FormData) => Promise<void>
  categories: PriceCategory[]
}) {
```

Depois, inserir o bloco do select logo antes do `<div className="flex items-center gap-4">` (o bloco de Ativo/Ordem):

```tsx
      <div className="space-y-1">
        <Label htmlFor={`cat-${product?.id ?? 'new'}`}>Categoria do preço</Label>
        <select
          id={`cat-${product?.id ?? 'new'}`}
          name="price_category_id"
          defaultValue={product?.price_category_id ?? ''}
          className="w-full rounded border bg-background p-2"
        >
          <option value="">— sem categoria —</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
```

- [ ] **Step 2: Buscar as categorias na listagem de produtos**

Em `src/app/(app)/admin/produtos/page.tsx`, adicionar o import do type:

```tsx
import type { PriceCategory } from '@/lib/config-types'
```

Depois do `const { data } = await query`, buscar o catálogo:

```tsx
  const { data: categoryData } = await supabase
    .from('price_categories')
    .select('*')
    .order('sort_order')
  const categories = (categoryData ?? []) as unknown as PriceCategory[]
```

E passar a prop:

```tsx
        <ProductForm action={saveProduct} categories={categories} />
```

- [ ] **Step 3: Buscar as categorias na página do produto**

Em `src/app/(app)/admin/produtos/[id]/page.tsx`, incluir o type no import existente:

```tsx
import type { GroupTemplateRow, PriceCategory, ProductConfig } from '@/lib/config-types'
```

Adicionar a query ao `Promise.all`, que passa a ter três resultados:

```tsx
  const [{ data }, { data: templateData }, { data: categoryData }] = await Promise.all([
    supabase.from('product_types')
      .select('*, option_groups(*, options(*)), models(*)')
      .eq('id', id).single(),
    supabase.from('option_group_templates')
      .select('*, option_templates(*)')
      .order('name'),
    supabase.from('price_categories')
      .select('*')
      .order('sort_order'),
  ])
```

Depois da linha do `templates`:

```tsx
  const categories = (categoryData ?? []) as unknown as PriceCategory[]
```

E passar a prop:

```tsx
      <ProductForm product={product} action={saveProduct} categories={categories} />
```

- [ ] **Step 4: Verificar build e lint**

```bash
npm run lint && npm run build
```

Esperado: build sem erro. Se algum outro lugar renderizar `ProductForm`, o TypeScript vai acusar a prop faltando — adicionar `categories` lá também, com a mesma query.

- [ ] **Step 5: Verificar no navegador**

Abrir `/admin/produtos`, expandir o painel de novo produto: o select "Categoria do preço" aparece com "— sem categoria —", "Custo", "Insumo", "Repasse". Abrir um produto existente em `/admin/produtos/<id>`, escolher "Insumo", salvar, recarregar a página e confirmar que o select voltou marcado em "Insumo".

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/admin/produtos/product-form.tsx" "src/app/(app)/admin/produtos/page.tsx" "src/app/(app)/admin/produtos/[id]/page.tsx"
git commit -m "feat: categoria no preço base do produto"
```

---

### Task 5: Categoria padrão do grupo (modal + badge no card)

**Files:**
- Modify: `src/app/(app)/admin/produtos/[id]/group-modals.tsx` (`GroupFormModal`)
- Modify: `src/app/(app)/admin/produtos/[id]/group-editor.tsx`
- Modify: `src/app/(app)/admin/produtos/[id]/group-card.tsx`

**Interfaces:**
- Consumes: `PriceCategory` e `categoryName` (Task 2); `saveGroup` gravando `price_category_id` (Task 3); `categories` buscado em `[id]/page.tsx` (Task 4).
- Produces: `GroupEditor`, `GroupCard` e `GroupFormModal` passam a receber a prop `categories: PriceCategory[]`.

O select vai no modal, não solto no header do card, porque `saveGroup` grava a linha inteira: um `FormData` parcial vindo de um select isolado apagaria `name` e `required`.

- [ ] **Step 1: Adicionar o select ao `GroupFormModal`**

Em `src/app/(app)/admin/produtos/[id]/group-modals.tsx`, incluir o type no import existente:

```tsx
import type { GroupTemplateRow, OptionGroupRow, PriceCategory } from '@/lib/config-types'
```

Adicionar a prop e o estado em `GroupFormModal`:

```tsx
export function GroupFormModal({
  productId,
  group,
  categories,
  open,
  onOpenChange,
}: {
  productId: string
  group: OptionGroupRow | null
  categories: PriceCategory[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [required, setRequired] = useState(group?.required ?? false)
  const [categoryId, setCategoryId] = useState(group?.price_category_id ?? '')
```

No bloco de reconciliação, junto de `setName` e `setRequired`:

```tsx
    if (open) {
      setName(group?.name ?? '')
      setRequired(group?.required ?? false)
      setCategoryId(group?.price_category_id ?? '')
      setError('')
    }
```

Em `submit`, junto dos outros campos do `FormData` (o FormData continua completo — nome, required e sort_order seguem sendo enviados):

```tsx
      fd.set('sort_order', String(group?.sort_order ?? 0))
      fd.set('price_category_id', categoryId)
```

E no JSX, entre o `<label>` do Switch "Seleção obrigatória" e o bloco de `{error && ...}`:

```tsx
          <label className="block space-y-1">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Categoria padrão
            </span>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Categoria padrão do grupo"
            >
              <option value="">— sem categoria —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
```

- [ ] **Step 2: Mostrar a categoria no `GroupCard`**

Em `src/app/(app)/admin/produtos/[id]/group-card.tsx`, incluir o type e o helper nos imports:

```tsx
import type { OptionGroupRow, PriceCategory } from '@/lib/config-types'
import { categoryName } from '@/lib/pricing/price-category'
```

Adicionar a prop na assinatura de `GroupCard`:

```tsx
export function GroupCard({
  productId,
  group,
  categories,
  dragHandle,
  onEdit,
  onDelete,
}: {
  productId: string
  group: OptionGroupRow
  categories: PriceCategory[]
  dragHandle?: React.ReactNode
  onEdit: () => void
  onDelete: () => void
}) {
```

Antes do `return`, calcular o rótulo:

```tsx
  const groupCategory = categoryName(categories, group.price_category_id)
```

E no header, logo depois do badge "Obrigatório":

```tsx
        {groupCategory && <Badge variant="secondary">{groupCategory}</Badge>}
```

- [ ] **Step 3: Repassar `categories` pelo `GroupEditor`**

Em `src/app/(app)/admin/produtos/[id]/group-editor.tsx`, incluir o type no import existente:

```tsx
import type { GroupTemplateRow, OptionGroupRow, PriceCategory } from '@/lib/config-types'
```

Em `SortableGroupCard`, adicionar a prop e repassá-la:

```tsx
function SortableGroupCard({
  productId,
  group,
  categories,
  onEdit,
  onDelete,
}: {
  productId: string
  group: OptionGroupRow
  categories: PriceCategory[]
  onEdit: () => void
  onDelete: () => void
}) {
```

e no `<GroupCard ...>` dentro dele:

```tsx
      <GroupCard
        productId={productId}
        group={group}
        categories={categories}
        onEdit={onEdit}
        onDelete={onDelete}
```

Em `GroupEditor`, adicionar a prop:

```tsx
export function GroupEditor({
  productId,
  groups,
  templates,
  categories,
}: {
  productId: string
  groups: OptionGroupRow[]
  templates: GroupTemplateRow[]
  categories: PriceCategory[]
}) {
```

Passar para o card dentro do `groupIds.map`:

```tsx
                <SortableGroupCard
                  key={id}
                  productId={productId}
                  group={group}
                  categories={categories}
```

E para o modal:

```tsx
      <GroupFormModal
        productId={productId}
        group={formGroup}
        categories={categories}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
```

- [ ] **Step 4: Passar `categories` do server component**

Em `src/app/(app)/admin/produtos/[id]/page.tsx` (a variável `categories` já existe desde a Task 4):

```tsx
      <GroupEditor
        productId={product.id}
        groups={product.option_groups}
        templates={templates}
        categories={categories}
      />
```

- [ ] **Step 5: Verificar build e lint**

```bash
npm run lint && npm run build
```

Esperado: build sem erro.

- [ ] **Step 6: Verificar no navegador**

Abrir `/admin/produtos/<id>`, editar um grupo, escolher "Insumo" em "Categoria padrão", salvar. O badge "Insumo" aparece no header do card. Reabrir o modal e confirmar que o select está em "Insumo". Voltar para "— sem categoria —", salvar, e confirmar que o badge some e o nome e o "obrigatório" do grupo continuam intactos.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/admin/produtos/[id]/group-modals.tsx" "src/app/(app)/admin/produtos/[id]/group-editor.tsx" "src/app/(app)/admin/produtos/[id]/group-card.tsx" "src/app/(app)/admin/produtos/[id]/page.tsx"
git commit -m "feat: categoria padrão do grupo de opções"
```

---

### Task 6: Select de categoria na opção, com herança do grupo

**Files:**
- Modify: `src/app/(app)/admin/produtos/[id]/option-row.tsx` (`buildOptionFd`, `OptionRowItem`, `NewOptionRow`)
- Modify: `src/app/(app)/admin/produtos/[id]/group-card.tsx`

**Interfaces:**
- Consumes: `PriceCategory`, `categoriaEfetiva` e `categoryName` (Task 2); `saveOption` gravando `price_category_id` (Task 3); `categories` repassado pelo `GroupCard` (Task 5).
- Produces: `OptionRowItem` e `NewOptionRow` passam a receber `categories: PriceCategory[]` e `groupCategoryId: string | null`.

A opção sem categoria própria mostra, em cinza, a categoria herdada do grupo — mas grava `null`, não o id herdado. A herança fica em tempo de leitura, calculada por `categoriaEfetiva(null, groupCategoryId)`: é exatamente a categoria que passa a valer se a opção não definir a sua, que é o que a primeira entrada do select representa.

- [ ] **Step 1: Incluir a categoria no `FormData` da opção**

Em `src/app/(app)/admin/produtos/[id]/option-row.tsx`, adicionar o import:

```tsx
import type { OptionRow, PriceCategory } from '@/lib/config-types'
```

Estender `buildOptionFd` — o FormData continua completo, só ganha mais um campo:

```tsx
function buildOptionFd(fields: {
  productId: string
  groupId: string
  id?: string
  label: string
  type: 'fixo' | 'por_m2'
  value: string
  categoryId: string
  sortOrder: number
  active: boolean
}) {
  const fd = new FormData()
  fd.set('product_id', fields.productId)
  fd.set('group_id', fields.groupId)
  if (fields.id) fd.set('id', fields.id)
  fd.set('label', fields.label.trim())
  fd.set('surcharge_type', fields.type)
  fd.set('surcharge_value', fields.value || '0')
  fd.set('price_category_id', fields.categoryId)
  fd.set('sort_order', String(fields.sortOrder))
  if (fields.active) fd.set('active', 'on')
  return fd
}
```

- [ ] **Step 2: Adicionar o select ao `OptionRowItem`**

Ainda em `option-row.tsx`, a assinatura de `OptionRowItem`:

```tsx
export function OptionRowItem({
  productId,
  groupId,
  option,
  categories,
  groupCategoryId,
  onError,
}: {
  productId: string
  groupId: string
  option: OptionRow
  categories: PriceCategory[]
  groupCategoryId: string | null
  onError: (msg: string) => void
}) {
```

O estado, junto dos outros `useState`:

```tsx
  const [categoryId, setCategoryId] = useState(option.price_category_id ?? '')
```

Na reconciliação com o servidor, junto de `setLabel`/`setType`/`setValue`/`setActive`:

```tsx
    setCategoryId(option.price_category_id ?? '')
```

`commit` ganha o override e passa o campo:

```tsx
  async function commit(
    overrides: Partial<{ type: 'fixo' | 'por_m2'; active: boolean; categoryId: string }> = {}
  ) {
    const fd = buildOptionFd({
      productId,
      groupId,
      id: option.id,
      label,
      type: overrides.type ?? type,
      value,
      categoryId: overrides.categoryId ?? categoryId,
      sortOrder: option.sort_order,
      active: overrides.active ?? active,
    })
    try {
      await saveOption(fd)
      onError('')
    } catch {
      setLabel(option.label)
      setType(option.surcharge_type)
      setValue(String(option.surcharge_value))
      setCategoryId(option.price_category_id ?? '')
      setActive(option.active)
      onError('Erro ao salvar, tente novamente')
    }
  }
```

Antes do `return`, o rótulo herdado — a categoria que vale para a opção quando ela não define a
sua, que é o que a primeira entrada do select representa:

```tsx
  const inheritedName = categoryName(categories, categoriaEfetiva(null, groupCategoryId))
```

que exige o import dos helpers no topo do arquivo:

```tsx
import { categoriaEfetiva, categoryName } from '@/lib/pricing/price-category'
```

E o select no JSX, entre o `<Input>` do valor e o `<Switch>`:

```tsx
      <select
        value={categoryId}
        onChange={e => {
          const next = e.target.value
          setCategoryId(next)
          void commit({ categoryId: next })
        }}
        className={`${selectClass} ${categoryId ? '' : 'text-muted-foreground'}`}
        aria-label="Categoria do preço"
      >
        <option value="">
          {inheritedName ? `Herda: ${inheritedName}` : '— sem categoria —'}
        </option>
        {categories.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
```

- [ ] **Step 3: Adicionar o select ao `NewOptionRow`**

Ainda em `option-row.tsx`, a assinatura:

```tsx
export function NewOptionRow({
  productId,
  groupId,
  categories,
  groupCategoryId,
  nextSortOrder,
  onDone,
  onError,
}: {
  productId: string
  groupId: string
  categories: PriceCategory[]
  groupCategoryId: string | null
  nextSortOrder: number
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [label, setLabel] = useState('')
  const [type, setType] = useState<'fixo' | 'por_m2'>('fixo')
  const [value, setValue] = useState('0')
  const [categoryId, setCategoryId] = useState('')
```

Em `save`, passar o campo:

```tsx
    const fd = buildOptionFd({
      productId,
      groupId,
      label,
      type,
      value,
      categoryId,
      sortOrder: nextSortOrder,
      active: true,
    })
```

Antes do `return`, o mesmo rótulo herdado do `OptionRowItem`:

```tsx
  const inheritedName = categoryName(categories, categoriaEfetiva(null, groupCategoryId))
```

E o select no JSX, depois do `<Input>` do valor (último elemento do `<li>`):

```tsx
      <select
        value={categoryId}
        onChange={e => setCategoryId(e.target.value)}
        disabled={saving}
        className={`${selectClass} ${categoryId ? '' : 'text-muted-foreground'}`}
        aria-label="Categoria do preço"
      >
        <option value="">
          {inheritedName ? `Herda: ${inheritedName}` : '— sem categoria —'}
        </option>
        {categories.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
```

- [ ] **Step 4: Repassar as props pelo `GroupCard`**

Em `src/app/(app)/admin/produtos/[id]/group-card.tsx` (a prop `categories` já existe desde a Task 5), no `<OptionRowItem>`:

```tsx
                <OptionRowItem
                  key={id}
                  productId={productId}
                  groupId={group.id}
                  option={option}
                  categories={categories}
                  groupCategoryId={group.price_category_id}
                  onError={setError}
                />
```

e no `<NewOptionRow>`:

```tsx
              <NewOptionRow
                productId={productId}
                groupId={group.id}
                categories={categories}
                groupCategoryId={group.price_category_id}
                nextSortOrder={group.options.length}
                onDone={() => setAdding(false)}
                onError={setError}
              />
```

- [ ] **Step 5: Verificar build, lint e testes**

```bash
npm run lint && npm test && npm run build
```

Esperado: sem erro de lint, todos os testes passam, build limpo.

- [ ] **Step 6: Verificar a herança no navegador**

Em `/admin/produtos/<id>`, num grupo com categoria "Insumo": uma opção sem categoria própria mostra "Herda: Insumo" em cinza. Escolher "Repasse" nessa opção — o select fica com "Repasse" em cor normal e o rótulo herdado some. Voltar para a primeira entrada do select — grava sem categoria e volta a exibir "Herda: Insumo". Trocar a categoria do grupo para "Custo" no modal e confirmar que a opção sem categoria própria passa a mostrar "Herda: Custo" sozinha, sem precisar reeditar a opção. Adicionar uma opção nova e confirmar que ela também salva a categoria escolhida.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/admin/produtos/[id]/option-row.tsx" "src/app/(app)/admin/produtos/[id]/group-card.tsx"
git commit -m "feat: categoria da opção com herança do grupo"
```

---

## Verificação final

- [ ] `npm test` — todos os testes passam
- [ ] `npm run lint` — sem erros
- [ ] `npm run build` — build limpo
- [ ] Um produto, um grupo e uma opção salvos com categoria; recarregar a página e confirmar que todos voltam marcados
- [ ] `git log --oneline` mostra os 6 commits das tasks
- [ ] `src/lib/pricing/calc.ts` não aparece em `git diff build-v1...HEAD --name-only`
