'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'
import { PhotoUpload } from '@/components/admin/photo-upload'
import type { ModelRow } from '@/lib/config-types'
import { deleteModel, saveModel } from './actions'

function ModelForm({ productId, model }: { productId: string; model?: ModelRow }) {
  const [photo, setPhoto] = useState<string | null>(model?.photo_url ?? null)
  return (
    <form action={saveModel} className="space-y-2 rounded border p-3">
      <input type="hidden" name="product_id" value={productId} />
      {model && <input type="hidden" name="id" value={model.id} />}
      <input type="hidden" name="photo_url" value={photo ?? ''} />
      <div className="flex flex-wrap items-end gap-2">
        <Input name="name" defaultValue={model?.name ?? ''} placeholder="Nome do modelo" className="w-44" required />
        <Input name="surcharge" inputMode="decimal" defaultValue={model?.surcharge ?? 0} className="w-24" aria-label="Adicional R$" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="active" defaultChecked={model?.active ?? true} /> Ativo
        </label>
        <Input name="sort_order" type="number" defaultValue={model?.sort_order ?? 0} className="w-16" aria-label="Ordem" />
        <SubmitButton size="sm">{model ? 'Salvar' : 'Adicionar modelo'}</SubmitButton>
      </div>
      <PhotoUpload folder="modelos" value={photo} onChange={setPhoto} />
    </form>
  )
}

export function ModelEditor({ productId, models }: { productId: string; models: ModelRow[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Modelos (galeria para o cliente)</h2>
      {models.map(m => (
        <div key={m.id} className="space-y-1">
          <ModelForm productId={productId} model={m} />
          <form action={deleteModel}>
            <input type="hidden" name="product_id" value={productId} />
            <input type="hidden" name="id" value={m.id} />
            <SubmitButton variant="link" className="h-auto px-0 text-xs text-red-600 underline">excluir modelo</SubmitButton>
          </form>
        </div>
      ))}
      <ModelForm productId={productId} />
    </section>
  )
}
