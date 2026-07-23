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

  // Server é fonte de verdade: reconcilia quando props mudam pós-revalidate.
  // Ajuste de estado durante a renderização (não em efeito) para evitar
  // renders em cascata — ver https://react.dev/learn/you-might-not-need-an-effect
  const [prevOption, setPrevOption] = useState(option)
  if (option !== prevOption) {
    setPrevOption(option)
    setLabel(option.label)
    setType(option.surcharge_type)
    setValue(String(option.surcharge_value))
    setActive(option.active)
  }

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
