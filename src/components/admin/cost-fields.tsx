'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatBRL, parseDecimal } from '@/lib/format'
import { round2 } from '@/lib/pricing/calc'
import type { PriceCategory } from '@/lib/config-types'
import type { PriceCost } from '@/lib/work-order/types'

/**
 * Um input por categoria. O name é `cost_<categoryId>`, lido pela action que
 * grava price_costs. Vazio = componente ausente (a action apaga a linha).
 *
 * O rodapé soma os componentes e, quando o preço de venda é conhecido, mostra
 * quanto sobra — venda e custo estão sempre na mesma unidade (R$ com R$,
 * R$/m² com R$/m²), então a conta fecha sem precisar da área.
 */
export function CostFields({ categories, costs, unit, salePrice, idPrefix }: {
  categories: PriceCategory[]
  costs: PriceCost[]
  /** 'R$' ou 'R$/m²', espelhando a unidade da venda */
  unit: string
  /** preço de venda na MESMA unidade do custo; null quando não há preço tabelado */
  salePrice?: number | null
  idPrefix: string
}) {
  const initial = (): Record<string, string> => Object.fromEntries(
    categories.map(c => [
      c.id,
      String(costs.find(x => x.price_category_id === c.id)?.value ?? ''),
    ]),
  )
  const [values, setValues] = useState<Record<string, string>>(initial)

  // Server é fonte de verdade: reconcilia quando as props mudam pós-revalidate.
  // Ajuste durante a renderização, padrão já usado no editor de opções.
  const [prevCosts, setPrevCosts] = useState(costs)
  if (costs !== prevCosts) {
    setPrevCosts(costs)
    setValues(initial())
  }

  const filled = categories.filter(c => values[c.id]?.trim())
  const total = round2(filled.reduce((acc, c) => acc + parseDecimal(values[c.id]), 0))
  const suffix = unit === 'R$/m²' ? '/m²' : ''
  const leftover = salePrice != null ? round2(salePrice - total) : null
  const pct = salePrice != null && salePrice > 0 && leftover != null
    ? Math.round((leftover / salePrice) * 100)
    : null

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
              value={values[cat.id] ?? ''}
              onChange={e => setValues(v => ({ ...v, [cat.id]: e.target.value }))}
              placeholder="—"
            />
          </div>
        ))}
      </div>
      {filled.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t pt-2 text-sm">
          <span>
            <span className="text-muted-foreground">Custo total </span>
            <span className="font-semibold">{formatBRL(total)}{suffix}</span>
          </span>
          {leftover != null && (
            <span>
              <span className="text-muted-foreground">sobra </span>
              <span className={`font-semibold ${leftover < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {formatBRL(leftover)}{suffix}
                {pct != null && ` (${pct}%)`}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
