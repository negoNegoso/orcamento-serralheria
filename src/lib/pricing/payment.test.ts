import { describe, expect, it } from 'vitest'
import { applicableConditions } from './payment'

const c = (description: string, min: number | null, max: number | null, sort = 0, active = true) =>
  ({ description, min_total: min, max_total: max, sort_order: sort, active })

describe('applicableConditions', () => {
  const conds = [
    c('50% entrada + 50% entrega', null, null, 1),
    c('50% + 3x cartão', null, 5000, 2),
    c('50% + até 5x cartão', 5000.01, null, 3),
    c('10x sem juros', null, 11000, 4),
    c('12x sem juros', 11000.01, null, 5),
    c('inativa', null, null, 0, false),
  ]
  it('total 3000: sem 5x nem 12x', () => {
    expect(applicableConditions(conds, 3000).map(x => x.description))
      .toEqual(['50% entrada + 50% entrega', '50% + 3x cartão', '10x sem juros'])
  })
  it('total 12000: com 5x e 12x, sem 3x nem 10x', () => {
    expect(applicableConditions(conds, 12000).map(x => x.description))
      .toEqual(['50% entrada + 50% entrega', '50% + até 5x cartão', '12x sem juros'])
  })
  it('limites inclusivos e ordena por sort_order', () => {
    const r = applicableConditions(conds, 5000)
    expect(r.map(x => x.description)).toEqual(['50% entrada + 50% entrega', '50% + 3x cartão', '10x sem juros'])
    expect(r[0].sort_order).toBeLessThan(r[1].sort_order)
  })
  it('exclui inativas', () => {
    expect(applicableConditions(conds, 100).some(x => x.description === 'inativa')).toBe(false)
  })
})
