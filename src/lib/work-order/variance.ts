import { round2 } from '@/lib/pricing/calc'
import type { PriceCategory } from '@/lib/config-types'
import type { CategoryTotals } from './types'

/** Positivo = estourou o planejado. Negativo = gastou menos. */
export function variance(planned: number, actual: number): number {
  return round2(actual - planned)
}

/** null quando o planejado é zero: custo não previsto não tem base de comparação. */
export function variancePercent(planned: number, actual: number): number | null {
  if (planned === 0) return null
  return round2(((actual - planned) / planned) * 100)
}

export function margin(quoteTotal: number, actualTotal: number): number {
  return round2(quoteTotal - actualTotal)
}

type CostSlice = { price_category_id: string | null; planned_value: number; actual_value: number }

function emptyRow(id: string | null, name: string): CategoryTotals {
  return { price_category_id: id, name, planned_total: 0, actual_total: 0, variance: 0 }
}

/**
 * Uma linha por categoria do catálogo (mesmo zerada, para a tabela não mudar de
 * forma), mais "Sem categoria" ao final quando existe custo descategorizado.
 * Categoria que sumiu do catálogo cai em "Sem categoria" em vez de desaparecer.
 */
export function rollupByCategory(
  costs: CostSlice[],
  categories: PriceCategory[],
): CategoryTotals[] {
  const rows = new Map<string, CategoryTotals>()
  for (const c of [...categories].sort((a, b) => a.sort_order - b.sort_order)) {
    rows.set(c.id, emptyRow(c.id, c.name))
  }
  let uncategorized: CategoryTotals | null = null

  for (const cost of costs) {
    let row = cost.price_category_id ? rows.get(cost.price_category_id) : undefined
    if (!row) {
      uncategorized ??= emptyRow(null, 'Sem categoria')
      row = uncategorized
    }
    row.planned_total = round2(row.planned_total + cost.planned_value)
    row.actual_total = round2(row.actual_total + cost.actual_value)
  }

  const out = [...rows.values()]
  if (uncategorized) out.push(uncategorized)
  for (const r of out) r.variance = variance(r.planned_total, r.actual_total)
  return out
}
