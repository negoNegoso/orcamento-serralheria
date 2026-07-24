import { describe, expect, it } from 'vitest'
import { buildPreviewInputs, type QuoteItemRow } from './quote-preview'
import type { PriceCategory, ProductConfig } from '@/lib/config-types'
import type { PriceCost } from './types'

const categories: PriceCategory[] = [
  { id: 'cat-a', slug: 'a', name: 'Categoria A', sort_order: 2 },
  { id: 'cat-b', slug: 'b', name: 'Categoria B', sort_order: 1 },
]

const products: ProductConfig[] = [{
  id: 'pt1', name: 'Produto', pricing_mode: 'fixo', price_per_m2: null, base_price: 100,
  price_category_id: 'cat-a', active: true, sort_order: 0,
  option_groups: [{
    id: 'g1', name: 'Grupo', required: false, price_category_id: 'cat-b', sort_order: 0,
    options: [
      { id: 'opt1', label: 'Opção sem categoria própria', surcharge_type: 'fixo', surcharge_value: 20, price_category_id: null, sort_order: 0, active: true },
    ],
  }],
  models: [],
}]

function row(over: Partial<QuoteItemRow> = {}): QuoteItemRow {
  return {
    id: 'qi1', product_type_id: 'pt1', product_name: 'Produto', model_name: null,
    width_m: null, height_m: null, area_m2: null, qty: 1,
    unit_base_price: 100, line_total: 120, extra_value: 0,
    selected_options: [{ optionId: 'opt1', group: 'Grupo', label: 'Opção', surchargeType: 'fixo', surchargeValue: 20 }],
    ...over,
  }
}

describe('buildPreviewInputs', () => {
  it('resolve categoria do produto, modo de preço e categoria efetiva da opção (herda do grupo)', () => {
    const [input] = buildPreviewInputs([row()], products, [], categories)
    expect(input.productCategoryId).toBe('cat-a')
    expect(input.pricingMode).toBe('fixo')
    // opt1 não tem price_category_id próprio → herda a do grupo (cat-b)
    expect(input.optionCategoryIds.opt1).toBe('cat-b')
  })

  it('ordena baseCosts pelo sort_order da categoria, não pela ordem de price_costs (paridade com o clone SQL)', () => {
    const priceCosts: PriceCost[] = [
      // cat-a (sort_order 2) vem primeiro no array, mas cat-b (sort_order 1) deve sair na frente
      { id: 'pc1', product_type_id: 'pt1', option_id: null, price_category_id: 'cat-a', value: 10 },
      { id: 'pc2', product_type_id: 'pt1', option_id: null, price_category_id: 'cat-b', value: 5 },
    ]
    const [input] = buildPreviewInputs([row()], products, priceCosts, categories)
    expect(input.baseCosts.map(c => c.priceCategoryId)).toEqual(['cat-b', 'cat-a'])
  })

  it('ordena optionCosts do mesmo jeito e só preenche a chave quando há custo cadastrado', () => {
    const priceCosts: PriceCost[] = [
      { id: 'pc3', product_type_id: null, option_id: 'opt1', price_category_id: 'cat-a', value: 3 },
      { id: 'pc4', product_type_id: null, option_id: 'opt1', price_category_id: 'cat-b', value: 7 },
    ]
    const [input] = buildPreviewInputs([row()], products, priceCosts, categories)
    expect(input.optionCosts.opt1?.map(c => c.priceCategoryId)).toEqual(['cat-b', 'cat-a'])
  })

  it('item sem produto cadastrado (ou product_type_id nulo) cai no fallback seguro', () => {
    const [input] = buildPreviewInputs(
      [row({ product_type_id: null, selected_options: [] })],
      products, [], categories,
    )
    expect(input.productCategoryId).toBeNull()
    expect(input.pricingMode).toBe('fixo')
    expect(input.baseCosts).toEqual([])
    expect(input.optionCategoryIds).toEqual({})
  })
})
