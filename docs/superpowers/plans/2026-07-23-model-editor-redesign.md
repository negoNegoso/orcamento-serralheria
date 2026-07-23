# Model Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign da seção "Modelos" em `/admin/produtos/[id]`: grid de cards visuais com foto, edição inline auto-save, upload por clique na foto, e dialog de confirmação de exclusão.

**Architecture:** Client component com estado local sincronizado das props (server revalida via `revalidatePath` nas actions existentes). Card de modelo isolado em `model-card.tsx`; orquestrador em `model-editor.tsx` mantém a lista + estado do card novo + modal de exclusão. Upload de foto reusa a lógica de `photo-upload.tsx` (Supabase storage client) disparada por clique na foto do card.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, `@base-ui/react` (Switch, Dialog, Input — já existentes), Supabase storage client, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-07-23-model-editor-redesign-design.md`

## Global Constraints

- **Cores: zero hex hardcoded.** Só tokens do tema: `primary`, `primary-foreground`, `muted`, `muted-foreground`, `destructive`, `border`, `background`. `--primary` vem da cor da empresa (injetada em `src/app/(app)/layout.tsx`).
- **Ícones: componente `Icon`** de `src/components/ui/icon.tsx` (Material Symbols). NÃO lucide. Nomes: `add`, `close`, `image`.
- **Copy pt-BR.**
- **Nenhuma mudança de schema/banco.** Reusa actions `saveModel`/`deleteModel` inalteradas.
- **Assinatura de export inalterada:** `ModelEditor({ productId, models, companyId }: { productId: string; models: ModelRow[]; companyId: string })` — `page.tsx` não muda.
- **Lint:** `react-hooks/set-state-in-effect` proíbe `useEffect(() => setX(...), [dep])`. Para reconciliar estado local com props, usar o padrão render-time adjust-state já estabelecido no editor de grupos (track `prevX` state, comparar por referência no render body, resetar ali). `useEffect` para foco de mount É permitido (efeito sem setState de sincronização — ver `NewOptionRow`, `option-row.tsx:201-203`).
- **Padrão de card novo:** copiar o mecanismo de `NewOptionRow` em `option-row.tsx:227-243` — `onRowBlur` guardado por `cancelledRef` + `e.currentTarget.contains(e.relatedTarget)`, Escape seta `cancelledRef.current = true` antes de `onDone()`.
- Verificação: `npx tsc --noEmit` (erro pré-existente em `.next/types` de rota recibo NÃO é seu), `npx eslint <arquivos>`, `npx vitest run` (deve permanecer verde; nenhum teste novo).

## File Structure

- Create: `src/app/(app)/admin/produtos/[id]/model-card.tsx` — card de modelo existente (`ModelCardItem`) + card novo (`NewModelCard`); helper `buildModelFd`; sub-hook/util de upload
- Rewrite: `src/app/(app)/admin/produtos/[id]/model-editor.tsx` — orquestrador: header, grid, estado do card novo, `ConfirmDeleteModelModal`
- Unchanged: `src/app/(app)/admin/produtos/[id]/actions.ts` (`saveModel`/`deleteModel` já existem), `page.tsx`, `src/components/admin/photo-upload.tsx`

Reference — `ModelRow` (de `src/lib/config-types.ts`):
```ts
export interface ModelRow {
  id: string
  name: string
  photo_url: string | null
  surcharge: number
  surcharge_type: 'fixo' | 'por_m2'
  active: boolean
  sort_order: number
}
```

Reference — actions existentes (`actions.ts`), campos lidos do FormData:
- `saveModel`: `product_id`, `id?`, `name`, `photo_url` (`'' → null`), `surcharge`, `surcharge_type`, `sort_order`, `active` (`'on'`)
- `deleteModel`: `product_id`, `id`

---

### Task 1: Upload util + card de modelo — `model-card.tsx`

**Files:**
- Create: `src/app/(app)/admin/produtos/[id]/model-card.tsx`

**Interfaces:**
- Consumes: `saveModel`, `deleteModel` de `./actions` (`(fd: FormData) => Promise<void>`); `ModelRow` de `@/lib/config-types`; `Switch` de `@/components/ui/switch`; `Icon` de `@/components/ui/icon`; `Input` de `@/components/ui/input`; `createClient` de `@/lib/supabase/client`
- Produces:
  - `buildModelFd(fields: { productId: string; id?: string; name: string; type: 'fixo' | 'por_m2'; value: string; sortOrder: number; active: boolean; photoUrl: string | null }): FormData`
  - `uploadModelPhoto(companyId: string, file: File): Promise<string>` — sobe pro bucket `fotos`, pasta `${companyId}/modelos`, retorna publicUrl; lança em erro
  - `ModelCardItem({ productId, companyId, model, onError }: { productId: string; companyId: string; model: ModelRow; onError: (msg: string) => void })`
  - `NewModelCard({ productId, companyId, nextSortOrder, onDone, onError }: { productId: string; companyId: string; nextSortOrder: number; onDone: () => void; onError: (msg: string) => void })`

- [ ] **Step 1: Criar `model-card.tsx`**

```tsx
// src/app/(app)/admin/produtos/[id]/model-card.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { ModelRow } from '@/lib/config-types'
import { deleteModel, saveModel } from './actions'

const selectClass =
  'h-8 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

export function buildModelFd(fields: {
  productId: string
  id?: string
  name: string
  type: 'fixo' | 'por_m2'
  value: string
  sortOrder: number
  active: boolean
  photoUrl: string | null
}) {
  const fd = new FormData()
  fd.set('product_id', fields.productId)
  if (fields.id) fd.set('id', fields.id)
  fd.set('name', fields.name.trim())
  fd.set('surcharge_type', fields.type)
  fd.set('surcharge', fields.value || '0')
  fd.set('sort_order', String(fields.sortOrder))
  if (fields.active) fd.set('active', 'on')
  fd.set('photo_url', fields.photoUrl ?? '')
  return fd
}

export async function uploadModelPhoto(companyId: string, file: File): Promise<string> {
  const supabase = createClient()
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${companyId}/modelos/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('fotos').upload(path, file)
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('fotos').getPublicUrl(path)
  return data.publicUrl
}

function PhotoArea({
  photoUrl,
  busy,
  onPick,
  onDelete,
}: {
  photoUrl: string | null
  busy: boolean
  onPick: (file: File) => void
  onDelete?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="group/photo relative aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-muted">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex h-full w-full items-center justify-center"
        aria-label={photoUrl ? 'Trocar foto' : 'Adicionar foto'}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name="image" className="text-4xl text-muted-foreground" />
        )}
      </button>
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
          Enviando…
        </div>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute top-2 right-2 hidden rounded-full bg-background/80 p-1 text-muted-foreground transition-colors group-hover/photo:flex hover:text-destructive"
          aria-label="Excluir modelo"
        >
          <Icon name="close" className="text-lg" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function ModelCardItem({
  productId,
  companyId,
  model,
  onError,
}: {
  productId: string
  companyId: string
  model: ModelRow
  onError: (msg: string) => void
}) {
  const [prevModel, setPrevModel] = useState(model)
  const [name, setName] = useState(model.name)
  const [type, setType] = useState<'fixo' | 'por_m2'>(model.surcharge_type)
  const [value, setValue] = useState(String(model.surcharge))
  const [active, setActive] = useState(model.active)
  const [busy, setBusy] = useState(false)

  // Server é fonte de verdade: reconcilia quando props mudam pós-revalidate
  if (model !== prevModel) {
    setPrevModel(model)
    setName(model.name)
    setType(model.surcharge_type)
    setValue(String(model.surcharge))
    setActive(model.active)
  }

  async function commit(overrides: Partial<{ type: 'fixo' | 'por_m2'; active: boolean; photoUrl: string }> = {}) {
    const fd = buildModelFd({
      productId,
      id: model.id,
      name,
      type: overrides.type ?? type,
      value,
      sortOrder: model.sort_order,
      active: overrides.active ?? active,
      photoUrl: overrides.photoUrl ?? model.photo_url,
    })
    try {
      await saveModel(fd)
      onError('')
    } catch {
      setName(model.name)
      setType(model.surcharge_type)
      setValue(String(model.surcharge))
      setActive(model.active)
      onError('Erro ao salvar, tente novamente')
    }
  }

  function onNameBlur() {
    if (!name.trim()) {
      setName(model.name)
      return
    }
    if (name.trim() !== model.name) void commit()
  }

  function onValueBlur() {
    if (value !== String(model.surcharge)) void commit()
  }

  async function onPickPhoto(file: File) {
    setBusy(true)
    try {
      const url = await uploadModelPhoto(companyId, file)
      await commit({ photoUrl: url })
    } catch {
      onError('Falha no upload da foto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`overflow-hidden rounded-lg border ${active ? '' : 'opacity-60'}`}>
      <PhotoArea
        photoUrl={model.photo_url}
        busy={busy}
        onPick={onPickPhoto}
        onDelete={() => onError('__delete__:' + model.id)}
      />
      <div className="space-y-2 p-3">
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={onNameBlur}
          aria-label="Nome do modelo"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">+R$</span>
          <Input
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={onValueBlur}
            inputMode="decimal"
            className="w-20 font-mono"
            aria-label="Adicional"
          />
          <select
            value={type}
            onChange={e => {
              const next = e.target.value as 'fixo' | 'por_m2'
              setType(next)
              void commit({ type: next })
            }}
            className={selectClass}
            aria-label="Tipo do adicional"
          >
            <option value="fixo">Fixo R$</option>
            <option value="por_m2">Por m² R$</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={active}
            onCheckedChange={next => {
              setActive(next)
              void commit({ active: next })
            }}
            aria-label="Modelo ativo"
          />
          Ativo
        </label>
      </div>
    </div>
  )
}

export function NewModelCard({
  productId,
  companyId,
  nextSortOrder,
  onDone,
  onError,
}: {
  productId: string
  companyId: string
  nextSortOrder: number
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'fixo' | 'por_m2'>('fixo')
  const [value, setValue] = useState('0')
  const [active, setActive] = useState(true)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  async function save() {
    if (!name.trim() || saving) return
    setSaving(true)
    const fd = buildModelFd({
      productId,
      name,
      type,
      value,
      sortOrder: nextSortOrder,
      active,
      photoUrl,
    })
    try {
      await saveModel(fd)
      onError('')
      onDone()
    } catch {
      setSaving(false)
      onError('Erro ao salvar, tente novamente')
    }
  }

  function onCardBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (cancelledRef.current) return
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    if (!name.trim()) onDone()
    else void save()
  }

  async function onPickPhoto(file: File) {
    setBusy(true)
    try {
      setPhotoUrl(await uploadModelPhoto(companyId, file))
    } catch {
      onError('Falha no upload da foto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="overflow-hidden rounded-lg border"
      onBlur={onCardBlur}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          cancelledRef.current = true
          onDone()
        }
      }}
    >
      <PhotoArea photoUrl={photoUrl} busy={busy} onPick={onPickPhoto} />
      <div className="space-y-2 p-3">
        <Input
          ref={nameRef}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Novo modelo"
          disabled={saving}
          aria-label="Nome do modelo"
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">+R$</span>
          <Input
            value={value}
            onChange={e => setValue(e.target.value)}
            inputMode="decimal"
            disabled={saving}
            className="w-20 font-mono"
            aria-label="Adicional"
          />
          <select
            value={type}
            onChange={e => setType(e.target.value as 'fixo' | 'por_m2')}
            disabled={saving}
            className={selectClass}
            aria-label="Tipo do adicional"
          >
            <option value="fixo">Fixo R$</option>
            <option value="por_m2">Por m² R$</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={active} onCheckedChange={setActive} aria-label="Modelo ativo" />
          Ativo
        </label>
      </div>
    </div>
  )
}
```

Nota sobre exclusão: `ModelCardItem` sinaliza o pedido de exclusão via `onError('__delete__:' + model.id)` — o orquestrador (Task 2) intercepta esse prefixo e abre o modal. Isso evita adicionar mais uma prop ao card. Se o implementer preferir uma prop `onRequestDelete(id)` dedicada, é aceitável — ajuste a assinatura em ambas as tasks e anote no report.

- [ ] **Step 2: Verificar tipos e lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/admin/produtos/[id]/model-card.tsx"`
Expected: sem erros (ignore o erro pré-existente de `.next/types` da rota recibo)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/produtos/[id]/model-card.tsx"
git commit -m "feat: card de modelo com auto-save e upload de foto"
```

---

### Task 2: Orquestrador — reescrever `model-editor.tsx`

**Files:**
- Rewrite: `src/app/(app)/admin/produtos/[id]/model-editor.tsx` (substituir conteúdo inteiro)

**Interfaces:**
- Consumes: `ModelCardItem`, `NewModelCard` (Task 1); `deleteModel` de `./actions`; `ModelRow` de `@/lib/config-types`; `Button`, `Icon`; `Dialog`, `DialogClose`, `DialogContent` de `@/components/ui/dialog`
- Produces: `ModelEditor({ productId, models, companyId }: { productId: string; models: ModelRow[]; companyId: string })` — **mesma assinatura atual**, `page.tsx` não muda

- [ ] **Step 1: Substituir `model-editor.tsx`**

```tsx
// src/app/(app)/admin/produtos/[id]/model-editor.tsx
'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import type { ModelRow } from '@/lib/config-types'
import { deleteModel } from './actions'
import { ModelCardItem, NewModelCard } from './model-card'

export function ModelEditor({
  productId,
  models,
  companyId,
}: {
  productId: string
  models: ModelRow[]
  companyId: string
}) {
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ModelRow | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function onCardError(msg: string) {
    const del = msg.match(/^__delete__:(.+)$/)
    if (del) {
      const target = models.find(m => m.id === del[1]) ?? null
      setDeleteTarget(target)
      setDeleteOpen(true)
      return
    }
    setError(msg)
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Modelos</h2>
        <Button
          className="ml-auto"
          onClick={() => {
            setError('')
            setAdding(true)
          }}
        >
          <Icon name="add" className="text-base" /> Adicionar modelo
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {models.map(m => (
          <ModelCardItem
            key={m.id}
            productId={productId}
            companyId={companyId}
            model={m}
            onError={onCardError}
          />
        ))}
        {adding && (
          <NewModelCard
            productId={productId}
            companyId={companyId}
            nextSortOrder={models.length}
            onDone={() => setAdding(false)}
            onError={onCardError}
          />
        )}
      </div>
      <ConfirmDeleteModelModal
        productId={productId}
        model={deleteTarget}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </section>
  )
}

function ConfirmDeleteModelModal({
  productId,
  model,
  open,
  onOpenChange,
}: {
  productId: string
  model: ModelRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [error, setError] = useState('')
  const [prevOpen, setPrevOpen] = useState(open)
  const [pending, startTransition] = useTransition()

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setError('')
  }

  function confirm() {
    if (!model) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set('product_id', productId)
      fd.set('id', model.id)
      try {
        await deleteModel(fd)
        onOpenChange(false)
      } catch {
        setError('Erro ao excluir, tente novamente')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Excluir Modelo">
        <div className="space-y-4">
          <p className="text-sm">
            Excluir o modelo <strong>{model?.name}</strong>? Essa ação não pode ser desfeita.
          </p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose render={<Button variant="secondary" disabled={pending}>Cancelar</Button>} />
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

- [ ] **Step 2: Verificar tipos, lint e testes**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/admin/produtos/[id]/model-editor.tsx" && npx vitest run`
Expected: sem erros; suite verde (mesma contagem de antes)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/produtos/[id]/model-editor.tsx"
git commit -m "feat: redesign do editor de modelos com grid de cards e modal de exclusão"
```

---

### Task 3: Verificação manual no preview

**Files:** nenhum novo (correções pontuais se necessário)

- [ ] **Step 1: Garantir dev server aberto** (preview_start `next-dev`, nunca Bash)

- [ ] **Step 2: Navegar até `/admin/produtos/[id]` de um produto com modelos e verificar:**

1. Header: "Modelos" + botão "+ Adicionar modelo" (cor primária da empresa)
2. Grid de cards: foto (ou placeholder cinza com ícone), nome, `+R$` valor + select tipo, Switch Ativo
3. Editar nome de modelo → blur → recarregar → persistiu
4. Editar valor → blur → recarregar → persistiu
5. Trocar tipo no select → salva na hora
6. Toggle Ativo → card fica opaco → recarregar → persistiu
7. Clicar na foto → escolher imagem → sobe e aparece (spinner "Enviando…" durante)
8. Hover no card → × na foto → dialog "Excluir modelo X?" → Excluir remove
9. "+ Adicionar modelo" → card novo com placeholder, nome focado → digitar + clicar fora → salva; Esc cancela; nome vazio + clicar fora cancela
10. Upload de foto no card novo antes de salvar → foto some/entra junto ao salvar
11. Sem hex hardcoded: botão/switch/ícones na cor da empresa

- [ ] **Step 3: Checar console/network por erros** (read_console_messages / read_network_requests)

- [ ] **Step 4: Screenshot final para o usuário**

- [ ] **Step 5: Commit de eventuais correções** (só se houver)

```bash
git add -A && git commit -m "fix: ajustes pós-verificação do editor de modelos"
```
