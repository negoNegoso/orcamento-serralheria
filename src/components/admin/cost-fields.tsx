'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PriceCategory } from '@/lib/config-types'
import type { PriceCost } from '@/lib/work-order/types'

/**
 * Um input por categoria. O name é `cost_<categoryId>`, lido pela action que
 * grava price_costs. Vazio = componente ausente (a action apaga a linha).
 */
export function CostFields({ categories, costs, unit, idPrefix }: {
  categories: PriceCategory[]
  costs: PriceCost[]
  /** 'R$' ou 'R$/m²', espelhando a unidade da venda */
  unit: string
  idPrefix: string
}) {
  const byCategory = new Map(costs.map(c => [c.price_category_id, c.value]))
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-sm font-medium">Custo esperado ({unit})</p>
      <p className="text-xs text-muted-foreground">
        Quanto este preço custa para você. Em branco = sem custo cadastrado; a OS usa o
        preço de venda e a margem prevista dele fica zero.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {categories.map(cat => (
          <div key={cat.id} className="space-y-1">
            <Label htmlFor={`${idPrefix}-cost-${cat.id}`} className="text-xs">{cat.name}</Label>
            <Input
              id={`${idPrefix}-cost-${cat.id}`}
              name={`cost_${cat.id}`}
              inputMode="decimal"
              defaultValue={byCategory.get(cat.id) ?? ''}
              placeholder="—"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
