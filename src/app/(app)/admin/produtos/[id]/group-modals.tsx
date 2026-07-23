// src/app/(app)/admin/produtos/[id]/group-modals.tsx
'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { GroupTemplateRow, OptionGroupRow, PriceCategory } from '@/lib/config-types'
import { applyTemplate, deleteGroup, saveGroup, saveGroupAsTemplate } from './actions'

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
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [prevOpen, setPrevOpen] = useState(open)
  const [prevGroup, setPrevGroup] = useState(group)

  if (open !== prevOpen || group !== prevGroup) {
    setPrevOpen(open)
    setPrevGroup(group)
    if (open) {
      setName(group?.name ?? '')
      setRequired(group?.required ?? false)
      setCategoryId(group?.price_category_id ?? '')
      setError('')
    }
  }

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
      fd.set('price_category_id', categoryId)
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
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setError('')
  }

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
  const [prevOpen, setPrevOpen] = useState(open)

  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setError('')
  }

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
