import { describe, expect, it } from 'vitest'
import { PricingError } from './calc'
import { buildSnapshot, type ItemSelection } from './snapshot'
import type { ProductConfig } from '@/lib/config-types'

const portao: ProductConfig = {
  id: 'p1',
  name: 'Portão de Alumínio',
  pricing_mode: 'm2',
  price_per_m2: 100,
  base_price: null,
  active: true,
  sort_order: 0,
  option_groups: [
    {
      id: 'g1',
      name: 'Cor',
      required: true,
      sort_order: 0,
      options: [
        { id: 'o1', label: 'Branco', surcharge_type: 'fixo', surcharge_value: 0, sort_order: 0, active: true },
        { id: 'o2', label: 'Bronze', surcharge_type: 'fixo', surcharge_value: 500, sort_order: 1, active: true },
      ],
    },
    {
      id: 'g2',
      name: 'Abertura',
      required: false,
      sort_order: 1,
      options: [
        { id: 'o3', label: 'Correr', surcharge_type: 'fixo', surcharge_value: 0, sort_order: 0, active: true },
      ],
    },
  ],
  models: [
    { id: 'm1', name: 'Lambril', photo_url: 'http://x/f.jpg', surcharge: 150, surcharge_type: 'fixo', active: true, sort_order: 0 },
    { id: 'm2', name: 'Veneziana', photo_url: null, surcharge: 50, surcharge_type: 'por_m2', active: true, sort_order: 1 },
  ],
}

const sel = (over: Partial<ItemSelection> = {}): ItemSelection => ({
  productTypeId: 'p1',
  modelId: null,
  optionIds: ['o1'],
  widthM: 2,
  heightM: 1.5,
  areaM2: null,
  manualPrice: null,
  qty: 1,
  extraValue: null,
  note: '',
  ...over,
})

describe('buildSnapshot', () => {
  it('congela nomes e valores e calcula totais', () => {
    const s = buildSnapshot(portao, sel({ optionIds: ['o2'], modelId: 'm1', qty: 2 }))
    expect(s.product_name).toBe('Portão de Alumínio')
    expect(s.model_name).toBe('Lambril')
    expect(s.area_m2).toBe(3)
    expect(s.unit_base_price).toBe(300)
    expect(s.unit_total).toBe(950) // 300 + 500 bronze + 150 modelo
    expect(s.line_total).toBe(1900)
    expect(s.selected_options).toEqual([
      { optionId: 'o2', group: 'Cor', label: 'Bronze', surchargeType: 'fixo', surchargeValue: 500 },
    ])
  })
  it('aplica adicional do modelo por m²', () => {
    const s = buildSnapshot(portao, sel({ optionIds: ['o1'], modelId: 'm2' }))
    expect(s.model_name).toBe('Veneziana')
    expect(s.unit_total).toBe(450) // 300 + 50×3 m²
  })
  it('rejeita grupo obrigatório sem seleção', () => {
    expect(() => buildSnapshot(portao, sel({ optionIds: [] }))).toThrow(PricingError)
    expect(() => buildSnapshot(portao, sel({ optionIds: ['o3'] }))).toThrow(PricingError) // só grupo opcional
  })
  it('rejeita optionId inexistente', () => {
    expect(() => buildSnapshot(portao, sel({ optionIds: ['o1', 'zzz'] }))).toThrow(PricingError)
  })
  it('rejeita modelId inexistente', () => {
    expect(() => buildSnapshot(portao, sel({ modelId: 'zzz' }))).toThrow(PricingError)
  })
  it('rejeita produto errado', () => {
    expect(() => buildSnapshot(portao, sel({ productTypeId: 'outro' }))).toThrow(PricingError)
  })
  it('produto manual usa valor digitado e guarda medidas informativas', () => {
    const suprema: ProductConfig = {
      id: 'p2',
      name: 'Janela Linha Suprema',
      pricing_mode: 'manual',
      price_per_m2: null,
      base_price: null,
      active: true,
      sort_order: 0,
      option_groups: [],
      models: [],
    }
    const s = buildSnapshot(suprema, sel({ productTypeId: 'p2', optionIds: [], manualPrice: 3200 }))
    expect(s.unit_base_price).toBe(3200)
    expect(s.line_total).toBe(3200)
    expect(s.width_m).toBe(2)
    expect(s.area_m2).toBe(3)
    expect(() => buildSnapshot(suprema, sel({ productTypeId: 'p2', optionIds: [], manualPrice: null })))
      .toThrow(PricingError)
  })
  it('congela ajuste e observação no snapshot', () => {
    const s = buildSnapshot(portao, sel({ optionIds: ['o1'], extraValue: -50, note: 'Instalação em 15 dias' }))
    expect(s.extra_value).toBe(-50)
    expect(s.note).toBe('Instalação em 15 dias')
    expect(s.line_total).toBe(250) // 300 − 50
  })
  it('sem ajuste/observação: defaults 0 e vazio', () => {
    const s = buildSnapshot(portao, sel())
    expect(s.extra_value).toBe(0)
    expect(s.note).toBe('')
  })
  it('produto m2_direto usa metragem digitada, sem largura/altura', () => {
    const tela: ProductConfig = {
      id: 'p3',
      name: 'Tela Mosquiteira',
      pricing_mode: 'm2_direto',
      price_per_m2: 80,
      base_price: null,
      active: true,
      sort_order: 0,
      option_groups: [],
      models: [],
    }
    const s = buildSnapshot(tela, sel({ productTypeId: 'p3', optionIds: [], widthM: null, heightM: null, areaM2: 2.5 }))
    expect(s.area_m2).toBe(2.5)
    expect(s.width_m).toBeNull()
    expect(s.height_m).toBeNull()
    expect(s.unit_base_price).toBe(200) // 2.5 × 80
    expect(s.line_total).toBe(200)
    expect(() => buildSnapshot(tela, sel({ productTypeId: 'p3', optionIds: [], areaM2: null })))
      .toThrow(PricingError)
  })
})
