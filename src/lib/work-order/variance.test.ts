import { describe, expect, it } from 'vitest'
import { margin, rollupByCategory, variance, variancePercent } from './variance'
import type { PriceCategory } from '@/lib/config-types'

const CATS: PriceCategory[] = [
  { id: 'c1', slug: 'custo', name: 'Custo', sort_order: 0 },
  { id: 'c2', slug: 'insumo', name: 'Insumo', sort_order: 1 },
]

function cost(price_category_id: string | null, planned_value: number, actual_value: number) {
  return { price_category_id, planned_value, actual_value }
}

describe('variance', () => {
  it('estouro é positivo, economia é negativa', () => {
    expect(variance(100, 130)).toBe(30)
    expect(variance(100, 80)).toBe(-20)
  })
  it('arredonda em 2 casas', () => {
    expect(variance(35.035, 35.045)).toBe(0.01)
  })
})

describe('variancePercent', () => {
  it('percentual sobre o planejado', () => {
    expect(variancePercent(200, 230)).toBe(15)
  })
  it('planejado zero não tem base de comparação', () => {
    expect(variancePercent(0, 500)).toBeNull()
  })
})

describe('margin', () => {
  it('total do orçamento menos custo real', () => {
    expect(margin(10000, 6400)).toBe(3600)
  })
  it('custo acima do total dá margem negativa', () => {
    expect(margin(1000, 1200)).toBe(-200)
  })
})

describe('rollupByCategory', () => {
  it('soma por categoria, na ordem do catálogo, mesmo sem lançamentos', () => {
    const rows = rollupByCategory([cost('c2', 10, 12)], CATS)
    expect(rows.map(r => r.name)).toEqual(['Custo', 'Insumo'])
    expect(rows[0]).toMatchObject({ planned_total: 0, actual_total: 0, variance: 0 })
    expect(rows[1]).toMatchObject({ planned_total: 10, actual_total: 12, variance: 2 })
  })
  it('linha sem categoria vira "Sem categoria", sempre por último', () => {
    const rows = rollupByCategory([cost(null, 5, 9), cost('c1', 1, 1)], CATS)
    expect(rows[rows.length - 1]).toMatchObject({
      price_category_id: null, name: 'Sem categoria', planned_total: 5, actual_total: 9, variance: 4,
    })
  })
  it('sem linha descategorizada, não cria a linha "Sem categoria"', () => {
    const rows = rollupByCategory([cost('c1', 1, 1)], CATS)
    expect(rows).toHaveLength(2)
  })
  it('categoria que sumiu do catálogo cai em "Sem categoria"', () => {
    const rows = rollupByCategory([cost('apagada', 7, 7)], CATS)
    expect(rows[rows.length - 1]).toMatchObject({ price_category_id: null, actual_total: 7 })
  })
})
