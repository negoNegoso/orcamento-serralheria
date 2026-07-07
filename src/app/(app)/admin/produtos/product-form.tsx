'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SubmitButton } from '@/components/ui/submit-button'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ProductForm({ product, action }: { product?: any; action: (fd: FormData) => Promise<void> }) {
  const [mode, setMode] = useState<'m2' | 'fixo' | 'manual'>(product?.pricing_mode ?? 'm2')
  return (
    <form action={action} className="space-y-3 rounded border p-3">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="space-y-1">
        <Label htmlFor={`name-${product?.id ?? 'new'}`}>Nome do produto</Label>
        <Input id={`name-${product?.id ?? 'new'}`} name="name" defaultValue={product?.name ?? ''} required />
      </div>
      <div className="space-y-1">
        <Label>Modo de preço</Label>
        <select name="pricing_mode" value={mode} onChange={e => setMode(e.target.value as 'm2' | 'fixo' | 'manual')}
          className="w-full rounded border bg-background p-2">
          <option value="m2">Por m² (largura × altura)</option>
          <option value="fixo">Preço fixo</option>
          <option value="manual">Sob consulta (vendedor digita o valor no orçamento)</option>
        </select>
      </div>
      {mode === 'm2' && (
        <div className="space-y-1">
          <Label htmlFor={`ppm2-${product?.id ?? 'new'}`}>Preço por m² (R$)</Label>
          <Input id={`ppm2-${product?.id ?? 'new'}`} name="price_per_m2" inputMode="decimal"
            defaultValue={product?.price_per_m2 ?? ''} required />
        </div>
      )}
      {mode === 'fixo' && (
        <div className="space-y-1">
          <Label htmlFor={`bp-${product?.id ?? 'new'}`}>Preço fixo (R$)</Label>
          <Input id={`bp-${product?.id ?? 'new'}`} name="base_price" inputMode="decimal"
            defaultValue={product?.base_price ?? ''} required />
        </div>
      )}
      {mode === 'manual' && (
        <p className="text-sm text-muted-foreground">
          Sem preço tabelado: a responsável orça e o vendedor digita o valor combinado ao montar o orçamento.
        </p>
      )}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={product?.active ?? true} /> Ativo
        </label>
        <div className="flex items-center gap-2 text-sm">
          Ordem <Input name="sort_order" type="number" className="w-20" defaultValue={product?.sort_order ?? 0} />
        </div>
      </div>
      <SubmitButton size="sm">{product ? 'Salvar' : 'Adicionar produto'}</SubmitButton>
    </form>
  )
}
