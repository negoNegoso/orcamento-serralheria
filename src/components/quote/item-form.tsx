'use client'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ProductConfig } from '@/lib/config-types'
import { formatBRL, parseDecimal } from '@/lib/format'
import { PricingError } from '@/lib/pricing/calc'
import { buildSnapshot, type ItemSelection, type ItemSnapshot } from '@/lib/pricing/snapshot'

export function ItemForm({ products, initial, onConfirm, onCancel }: {
  products: ProductConfig[]
  initial?: ItemSelection
  onConfirm: (sel: ItemSelection) => void
  onCancel: () => void
}) {
  const [productId, setProductId] = useState(initial?.productTypeId ?? products[0]?.id ?? '')
  const [optionIds, setOptionIds] = useState<string[]>(initial?.optionIds ?? [])
  const [modelId, setModelId] = useState<string | null>(initial?.modelId ?? null)
  const [width, setWidth] = useState(initial?.widthM?.toString() ?? '')
  const [height, setHeight] = useState(initial?.heightM?.toString() ?? '')
  const [manualStr, setManualStr] = useState(initial?.manualPrice?.toString() ?? '')
  const [extraStr, setExtraStr] = useState(initial?.extraValue?.toString() ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  // string no estado: permite apagar/redigitar no teclado do celular;
  // campo vazio ou inválido conta como 1 só na hora do cálculo
  const [qtyStr, setQtyStr] = useState(String(initial?.qty ?? 1))
  const qty = Math.max(1, Math.trunc(Number(qtyStr)) || 1)

  const product = products.find(p => p.id === productId)

  const sel: ItemSelection = useMemo(() => ({
    productTypeId: productId,
    modelId,
    optionIds,
    widthM: width ? parseDecimal(width) : null,
    heightM: height ? parseDecimal(height) : null,
    manualPrice: manualStr ? parseDecimal(manualStr) : null,
    qty,
    extraValue: extraStr.trim() ? parseDecimal(extraStr) : null,
    note,
  }), [productId, modelId, optionIds, width, height, manualStr, qty, extraStr, note])

  const preview = useMemo((): { snap: ItemSnapshot } | { error: string } => {
    if (!product) return { error: 'Escolha um produto' }
    try { return { snap: buildSnapshot(product, sel) } }
    catch (e) { return { error: e instanceof PricingError ? e.message : 'Erro no cálculo' } }
  }, [product, sel])

  function pickOption(groupOptionIds: string[], optionId: string) {
    // escolha única por grupo: remove os demais ids do grupo e adiciona o clicado
    setOptionIds(ids => [...ids.filter(i => !groupOptionIds.includes(i)), optionId])
  }

  if (!product) return <p className="text-sm text-red-600">Nenhum produto ativo cadastrado.</p>

  return (
    <div className="space-y-4 rounded border p-3">
      <div className="space-y-1">
        <Label>Produto</Label>
        <select value={productId} className="w-full rounded border bg-background p-2"
          onChange={e => { setProductId(e.target.value); setOptionIds([]); setModelId(null) }}>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {product.pricing_mode !== 'fixo' && (
        <div className="flex gap-2">
          <div className="space-y-1 flex-1">
            <Label>Largura (m){product.pricing_mode === 'manual' && ' — opcional'}</Label>
            <Input inputMode="decimal" value={width} onChange={e => setWidth(e.target.value)} placeholder="2,50" />
          </div>
          <div className="space-y-1 flex-1">
            <Label>Altura (m){product.pricing_mode === 'manual' && ' — opcional'}</Label>
            <Input inputMode="decimal" value={height} onChange={e => setHeight(e.target.value)} placeholder="2,10" />
          </div>
        </div>
      )}

      {product.pricing_mode === 'manual' && (
        <div className="space-y-1">
          <Label>Valor combinado (R$) — orçado pela responsável</Label>
          <Input inputMode="decimal" value={manualStr} onChange={e => setManualStr(e.target.value)} placeholder="3.200,00" />
        </div>
      )}

      {product.option_groups.map(g => (
        <div key={g.id} className="space-y-1">
          <Label>{g.name}{g.required && ' *'}</Label>
          <div className="flex flex-wrap gap-2">
            {g.options.map(o => {
              const selected = optionIds.includes(o.id)
              return (
                <button key={o.id} type="button"
                  onClick={() => pickOption(g.options.map(x => x.id), o.id)}
                  className={`rounded border px-3 py-2 text-sm ${selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}>
                  {o.label}{o.surcharge_value > 0 && ` (+${formatBRL(o.surcharge_value)}${o.surcharge_type === 'por_m2' ? '/m²' : ''})`}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {product.models.length > 0 && (
        <div className="space-y-1">
          <Label>Modelo (opcional)</Label>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button type="button" onClick={() => setModelId(null)}
              className={`shrink-0 rounded border px-3 py-2 text-sm ${modelId == null ? 'border-primary' : ''}`}>
              Sem modelo
            </button>
            {product.models.map(m => (
              <button key={m.id} type="button" onClick={() => setModelId(m.id)}
                className={`shrink-0 rounded border p-1 text-center text-xs ${modelId === m.id ? 'border-primary ring-2 ring-primary' : ''}`}>
                {m.photo_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={m.photo_url} alt={m.name} className="h-20 w-24 rounded object-cover" />
                  : <div className="flex h-20 w-24 items-center justify-center rounded bg-muted">sem foto</div>}
                <p className="mt-1 w-24 truncate">{m.name}{m.surcharge > 0 && ` +${formatBRL(m.surcharge)}`}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label>Quantidade</Label>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-10 w-10 text-lg"
            onClick={() => setQtyStr(String(Math.max(1, qty - 1)))} aria-label="Diminuir quantidade">−</Button>
          <Input type="number" inputMode="numeric" min={1} value={qtyStr}
            onChange={e => setQtyStr(e.target.value)}
            onBlur={() => setQtyStr(String(qty))}
            className="w-20 text-center" />
          <Button type="button" variant="outline" size="sm" className="h-10 w-10 text-lg"
            onClick={() => setQtyStr(String(qty + 1))} aria-label="Aumentar quantidade">+</Button>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Ajuste do item (R$) — opcional, use − para abater</Label>
        <Input inputMode="text" value={extraStr} onChange={e => setExtraStr(e.target.value)}
          placeholder="ex: 150 ou -100" className="w-40" />
      </div>

      <div className="space-y-1">
        <Label>Observação (aparece no orçamento)</Label>
        <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
          placeholder="ex: Instalação em até 15 dias" />
      </div>

      {'snap' in preview
        ? <p className="font-semibold">
            {preview.snap.area_m2 != null && <span className="mr-2 text-sm text-muted-foreground">{preview.snap.area_m2} m²</span>}
            Subtotal do item: {formatBRL(preview.snap.line_total)}
          </p>
        : <p className="text-sm text-amber-700">{preview.error}</p>}

      <div className="flex gap-2">
        <Button type="button" disabled={!('snap' in preview)} onClick={() => onConfirm(sel)}>
          {initial ? 'Atualizar item' : 'Adicionar ao orçamento'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  )
}
