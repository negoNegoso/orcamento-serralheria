import { describe, expect, it } from 'vitest'
import { decomposeItem, itemLabel, type DecomposeInput } from './decompose'
import { round2 } from '@/lib/pricing/calc'

function input(over: Partial<DecomposeInput> = {}): DecomposeInput {
  return {
    quoteItemId: 'qi1',
    productName: 'Portão',
    widthM: 3, heightM: 2, areaM2: 6,
    qty: 1,
    unitBasePrice: 1200,
    lineTotal: 1200,
    extraValue: 0,
    modelName: null,
    selectedOptions: [],
    productCategoryId: 'cat-custo',
    optionCategoryIds: {},
    pricingMode: 'fixo',
    baseCosts: [],
    optionCosts: {},
    categoryNames: { 'cat-custo': 'Custo', 'cat-insumo': 'Insumo', 'cat-repasse': 'Repasse' },
    ...over,
  }
}

describe('itemLabel', () => {
  it('nome com as medidas quando existem', () => {
    expect(itemLabel({ productName: 'Portão', widthM: 3, heightM: 2.5 })).toBe('Portão 3,00×2,50')
  })
  it('só o nome quando não há medidas', () => {
    expect(itemLabel({ productName: 'Corrimão', widthM: null, heightM: null })).toBe('Corrimão')
  })
})

describe('decomposeItem', () => {
  it('item só com preço base gera uma linha com a categoria do produto', () => {
    const lines = decomposeItem(input(), 1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      description: 'Preço base', itemLabel: 'Portão 3,00×2,00',
      quoteItemId: 'qi1', priceCategoryId: 'cat-custo', plannedValue: 1200, sortOrder: 0,
    })
  })

  it('opção fixa entra pelo valor cheio; opção por_m2 multiplica pela área', () => {
    const lines = decomposeItem(input({
      lineTotal: 1200 + 150 + 40 * 6,
      selectedOptions: [
        { optionId: 'o1', group: 'Ferragens', label: 'Fechadura', surchargeType: 'fixo', surchargeValue: 150 },
        { optionId: 'o2', group: 'Acabamento', label: 'Pintura', surchargeType: 'por_m2', surchargeValue: 40 },
      ],
      optionCategoryIds: { o1: 'cat-insumo', o2: 'cat-repasse' },
    }), 1)
    expect(lines.map(l => [l.description, l.priceCategoryId, l.plannedValue])).toEqual([
      ['Preço base', 'cat-custo', 1200],
      ['Ferragens — Fechadura', 'cat-insumo', 150],
      ['Acabamento — Pintura', 'cat-repasse', 240],
    ])
  })

  it('opção sem optionId no snapshot fica sem categoria', () => {
    const lines = decomposeItem(input({
      lineTotal: 1300,
      selectedOptions: [
        { group: 'Extra', label: 'Solda', surchargeType: 'fixo', surchargeValue: 100 },
      ],
    }), 1)
    expect(lines[1]).toMatchObject({ description: 'Extra — Solda', priceCategoryId: null, plannedValue: 100 })
  })

  it('opção de valor zero continua gerando linha (carrega a natureza do escopo)', () => {
    const lines = decomposeItem(input({
      selectedOptions: [
        { optionId: 'o1', group: 'Cor', label: 'Branco', surchargeType: 'fixo', surchargeValue: 0 },
      ],
      optionCategoryIds: { o1: 'cat-insumo' },
    }), 1)
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatchObject({ plannedValue: 0, priceCategoryId: 'cat-insumo' })
  })

  it('qty multiplica base e opções', () => {
    const lines = decomposeItem(input({
      qty: 3,
      lineTotal: (1200 + 150) * 3,
      selectedOptions: [
        { optionId: 'o1', group: 'Ferragens', label: 'Fechadura', surchargeType: 'fixo', surchargeValue: 150 },
      ],
      optionCategoryIds: { o1: 'cat-insumo' },
    }), 1)
    expect(lines.map(l => l.plannedValue)).toEqual([3600, 450])
  })

  it('multiplier do orçamento multiplica tudo', () => {
    const lines = decomposeItem(input({ lineTotal: 1200 }), 3)
    expect(lines[0].plannedValue).toBe(3600)
  })

  it('opção por_m2 escala por área, qty e multiplier ao mesmo tempo', () => {
    // área 6 × R$ 40 = 240 por unidade; × qty 3 = 720; × multiplier 2 = 1440
    const lines = decomposeItem(input({
      qty: 3,
      areaM2: 6,
      lineTotal: (1200 + 40 * 6) * 3,
      selectedOptions: [
        { optionId: 'o1', group: 'Acabamento', label: 'Pintura', surchargeType: 'por_m2', surchargeValue: 40 },
      ],
      optionCategoryIds: { o1: 'cat-repasse' },
    }), 2)
    expect(lines.map(l => l.plannedValue)).toEqual([7200, 1440])
  })

  it('extra_value vira linha própria sem categoria; zero não gera linha', () => {
    const comExtra = decomposeItem(input({ extraValue: -80, lineTotal: 1120 }), 1)
    expect(comExtra[1]).toMatchObject({ description: 'Ajuste do item', priceCategoryId: null, plannedValue: -80 })
    expect(decomposeItem(input(), 1)).toHaveLength(1)
  })

  it('sobra do modelo vira linha de resíduo nomeada', () => {
    const lines = decomposeItem(input({ modelName: 'Colonial', lineTotal: 1500 }), 1)
    expect(lines[1]).toMatchObject({
      description: 'Modelo Colonial', priceCategoryId: null, plannedValue: 300,
    })
  })

  it('sobra sem modelo é rotulada como arredondamento', () => {
    const lines = decomposeItem(input({ lineTotal: 1200.01 }), 1)
    expect(lines[1]).toMatchObject({ description: 'Ajuste de arredondamento', plannedValue: 0.01 })
  })

  it('invariante: a soma das linhas é sempre line_total × multiplier', () => {
    const casos: [Partial<DecomposeInput>, number][] = [
      [{ lineTotal: 1200 }, 1],
      [{ lineTotal: 1500, modelName: 'Colonial' }, 3],
      [{ qty: 7, unitBasePrice: 35.035, lineTotal: 245.25, extraValue: -0.01 }, 2],
      [{
        lineTotal: 1590, areaM2: 6, modelName: 'Colonial', extraValue: 50,
        selectedOptions: [
          { optionId: 'o1', group: 'A', label: 'x', surchargeType: 'por_m2', surchargeValue: 13.33 },
        ],
      }, 5],
    ]
    for (const [over, m] of casos) {
      const lines = decomposeItem(input(over), m)
      const soma = round2(lines.reduce((a, l) => a + l.plannedValue, 0))
      expect(soma).toBe(round2(input(over).lineTotal * m))
    }
  })

  it('sortOrder é contínuo e respeita o startSort', () => {
    const lines = decomposeItem(input({ extraValue: 10, lineTotal: 1210 }), 1, 5)
    expect(lines.map(l => l.sortOrder)).toEqual([5, 6])
  })
})

describe('decomposeItem com custo esperado', () => {
  it('sem custo cadastrado mantém o comportamento antigo, marcado como venda', () => {
    const lines = decomposeItem(input(), 1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      description: 'Preço base', plannedValue: 1200, plannedKind: 'venda',
    })
  })

  it('base com dois componentes vira duas linhas de custo, nomeadas pela natureza', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 600, lineTotal: 600,
      baseCosts: [
        { priceCategoryId: 'cat-insumo', value: 40 },
        { priceCategoryId: 'cat-custo', value: 140 },
      ],
    }), 1)
    expect(lines.map(l => [l.description, l.priceCategoryId, l.plannedValue, l.plannedKind])).toEqual([
      ['Preço base — Insumo', 'cat-insumo', 40, 'custo'],
      ['Preço base — Custo', 'cat-custo', 140, 'custo'],
    ])
  })

  it('componente único não deixa sobra da venda na base', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 600, lineTotal: 600,
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 200 }],
    }), 1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ plannedValue: 200, plannedKind: 'custo' })
  })

  it('produto por m² escala o custo pela área', () => {
    const lines = decomposeItem(input({
      pricingMode: 'm2', areaM2: 6, unitBasePrice: 1200, lineTotal: 1200,
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 30 }],
    }), 1)
    // 30 R$/m² × 6 m² = 180
    expect(lines[0]).toMatchObject({ plannedValue: 180, plannedKind: 'custo' })
  })

  it('custo escala por qty e multiplier junto', () => {
    const lines = decomposeItem(input({
      qty: 3, unitBasePrice: 600, lineTotal: 1800,
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 50 }],
    }), 2)
    // 50 × 3 × 2 = 300
    expect(lines[0]).toMatchObject({ plannedValue: 300 })
  })

  it('opção com custo vira linha de custo; opção sem custo cai no fallback de venda', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 600, lineTotal: 600 + 150 + 100,
      selectedOptions: [
        { optionId: 'o1', group: 'Ferragens', label: 'Fechadura', surchargeType: 'fixo', surchargeValue: 150 },
        { optionId: 'o2', group: 'Extra', label: 'Solda', surchargeType: 'fixo', surchargeValue: 100 },
      ],
      optionCategoryIds: { o1: 'cat-insumo', o2: 'cat-repasse' },
      optionCosts: { o1: [{ priceCategoryId: 'cat-insumo', value: 60 }] },
    }), 1)
    expect(lines.map(l => [l.description, l.plannedValue, l.plannedKind])).toEqual([
      ['Preço base', 600, 'venda'],
      ['Ferragens — Fechadura — Insumo', 60, 'custo'],
      ['Extra — Solda', 100, 'venda'],
    ])
  })

  it('opção por_m2 com custo escala o custo pela área', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 600, areaM2: 6, lineTotal: 600 + 40 * 6,
      selectedOptions: [
        { optionId: 'o1', group: 'Acabamento', label: 'Pintura', surchargeType: 'por_m2', surchargeValue: 40 },
      ],
      optionCategoryIds: { o1: 'cat-repasse' },
      optionCosts: { o1: [{ priceCategoryId: 'cat-repasse', value: 12 }] },
    }), 1)
    // 12 R$/m² × 6 = 72
    expect(lines[1]).toMatchObject({ description: 'Acabamento — Pintura — Repasse', plannedValue: 72 })
  })

  it('resíduo do modelo é medido contra a VENDA, não contra as linhas de custo', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 1200, lineTotal: 1500, modelName: 'Colonial',
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 300 }],
    }), 1)
    // venda distribuída = 1200; resíduo = 1500 − 1200 = 300 (o surcharge do modelo)
    expect(lines.map(l => [l.description, l.plannedValue, l.plannedKind])).toEqual([
      ['Preço base — Insumo', 300, 'custo'],
      ['Modelo Colonial', 300, 'estrutural'],
    ])
  })

  it('múltiplos componentes não inflam a soma de venda do resíduo', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 1200, lineTotal: 1500, modelName: 'Colonial',
      baseCosts: [
        { priceCategoryId: 'cat-insumo', value: 100 },
        { priceCategoryId: 'cat-custo', value: 200 },
      ],
    }), 1)
    // a venda 1200 conta UMA vez, não uma por componente → resíduo continua 300
    expect(lines[lines.length - 1]).toMatchObject({ description: 'Modelo Colonial', plannedValue: 300 })
  })

  it('ajuste do item é estrutural e entra na soma do resíduo', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 1200, extraValue: -200, lineTotal: 1000,
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 500 }],
    }), 1)
    expect(lines.map(l => [l.description, l.plannedValue, l.plannedKind])).toEqual([
      ['Preço base — Insumo', 500, 'custo'],
      ['Ajuste do item', -200, 'estrutural'],
    ])
  })

  it('componente de categoria desconhecida usa o id como rótulo em vez de sumir', () => {
    const lines = decomposeItem(input({
      unitBasePrice: 600, lineTotal: 600,
      baseCosts: [{ priceCategoryId: 'cat-fantasma', value: 10 }],
    }), 1)
    expect(lines[0].description).toBe('Preço base — Sem categoria')
    expect(lines[0].priceCategoryId).toBe('cat-fantasma')
  })

  it('produto manual ignora custo de catálogo e cai na venda', () => {
    const lines = decomposeItem(input({
      pricingMode: 'manual', unitBasePrice: 600, lineTotal: 600,
      baseCosts: [{ priceCategoryId: 'cat-insumo', value: 180 }],
    }), 1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ description: 'Preço base', plannedValue: 600, plannedKind: 'venda' })
  })
})
