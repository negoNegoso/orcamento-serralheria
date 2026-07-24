'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { addCost } from '@/app/(app)/orcamentos/[id]/ordem/actions'
import type { PriceCategory } from '@/lib/config-types'

export function AddCostModal({ quoteId, workOrderId, categories }: {
  quoteId: string; workOrderId: string; categories: PriceCategory[]
}) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<'manual' | 'terceiro'>('manual')

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Adicionar custo</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Novo lançamento de custo">
          <form action={addCost.bind(null, quoteId)} onSubmit={() => setOpen(false)} className="space-y-3">
            <input type="hidden" name="work_order_id" value={workOrderId} />
            <input type="hidden" name="source" value={source} />

            <div className="flex gap-2">
              <Button type="button" size="sm"
                variant={source === 'manual' ? 'default' : 'outline'}
                onClick={() => setSource('manual')}>Custo interno</Button>
              <Button type="button" size="sm"
                variant={source === 'terceiro' ? 'default' : 'outline'}
                onClick={() => setSource('terceiro')}>Terceiro</Button>
            </div>

            <label className="block text-sm">Descrição
              <input name="description" required className="mt-1 w-full rounded-md border px-2 py-1" />
            </label>

            <label className="block text-sm">Categoria
              <select name="price_category_id" className="mt-1 w-full rounded-md border px-2 py-1">
                <option value="">— sem categoria —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>

            <div className="flex gap-2">
              <label className="block flex-1 text-sm">Quantidade
                <input name="qty" defaultValue="1" inputMode="decimal"
                  className="mt-1 w-full rounded-md border px-2 py-1" />
              </label>
              <label className="block flex-1 text-sm">Valor unitário
                <input name="unit_value" defaultValue="0" inputMode="decimal"
                  className="mt-1 w-full rounded-md border px-2 py-1" />
              </label>
            </div>

            {source === 'terceiro' && (
              <label className="block text-sm">Fornecedor
                <input name="supplier" className="mt-1 w-full rounded-md border px-2 py-1" />
              </label>
            )}

            <label className="block text-sm">Observação
              <input name="note" className="mt-1 w-full rounded-md border px-2 py-1" />
            </label>

            <div className="flex justify-end gap-2">
              <DialogClose render={<Button type="button" variant="outline">Cancelar</Button>} />
              <SubmitButton>Lançar</SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
