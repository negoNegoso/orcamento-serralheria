'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProductConfig } from '@/lib/config-types'
import { formatBRL, parseDecimal } from '@/lib/format'
import { PricingError, calcQuoteTotal } from '@/lib/pricing/calc'
import { quoteDisplayFooter, itemDisplayGross } from '@/lib/pricing/display'
import { buildSnapshot, type ItemSelection, type ItemSnapshot } from '@/lib/pricing/snapshot'
import { saveQuote } from '@/app/(app)/orcamentos/actions'
import { ItemForm } from './item-form'

export interface ExistingQuote {
  id: string
  customer_name: string
  customer_phone: string
  site_address: string
  discount: number
  multiplier: number
  status: string
  token: string
  /** total congelado no último salvamento — base do aviso de divergência */
  savedTotal: number
  items: ItemSelection[]
}

export function QuoteEditor({ products, quote }: { products: ProductConfig[]; quote?: ExistingQuote }) {
  const router = useRouter()
  const [customerName, setCustomerName] = useState(quote?.customer_name ?? '')
  const [customerPhone, setCustomerPhone] = useState(quote?.customer_phone ?? '')
  const [siteAddress, setSiteAddress] = useState(quote?.site_address ?? '')
  const [discountStr, setDiscountStr] = useState(quote?.discount ? String(quote.discount) : '')
  const [multiplierStr, setMultiplierStr] = useState(String(quote?.multiplier ?? 1))
  const [items, setItems] = useState<ItemSelection[]>(quote?.items ?? [])
  const [editing, setEditing] = useState<number | 'new' | 'dup' | null>(quote ? null : 'new')
  const [dupSeed, setDupSeed] = useState<{ index: number; sel: ItemSelection } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const computed = useMemo(() => {
    const snaps: (ItemSnapshot | { error: string })[] = items.map(sel => {
      const p = products.find(p => p.id === sel.productTypeId)
      if (!p) return { error: 'Produto removido da tabela — exclua este item' }
      try { return buildSnapshot(p, sel) } catch (e) {
        return { error: e instanceof PricingError ? e.message : 'Erro' }
      }
    })
    const valid = snaps.filter((s): s is ItemSnapshot => !('error' in s))
    const discount = discountStr ? parseDecimal(discountStr) : 0
    const multiplier = Math.max(1, Math.trunc(Number(multiplierStr)) || 1)
    let totals = { subtotal: 0, unitTotal: 0, total: 0 }
    let totalError = ''
    try { totals = calcQuoteTotal(valid.map(s => s.line_total), discount, multiplier) }
    catch (e) { totalError = e instanceof PricingError ? e.message : 'Erro' }
    const footer = quoteDisplayFooter(totals.subtotal, discount, valid.map(s => s.extra_value), multiplier)
    return { snaps, totals, footer, totalError, allValid: valid.length === items.length }
  }, [items, products, discountStr, multiplierStr])

  async function onSave() {
    setSaving(true); setError('')
    const res = await saveQuote({
      id: quote?.id,
      customerName, customerPhone, siteAddress,
      discount: discountStr ? parseDecimal(discountStr) : 0,
      multiplier: Math.max(1, Math.trunc(Number(multiplierStr)) || 1),
      items,
    })
    if ('error' in res) { setError(res.error); setSaving(false); return }
    if (quote?.id) {
      // edição: já estamos em /orcamentos/[id] — push para a mesma rota não
      // remonta o componente, então o estado precisa ser resetado aqui
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      router.refresh()
    } else {
      router.push(`/orcamentos/${res.id}`)
      router.refresh()
    }
  }

  // a cópia só entra na lista quando confirmada; enquanto o formulário está
  // aberto ela vive em dupSeed, então trocar/cancelar nunca deixa item órfão
  function duplicateItem(i: number) {
    const copy: ItemSelection = { ...items[i], optionIds: [...items[i].optionIds] }
    setDupSeed({ index: i, sel: copy })
    setEditing('dup')
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="font-semibold">Cliente</h2>
        <div className="space-y-1"><Label>Nome *</Label>
          <Input value={customerName} onChange={e => setCustomerName(e.target.value)} /></div>
        <div className="space-y-1"><Label>Telefone/WhatsApp</Label>
          <Input inputMode="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} /></div>
        <div className="space-y-1"><Label>Endereço da obra</Label>
          <Input value={siteAddress} onChange={e => setSiteAddress(e.target.value)} /></div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Itens</h2>
        {items.map((sel, i) => {
          const s = computed.snaps[i]
          if (editing === i) {
            return <ItemForm key={i} products={products} initial={sel}
              onConfirm={ns => { setItems(arr => arr.map((x, j) => j === i ? ns : x)); setEditing(null) }}
              onCancel={() => setEditing(null)} />
          }
          return (
            <div key={i} className="space-y-3">
              <div className="flex items-start justify-between rounded border p-3">
                {'error' in s
                  ? <p className="text-sm text-red-600">{s.error}</p>
                  : <div className="text-sm">
                      <p className="font-medium">{s.product_name}{s.model_name && ` — ${s.model_name}`}</p>
                      <p className="text-muted-foreground">
                        {s.area_m2 != null && `${s.width_m} × ${s.height_m} m (${s.area_m2} m²) · `}
                        {s.selected_options.map(o => o.label).join(', ')}
                        {s.qty > 1 && ` · ${s.qty}un`}
                      </p>
                      <p className="font-semibold">{formatBRL(itemDisplayGross(s.line_total, s.extra_value))}</p>
                      {s.extra_value !== 0 && (
                        <p className={s.extra_value < 0 ? 'text-green-700' : 'text-muted-foreground'}>
                          Ajuste: {s.extra_value > 0 ? '+' : '−'}{formatBRL(Math.abs(s.extra_value))}
                        </p>
                      )}
                      {s.note && <p className="italic text-muted-foreground">{s.note}</p>}
                    </div>}
                <div className="flex shrink-0 gap-2 text-sm">
                  <button className="underline" onClick={() => duplicateItem(i)}>duplicar</button>
                  <button className="underline" onClick={() => setEditing(i)}>editar</button>
                  <button className="text-red-600 underline"
                    onClick={() => setItems(arr => arr.filter((_, j) => j !== i))}>remover</button>
                </div>
              </div>
              {editing === 'dup' && dupSeed?.index === i && (
                <ItemForm products={products} initial={dupSeed.sel}
                  onConfirm={ns => {
                    setItems(arr => [...arr.slice(0, i + 1), ns, ...arr.slice(i + 1)])
                    setEditing(null); setDupSeed(null)
                  }}
                  onCancel={() => { setEditing(null); setDupSeed(null) }} />
              )}
            </div>
          )
        })}
        {editing === 'new'
          ? <ItemForm products={products}
              onConfirm={ns => { setItems(arr => [...arr, ns]); setEditing(null) }}
              onCancel={() => setEditing(null)} />
          : <Button variant="outline" onClick={() => setEditing('new')}>+ Adicionar item</Button>}
      </section>

      <section className="space-y-2 border-t pt-3">
        <div className="flex items-center gap-2">
          <Label className="shrink-0">Desconto (R$)</Label>
          <Input inputMode="decimal" value={discountStr} onChange={e => setDiscountStr(e.target.value)} className="w-28" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="shrink-0">Multiplicador (casas)</Label>
          <Input inputMode="numeric" value={multiplierStr}
            onChange={e => setMultiplierStr(e.target.value)} className="w-20" />
        </div>
        {computed.footer.hasDeduction && (
          <p className="text-sm text-green-700">Desconto: −{formatBRL(computed.footer.discount)}</p>
        )}
        <p className="text-sm text-muted-foreground">Subtotal: {formatBRL(computed.footer.subtotal)}</p>
        {computed.footer.multiplier > 1 ? (
          <>
            <p className="text-sm text-muted-foreground">Valor por unidade: {formatBRL(computed.footer.unitTotal)}</p>
            <p className="text-sm text-muted-foreground">{computed.footer.multiplier} casas × {formatBRL(computed.footer.unitTotal)}</p>
            <p className="text-lg font-bold">Total ({computed.footer.multiplier} casas): {formatBRL(computed.totals.total)}</p>
          </>
        ) : (
          <p className="text-lg font-bold">Total: {formatBRL(computed.totals.total)}</p>
        )}
        {quote && !saved && computed.allValid && computed.totals.total !== quote.savedTotal && (
          <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
            O total salvo era {formatBRL(quote.savedTotal)} — recalculado pela tabela atual dá{' '}
            {formatBRL(computed.totals.total)}. Salvar grava os novos valores.
          </p>
        )}
        {computed.totalError && <p className="text-sm text-red-600">{computed.totalError}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={onSave} disabled={saving || !computed.allValid || !!computed.totalError || items.length === 0 || !customerName.trim()}>
          {saving ? 'Salvando…' : saved ? 'Salvo!' : 'Salvar orçamento'}
        </Button>
        <p className="text-xs text-muted-foreground">Ao salvar, os preços são recalculados pela tabela atual e congelados no orçamento.</p>
      </section>
    </div>
  )
}
