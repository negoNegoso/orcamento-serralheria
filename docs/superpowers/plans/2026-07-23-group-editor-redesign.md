# Group Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign da seção "Grupos de opções" em `/admin/produtos/[id]`: cards com edição inline auto-save, modais para grupo/template/exclusão, drag-and-drop para reordenar grupos e opções.

**Architecture:** Client components com estado otimista sincronizado das props (server revalida via `revalidatePath` nas actions). DnD com `@dnd-kit` — um `DndContext` para grupos, um por card para opções. Novos componentes UI reutilizáveis: `Switch` e `Dialog` sobre `@base-ui/react`.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, `@base-ui/react` 1.6 (Dialog, Switch), `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (novo), Tailwind 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-group-editor-redesign-design.md`

## Global Constraints

- **Cores: zero hex hardcoded.** Só tokens do tema: `primary`, `primary-foreground`, `secondary`, `destructive`, `muted`, `border`, etc. `--primary` vem da cor da empresa (injetada em `src/app/(app)/layout.tsx`).
- **Ícones: componente `Icon` de `src/components/ui/icon.tsx`** (Material Symbols) — padrão do projeto. NÃO usar lucide-react. Nomes: `edit`, `delete`, `close`, `add`, `content_copy`, `drag_indicator`.
- **Nenhuma mudança de schema/banco.**
- **Next.js deste projeto tem breaking changes** — se precisar de API do Next fora do que este plano mostra, ler `node_modules/next/dist/docs/` antes.
- Copy da UI em português (pt-BR), como o restante do app.
- Testes Vitest rodam em ambiente `node`, só `src/**/*.test.ts` — testes apenas para funções puras em `src/lib/`. Componentes verificados por `npx tsc --noEmit` + preview manual.
- Comandos de verificação: `npx vitest run`, `npx tsc --noEmit`, `npx eslint src`.

## File Structure

- Create: `src/lib/reorder.ts` + `src/lib/reorder.test.ts` — helper puro de sort_order
- Create: `src/components/ui/switch.tsx` — toggle reutilizável
- Create: `src/components/ui/dialog.tsx` — modal base reutilizável
- Modify: `src/app/(app)/admin/produtos/[id]/actions.ts` — adiciona `reorderGroups`, `reorderOptions`
- Create: `src/app/(app)/admin/produtos/[id]/option-row.tsx` — linha de opção (edição inline + linha nova)
- Create: `src/app/(app)/admin/produtos/[id]/group-card.tsx` — card de grupo com DnD de opções
- Create: `src/app/(app)/admin/produtos/[id]/group-modals.tsx` — modais (form de grupo, template, confirmação)
- Rewrite: `src/app/(app)/admin/produtos/[id]/group-editor.tsx` — orquestrador com DnD de grupos
- Unchanged: `src/app/(app)/admin/produtos/[id]/page.tsx` — props de `GroupEditor` não mudam

---

### Task 1: Helper puro `buildSortUpdates`

**Files:**
- Create: `src/lib/reorder.ts`
- Test: `src/lib/reorder.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `buildSortUpdates(ids: string[]): { id: string; sort_order: number }[]` — usado na Task 2 pelas actions

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/reorder.test.ts
import { describe, expect, it } from 'vitest'
import { buildSortUpdates } from './reorder'

describe('buildSortUpdates', () => {
  it('mapeia ids para sort_order sequencial', () => {
    expect(buildSortUpdates(['b', 'a', 'c'])).toEqual([
      { id: 'b', sort_order: 0 },
      { id: 'a', sort_order: 1 },
      { id: 'c', sort_order: 2 },
    ])
  })

  it('lista vazia vira lista vazia', () => {
    expect(buildSortUpdates([])).toEqual([])
  })

  it('rejeita ids duplicados', () => {
    expect(() => buildSortUpdates(['a', 'a'])).toThrow('ids duplicados')
  })

  it('rejeita id vazio', () => {
    expect(() => buildSortUpdates(['a', ''])).toThrow('id inválido')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reorder.test.ts`
Expected: FAIL — "Cannot find module './reorder'" (ou equivalente)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/reorder.ts
export function buildSortUpdates(ids: string[]): { id: string; sort_order: number }[] {
  if (ids.some(id => !id)) throw new Error('id inválido')
  if (new Set(ids).size !== ids.length) throw new Error('ids duplicados')
  return ids.map((id, i) => ({ id, sort_order: i }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/reorder.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/reorder.ts src/lib/reorder.test.ts
git commit -m "feat: helper buildSortUpdates para reordenação"
```

---

### Task 2: Actions `reorderGroups` e `reorderOptions`

**Files:**
- Modify: `src/app/(app)/admin/produtos/[id]/actions.ts` (adicionar no fim do arquivo)

**Interfaces:**
- Consumes: `buildSortUpdates` (Task 1); `getCompany` de `@/lib/auth` (já importado no arquivo)
- Produces: `reorderGroups(productId: string, ids: string[]): Promise<void>` e `reorderOptions(productId: string, groupId: string, ids: string[]): Promise<void>` — usadas nas Tasks 4 e 6

- [ ] **Step 1: Adicionar import e as duas actions**

No topo do arquivo, junto aos imports existentes:

```ts
import { buildSortUpdates } from '@/lib/reorder'
```

No fim do arquivo:

```ts
export async function reorderGroups(productId: string, ids: string[]) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const results = await Promise.all(
    buildSortUpdates(ids).map(({ id, sort_order }) =>
      supabase
        .from('option_groups')
        .update({ sort_order })
        .eq('id', id)
        .eq('company_id', company.id)
        .eq('product_type_id', productId)
    )
  )
  const failed = results.find(r => r.error)
  if (failed?.error) throw new Error(failed.error.message)
  revalidatePath(`/admin/produtos/${productId}`)
}

export async function reorderOptions(productId: string, groupId: string, ids: string[]) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const results = await Promise.all(
    buildSortUpdates(ids).map(({ id, sort_order }) =>
      supabase
        .from('options')
        .update({ sort_order })
        .eq('id', id)
        .eq('company_id', company.id)
        .eq('group_id', groupId)
    )
  )
  const failed = results.find(r => r.error)
  if (failed?.error) throw new Error(failed.error.message)
  revalidatePath(`/admin/produtos/${productId}`)
}
```

- [ ] **Step 2: Verificar tipos e lint**

Run: `npx tsc --noEmit && npx eslint src/app/\(app\)/admin/produtos/\[id\]/actions.ts`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/produtos/[id]/actions.ts"
git commit -m "feat: actions reorderGroups e reorderOptions"
```

---

### Task 3: Componentes UI `Switch` e `Dialog`

**Files:**
- Create: `src/components/ui/switch.tsx`
- Create: `src/components/ui/dialog.tsx`

**Interfaces:**
- Consumes: `@base-ui/react/switch`, `@base-ui/react/dialog` (dependência existente), `cn` de `@/lib/utils`, `Icon` de `@/components/ui/icon`
- Produces:
  - `Switch(props: SwitchPrimitive.Root.Props)` — toggle; props principais: `checked`, `onCheckedChange(checked: boolean)`, `defaultChecked`, `name`
  - `Dialog` (= `DialogPrimitive.Root`, props `open`/`onOpenChange`), `DialogContent({ title: string; className?: string; children: React.ReactNode })`, `DialogClose`

- [ ] **Step 1: Criar `switch.tsx`**

```tsx
// src/components/ui/switch.tsx
'use client'
import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from '@/lib/utils'

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full bg-muted p-0.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[checked]:bg-primary disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="size-5 rounded-full bg-background shadow-sm transition-transform data-[checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
```

- [ ] **Step 2: Criar `dialog.tsx`**

```tsx
// src/components/ui/dialog.tsx
'use client'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogClose = DialogPrimitive.Close

function DialogContent({
  title,
  className,
  children,
}: {
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Popup
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background shadow-lg',
          className
        )}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogPrimitive.Title className="text-lg font-bold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Fechar"
          >
            <Icon name="close" className="text-xl" />
          </DialogPrimitive.Close>
        </div>
        <div className="p-6">{children}</div>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

export { Dialog, DialogClose, DialogContent }
```

- [ ] **Step 3: Verificar tipos e lint**

Run: `npx tsc --noEmit && npx eslint src/components/ui/switch.tsx src/components/ui/dialog.tsx`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/switch.tsx src/components/ui/dialog.tsx
git commit -m "feat(ui): componentes Switch e Dialog (base-ui)"
```

---

### Task 4: Linha de opção — `option-row.tsx`

**Files:**
- Create: `src/app/(app)/admin/produtos/[id]/option-row.tsx`
- Setup: instalar `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

**Interfaces:**
- Consumes: `saveOption`, `deleteOption` (actions existentes, assinatura `(fd: FormData) => Promise<void>`); `OptionRow` de `@/lib/config-types`; `Switch` (Task 3); `useSortable` de `@dnd-kit/sortable`
- Produces:
  - `OptionRowItem({ productId, groupId, option, onError }: { productId: string; groupId: string; option: OptionRow; onError: (msg: string) => void })` — linha sortable com auto-save
  - `NewOptionRow({ productId, groupId, nextSortOrder, onDone, onError }: { productId: string; groupId: string; nextSortOrder: number; onDone: () => void; onError: (msg: string) => void })` — linha de criação

- [ ] **Step 1: Instalar @dnd-kit**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: instala sem erros de peer deps.

- [ ] **Step 2: Criar `option-row.tsx`**

```tsx
// src/app/(app)/admin/produtos/[id]/option-row.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { OptionRow } from '@/lib/config-types'
import { deleteOption, saveOption } from './actions'

const selectClass =
  'h-8 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

function buildOptionFd(fields: {
  productId: string
  groupId: string
  id?: string
  label: string
  type: 'fixo' | 'por_m2'
  value: string
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
  fd.set('sort_order', String(fields.sortOrder))
  if (fields.active) fd.set('active', 'on')
  return fd
}

export function OptionRowItem({
  productId,
  groupId,
  option,
  onError,
}: {
  productId: string
  groupId: string
  option: OptionRow
  onError: (msg: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.id })
  const [label, setLabel] = useState(option.label)
  const [type, setType] = useState<'fixo' | 'por_m2'>(option.surcharge_type)
  const [value, setValue] = useState(String(option.surcharge_value))
  const [active, setActive] = useState(option.active)
  const [removed, setRemoved] = useState(false)

  // Server é fonte de verdade: reconcilia quando props mudam pós-revalidate
  useEffect(() => {
    setLabel(option.label)
    setType(option.surcharge_type)
    setValue(String(option.surcharge_value))
    setActive(option.active)
  }, [option])

  async function commit(overrides: Partial<{ type: 'fixo' | 'por_m2'; active: boolean }> = {}) {
    const fd = buildOptionFd({
      productId,
      groupId,
      id: option.id,
      label,
      type: overrides.type ?? type,
      value,
      sortOrder: option.sort_order,
      active: overrides.active ?? active,
    })
    try {
      await saveOption(fd)
    } catch {
      setLabel(option.label)
      setType(option.surcharge_type)
      setValue(String(option.surcharge_value))
      setActive(option.active)
      onError('Erro ao salvar, tente novamente')
    }
  }

  function onLabelBlur() {
    if (!label.trim()) {
      setLabel(option.label)
      return
    }
    if (label.trim() !== option.label) void commit()
  }

  function onValueBlur() {
    if (value !== String(option.surcharge_value)) void commit()
  }

  async function onDelete() {
    setRemoved(true)
    const fd = new FormData()
    fd.set('product_id', productId)
    fd.set('id', option.id)
    try {
      await deleteOption(fd)
    } catch {
      setRemoved(false)
      onError('Erro ao excluir, tente novamente')
    }
  }

  if (removed) return null

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group/row flex items-center gap-2 ${isDragging ? 'z-10 opacity-70' : ''} ${active ? '' : 'opacity-50'}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
        aria-label="Reordenar opção"
        {...attributes}
        {...listeners}
      >
        <Icon name="drag_indicator" className="text-lg" />
      </button>
      <Input
        value={label}
        onChange={e => setLabel(e.target.value)}
        onBlur={onLabelBlur}
        className="min-w-32 flex-1"
        aria-label="Opção"
      />
      <select
        value={type}
        onChange={e => {
          const next = e.target.value as 'fixo' | 'por_m2'
          setType(next)
          void commit({ type: next })
        }}
        className={selectClass}
        aria-label="Tipo de adicional"
      >
        <option value="fixo">Fixo R$</option>
        <option value="por_m2">Por m² R$</option>
      </select>
      <Input
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={onValueBlur}
        inputMode="decimal"
        className="w-24 font-mono"
        aria-label="Adicional"
      />
      <Switch
        checked={active}
        onCheckedChange={next => {
          setActive(next)
          void commit({ active: next })
        }}
        aria-label="Opção ativa"
      />
      <button
        type="button"
        onClick={onDelete}
        className="text-muted-foreground transition-colors hover:text-destructive"
        aria-label="Excluir opção"
      >
        <Icon name="close" className="text-lg" />
      </button>
    </li>
  )
}

export function NewOptionRow({
  productId,
  groupId,
  nextSortOrder,
  onDone,
  onError,
}: {
  productId: string
  groupId: string
  nextSortOrder: number
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [label, setLabel] = useState('')
  const [type, setType] = useState<'fixo' | 'por_m2'>('fixo')
  const [value, setValue] = useState('0')
  const [saving, setSaving] = useState(false)
  const labelRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    labelRef.current?.focus()
  }, [])

  async function save() {
    if (!label.trim() || saving) return
    setSaving(true)
    const fd = buildOptionFd({
      productId,
      groupId,
      label,
      type,
      value,
      sortOrder: nextSortOrder,
      active: true,
    })
    try {
      await saveOption(fd)
      onDone()
    } catch {
      setSaving(false)
      onError('Erro ao salvar, tente novamente')
    }
  }

  function onLabelBlur() {
    if (!label.trim()) onDone() // blur vazio cancela
    else void save()
  }

  return (
    <li className="flex items-center gap-2 pl-6" onKeyDown={e => e.key === 'Escape' && onDone()}>
      <Input
        ref={labelRef}
        value={label}
        onChange={e => setLabel(e.target.value)}
        onBlur={onLabelBlur}
        placeholder="Nova opção"
        disabled={saving}
        className="min-w-32 flex-1"
        aria-label="Nova opção"
      />
      <select
        value={type}
        onChange={e => setType(e.target.value as 'fixo' | 'por_m2')}
        disabled={saving}
        className={selectClass}
        aria-label="Tipo de adicional"
      >
        <option value="fixo">Fixo R$</option>
        <option value="por_m2">Por m² R$</option>
      </select>
      <Input
        value={value}
        onChange={e => setValue(e.target.value)}
        inputMode="decimal"
        disabled={saving}
        className="w-24 font-mono"
        aria-label="Adicional"
      />
    </li>
  )
}
```

Nota: se `Input` de `src/components/ui/input.tsx` não aceitar `ref` (verificar — React 19 aceita ref como prop normal em function components), ajustar conforme o componente real.

- [ ] **Step 3: Verificar tipos e lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/admin/produtos/[id]/option-row.tsx"`
Expected: sem erros

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json "src/app/(app)/admin/produtos/[id]/option-row.tsx"
git commit -m "feat: linha de opção com auto-save e sortable (@dnd-kit)"
```

---

### Task 5: Card de grupo — `group-card.tsx`

**Files:**
- Create: `src/app/(app)/admin/produtos/[id]/group-card.tsx`

**Interfaces:**
- Consumes: `OptionRowItem`, `NewOptionRow` (Task 4); `reorderOptions` (Task 2); `OptionGroupRow` de `@/lib/config-types`; `@dnd-kit/core`, `@dnd-kit/sortable`; `Badge`, `Button`, `Icon`
- Produces: `GroupCard({ productId, group, dragHandle, onEdit, onDelete }: { productId: string; group: OptionGroupRow; dragHandle?: React.ReactNode; onEdit: () => void; onDelete: () => void })` — usado na Task 7. `dragHandle` é o grip do DnD de grupos (renderizado pelo pai dentro do header).

- [ ] **Step 1: Criar `group-card.tsx`**

```tsx
// src/app/(app)/admin/produtos/[id]/group-card.tsx
'use client'
import { useEffect, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { OptionGroupRow } from '@/lib/config-types'
import { reorderOptions } from './actions'
import { NewOptionRow, OptionRowItem } from './option-row'

export function GroupCard({
  productId,
  group,
  dragHandle,
  onEdit,
  onDelete,
}: {
  productId: string
  group: OptionGroupRow
  dragHandle?: React.ReactNode
  onEdit: () => void
  onDelete: () => void
}) {
  const [optionIds, setOptionIds] = useState(group.options.map(o => o.id))
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setOptionIds(group.options.map(o => o.id))
  }, [group.options])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const prev = optionIds
    const next = arrayMove(prev, prev.indexOf(String(active.id)), prev.indexOf(String(over.id)))
    setOptionIds(next)
    reorderOptions(productId, group.id, next).catch(() => {
      setOptionIds(prev)
      setError('Erro ao reordenar, tente novamente')
    })
  }

  const optionsById = new Map(group.options.map(o => [o.id, o]))

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2">
        {dragHandle}
        <h3 className="font-bold">{group.name}</h3>
        {group.required && <Badge className="bg-primary/10 text-primary">Obrigatório</Badge>}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Editar grupo">
            <Icon name="edit" className="text-lg" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Excluir grupo">
            <Icon name="delete" className="text-lg" />
          </Button>
        </div>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={optionIds} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {optionIds.map(id => {
              const option = optionsById.get(id)
              if (!option) return null
              return (
                <OptionRowItem
                  key={id}
                  productId={productId}
                  groupId={group.id}
                  option={option}
                  onError={setError}
                />
              )
            })}
            {adding && (
              <NewOptionRow
                productId={productId}
                groupId={group.id}
                nextSortOrder={group.options.length}
                onDone={() => setAdding(false)}
                onError={setError}
              />
            )}
          </ul>
        </SortableContext>
      </DndContext>
      {!adding && (
        <button
          type="button"
          onClick={() => {
            setError('')
            setAdding(true)
          }}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <Icon name="add" className="text-lg" /> Adicionar opção
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos e lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/admin/produtos/[id]/group-card.tsx"`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/produtos/[id]/group-card.tsx"
git commit -m "feat: card de grupo com DnD de opções"
```

---

### Task 6: Modais — `group-modals.tsx`

**Files:**
- Create: `src/app/(app)/admin/produtos/[id]/group-modals.tsx`

**Interfaces:**
- Consumes: `Dialog`, `DialogClose`, `DialogContent` (Task 3); `Switch` (Task 3); `saveGroup`, `deleteGroup`, `applyTemplate`, `saveGroupAsTemplate` (actions existentes, `(fd: FormData) => Promise<void>`); `GroupTemplateRow`, `OptionGroupRow` de `@/lib/config-types`; `Button`, `Input`
- Produces:
  - `GroupFormModal({ productId, group, open, onOpenChange }: { productId: string; group: OptionGroupRow | null; open: boolean; onOpenChange: (o: boolean) => void })` — `group === null` = criar ("Adicionar Grupo"); com grupo = editar ("Editar Grupo", inclui "Salvar como template")
  - `ApplyTemplateModal({ productId, templates, open, onOpenChange }: { productId: string; templates: GroupTemplateRow[]; open: boolean; onOpenChange: (o: boolean) => void })`
  - `ConfirmDeleteGroupModal({ productId, group, open, onOpenChange }: { productId: string; group: OptionGroupRow | null; open: boolean; onOpenChange: (o: boolean) => void })`

- [ ] **Step 1: Criar `group-modals.tsx`**

```tsx
// src/app/(app)/admin/produtos/[id]/group-modals.tsx
'use client'
import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { GroupTemplateRow, OptionGroupRow } from '@/lib/config-types'
import { applyTemplate, deleteGroup, saveGroup, saveGroupAsTemplate } from './actions'

export function GroupFormModal({
  productId,
  group,
  open,
  onOpenChange,
}: {
  productId: string
  group: OptionGroupRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [required, setRequired] = useState(group?.required ?? false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open) {
      setName(group?.name ?? '')
      setRequired(group?.required ?? false)
      setError('')
    }
  }, [open, group])

  function submit() {
    if (!name.trim()) {
      setError('Nome obrigatório')
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set('product_id', productId)
      if (group) fd.set('id', group.id)
      fd.set('name', name)
      if (required) fd.set('required', 'on')
      fd.set('sort_order', String(group?.sort_order ?? 0))
      try {
        await saveGroup(fd)
        onOpenChange(false)
      } catch {
        setError('Erro ao salvar, tente novamente')
      }
    })
  }

  function saveAsTemplate() {
    if (!group) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set('product_id', productId)
      fd.set('group_id', group.id)
      try {
        await saveGroupAsTemplate(fd)
        onOpenChange(false)
      } catch {
        setError('Erro ao salvar template, tente novamente')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={group ? 'Editar Grupo' : 'Adicionar Grupo'}>
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Nome do grupo
            </span>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Cor do Alumínio"
              aria-label="Nome do grupo"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={required} onCheckedChange={setRequired} /> Seleção obrigatória
          </label>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            {group && (
              <Button variant="outline" onClick={saveAsTemplate} disabled={pending} className="mr-auto">
                Salvar como template
              </Button>
            )}
            <DialogClose
              render={<Button variant="secondary" disabled={pending}>Cancelar</Button>}
            />
            <Button onClick={submit} disabled={pending}>
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ApplyTemplateModal({
  productId,
  templates,
  open,
  onOpenChange,
}: {
  productId: string
  templates: GroupTemplateRow[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open) setError('')
  }, [open])

  function apply(templateId: string) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('product_id', productId)
      fd.set('template_id', templateId)
      try {
        await applyTemplate(fd)
        onOpenChange(false)
      } catch {
        setError('Erro ao aplicar template, tente novamente')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Aplicar Template">
        <div className="space-y-3">
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {templates.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => apply(t.id)}
              disabled={pending}
              className="block w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted disabled:opacity-50"
            >
              <span className="block font-bold">{t.name}</span>
              <span className="text-sm text-muted-foreground">
                {t.option_templates.length} {t.option_templates.length === 1 ? 'opção' : 'opções'}
              </span>
            </button>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum template disponível.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ConfirmDeleteGroupModal({
  productId,
  group,
  open,
  onOpenChange,
}: {
  productId: string
  group: OptionGroupRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open) setError('')
  }, [open])

  function confirm() {
    if (!group) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set('product_id', productId)
      fd.set('id', group.id)
      try {
        await deleteGroup(fd)
        onOpenChange(false)
      } catch {
        setError('Erro ao excluir, tente novamente')
      }
    })
  }

  const count = group?.options.length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Excluir Grupo">
        <div className="space-y-4">
          <p className="text-sm">
            Excluir o grupo <strong>{group?.name}</strong> e {count}{' '}
            {count === 1 ? 'opção' : 'opções'}? Essa ação não pode ser desfeita.
          </p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose
              render={<Button variant="secondary" disabled={pending}>Cancelar</Button>}
            />
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              Excluir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

Nota: `DialogClose` do base-ui aceita prop `render` para compor com `Button` (mesmo padrão `useRender` já usado em `badge.tsx`). Se a versão instalada divergir, alternativa: `<Button variant="secondary" onClick={() => onOpenChange(false)}>Cancelar</Button>`.

- [ ] **Step 2: Verificar tipos e lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/admin/produtos/[id]/group-modals.tsx"`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/produtos/[id]/group-modals.tsx"
git commit -m "feat: modais de grupo, template e confirmação de exclusão"
```

---

### Task 7: Orquestrador — reescrever `group-editor.tsx`

**Files:**
- Rewrite: `src/app/(app)/admin/produtos/[id]/group-editor.tsx` (substituir conteúdo inteiro)

**Interfaces:**
- Consumes: `GroupCard` (Task 5); `GroupFormModal`, `ApplyTemplateModal`, `ConfirmDeleteGroupModal` (Task 6); `reorderGroups` (Task 2); `@dnd-kit`
- Produces: `GroupEditor({ productId, groups, templates }: { productId: string; groups: OptionGroupRow[]; templates: GroupTemplateRow[] })` — **mesma assinatura atual**, `page.tsx` não muda

- [ ] **Step 1: Substituir `group-editor.tsx`**

```tsx
// src/app/(app)/admin/produtos/[id]/group-editor.tsx
'use client'
import { useEffect, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { GroupTemplateRow, OptionGroupRow } from '@/lib/config-types'
import { reorderGroups } from './actions'
import { GroupCard } from './group-card'
import { ApplyTemplateModal, ConfirmDeleteGroupModal, GroupFormModal } from './group-modals'

function SortableGroupCard({
  productId,
  group,
  onEdit,
  onDelete,
}: {
  productId: string
  group: OptionGroupRow
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'z-10 opacity-70' : undefined}
    >
      <GroupCard
        productId={productId}
        group={group}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandle={
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            aria-label="Reordenar grupo"
            {...attributes}
            {...listeners}
          >
            <Icon name="drag_indicator" className="text-lg" />
          </button>
        }
      />
    </div>
  )
}

export function GroupEditor({
  productId,
  groups,
  templates,
}: {
  productId: string
  groups: OptionGroupRow[]
  templates: GroupTemplateRow[]
}) {
  const [groupIds, setGroupIds] = useState(groups.map(g => g.id))
  const [reorderError, setReorderError] = useState('')
  const [formGroup, setFormGroup] = useState<OptionGroupRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [deleteGroup, setDeleteGroup] = useState<OptionGroupRow | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    setGroupIds(groups.map(g => g.id))
  }, [groups])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const prev = groupIds
    const next = arrayMove(prev, prev.indexOf(String(active.id)), prev.indexOf(String(over.id)))
    setGroupIds(next)
    reorderGroups(productId, next).catch(() => {
      setGroupIds(prev)
      setReorderError('Erro ao reordenar, tente novamente')
    })
  }

  const groupsById = new Map(groups.map(g => [g.id, g]))

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Grupos de Opções</h2>
        <div className="ml-auto flex items-center gap-2">
          {templates.length > 0 && (
            <Button variant="outline" onClick={() => setTemplateOpen(true)}>
              <Icon name="content_copy" className="text-base" /> Aplicar template
            </Button>
          )}
          <Button
            onClick={() => {
              setFormGroup(null)
              setFormOpen(true)
            }}
          >
            <Icon name="add" className="text-base" /> Adicionar grupo
          </Button>
        </div>
      </div>
      {reorderError && (
        <p className="text-sm text-destructive" role="alert">
          {reorderError}
        </p>
      )}
      {groups.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum grupo de opções. Adicione um grupo ou aplique um template.
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {groupIds.map(id => {
              const group = groupsById.get(id)
              if (!group) return null
              return (
                <SortableGroupCard
                  key={id}
                  productId={productId}
                  group={group}
                  onEdit={() => {
                    setFormGroup(group)
                    setFormOpen(true)
                  }}
                  onDelete={() => {
                    setDeleteGroup(group)
                    setDeleteOpen(true)
                  }}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
      <GroupFormModal productId={productId} group={formGroup} open={formOpen} onOpenChange={setFormOpen} />
      <ApplyTemplateModal
        productId={productId}
        templates={templates}
        open={templateOpen}
        onOpenChange={setTemplateOpen}
      />
      <ConfirmDeleteGroupModal
        productId={productId}
        group={deleteGroup}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </section>
  )
}
```

Nota: variável `deleteGroup` (estado) colide com nome da action — aqui não importamos a action `deleteGroup` neste arquivo (só os modais a usam), então sem conflito.

- [ ] **Step 2: Verificar tipos, lint e testes**

Run: `npx tsc --noEmit && npx eslint src && npx vitest run`
Expected: sem erros, todos os testes passam

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/produtos/[id]/group-editor.tsx"
git commit -m "feat: redesign do editor de grupos com DnD e modais"
```

---

### Task 8: Verificação manual no preview

**Files:** nenhum novo (correções pontuais se necessário)

- [ ] **Step 1: Subir dev server no preview** (launch.json / preview_start, nunca Bash)

- [ ] **Step 2: Navegar até `/admin/produtos/[id]` de um produto com grupos e verificar:**

1. Header: "Grupos de Opções" + botões "Aplicar template" (outline) e "+ Adicionar grupo" (cor primária da empresa)
2. Card: nome bold, badge "Obrigatório" (primary/10), lápis/lixeira
3. Editar nome de opção → blur → recarregar página → persistiu
4. Toggle ativo → linha fica opaca → recarregar → persistiu
5. × exclui opção na hora
6. "+ Adicionar opção" → linha nova focada → digitar + blur → salva; Esc/blur vazio cancela
7. Arrastar opção pelo grip → soltar → recarregar → ordem persistiu
8. Arrastar card de grupo → ordem persistiu
9. Lápis → modal "Editar Grupo" → mudar nome/toggle → Salvar → refletiu; "Salvar como template" cria template
10. Lixeira → modal de confirmação com nome + contagem → Excluir remove
11. "+ Adicionar grupo" → modal → cria grupo vazio
12. "Aplicar template" → modal com cards ("N opções") → clique aplica e fecha
13. Sem hex hardcoded: mudar cor da empresa em `/admin/empresa` → botões/badge/switch/links acompanham

- [ ] **Step 3: Checar console/network por erros** (read_console_messages / read_network_requests)

- [ ] **Step 4: Screenshot final para o usuário**

- [ ] **Step 5: Commit de eventuais correções**

```bash
git add -A && git commit -m "fix: ajustes pós-verificação do editor de grupos"
```

(Só se houver correções.)
