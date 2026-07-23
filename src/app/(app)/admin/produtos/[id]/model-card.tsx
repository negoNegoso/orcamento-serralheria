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
