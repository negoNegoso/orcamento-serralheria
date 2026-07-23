// src/app/(app)/admin/produtos/[id]/group-card.tsx
'use client'
import { useState } from 'react'
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
import type { OptionGroupRow, PriceCategory } from '@/lib/config-types'
import { categoryName } from '@/lib/pricing/price-category'
import { reorderOptions } from './actions'
import { NewOptionRow, OptionRowItem } from './option-row'

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
  const [optionIds, setOptionIds] = useState(group.options.map(o => o.id))
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  // Server é fonte de verdade: reconcilia quando props mudam pós-revalidate.
  // Ajuste de estado durante a renderização (não em efeito) para evitar
  // renders em cascata — ver https://react.dev/learn/you-might-not-need-an-effect
  const [prevOptions, setPrevOptions] = useState(group.options)
  if (group.options !== prevOptions) {
    setPrevOptions(group.options)
    setOptionIds(group.options.map(o => o.id))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  )

  function onDragEnd(event: DragEndEvent) {
    setError('')
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
  const groupCategory = categoryName(categories, group.price_category_id)

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2">
        {dragHandle}
        <h3 className="font-bold">{group.name}</h3>
        {group.required && <Badge className="bg-primary/10 text-primary">Obrigatório</Badge>}
        {groupCategory && <Badge variant="secondary">{groupCategory}</Badge>}
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
      <DndContext id={`opts-${group.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
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
