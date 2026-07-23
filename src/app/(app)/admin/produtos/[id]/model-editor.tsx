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
