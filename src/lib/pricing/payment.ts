export interface PaymentConditionRow {
  description: string
  min_total: number | null
  max_total: number | null
  sort_order: number
  active: boolean
}

export function applicableConditions<T extends PaymentConditionRow>(conds: T[], total: number): T[] {
  return conds
    .filter(c => c.active
      && (c.min_total == null || total >= c.min_total)
      && (c.max_total == null || total <= c.max_total))
    .sort((a, b) => a.sort_order - b.sort_order)
}
