import { describe, expect, it } from 'vitest'
import { previewMargin } from './preview-margin'
import type { DecomposeInput } from './decompose'

function item(over: Partial<DecomposeInput> = {}): DecomposeInput {
  return {
    quoteItemId: 'qi1', productName: 'Serviço',
    widthM: null, heightM: null, areaM2: null,
    qty: 1, unitBasePrice: 600, lineTotal: 600, extraValue: 0,
    modelName: null, selectedOptions: [], productCategoryId: null,
    optionCategoryIds: {}, pricingMode: 'fixo',
    baseCosts: [], optionCosts: {},
    categoryNames: { 'cat-insumo': 'Insumo', 'cat-custo': 'Custo' },
    ...over,
  }
}

describe('previewMargin', () => {
  it('com custo cadastrado, margem prevista é venda menos custo', () => {
    const r = previewMargin([item({
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 180 }],
    })], 600, 1)
    expect(r).toEqual({ predictedMargin: 420, plannedTotal: 180, uncostedCount: 0 })
  })

  it('sem custo cadastrado, margem prevista é zero e conta o serviço', () => {
    const r = previewMargin([item()], 600, 1)
    expect(r).toEqual({ predictedMargin: 0, plannedTotal: 600, uncostedCount: 1 })
  })

  it('cadastro parcial: soma o que tem e conta só o que falta', () => {
    const r = previewMargin([
      item({ baseCosts: [{ priceCategoryId: 'cat-insumo', value: 180 }] }),
      item({ unitBasePrice: 400, lineTotal: 400 }),
    ], 1000, 1)
    expect(r.plannedTotal).toBe(580)
    expect(r.predictedMargin).toBe(420)
    expect(r.uncostedCount).toBe(1)
  })

  it('conta um serviço por preço sem custo, não uma vez por linha gerada', () => {
    const r = previewMargin([item({
      lineTotal: 600 + 100,
      selectedOptions: [
        { optionId: 'o1', group: 'Extra', label: 'Solda', surchargeType: 'fixo', surchargeValue: 100 },
      ],
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 180 }],
    })], 700, 1)
    // base tem custo, opção não → 1 sem custo
    expect(r.uncostedCount).toBe(1)
  })

  it('lista vazia devolve zeros', () => {
    expect(previewMargin([], 0, 1)).toEqual({ predictedMargin: 0, plannedTotal: 0, uncostedCount: 0 })
  })
})
