// src/app/(app)/admin/produtos/[id]/group-editor.tsx
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

  // Server é fonte de verdade: reconcilia quando props mudam pós-revalidate.
  // Ajuste de estado durante a renderização (não em efeito) para evitar
  // renders em cascata — ver https://react.dev/learn/you-might-not-need-an-effect
  const [prevGroups, setPrevGroups] = useState(groups)
  if (groups !== prevGroups) {
    setPrevGroups(groups)
    setGroupIds(groups.map(g => g.id))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  )

  function onDragEnd(event: DragEndEvent) {
    setReorderError('')
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
