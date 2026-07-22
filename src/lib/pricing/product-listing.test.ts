import { describe, it, expect } from 'vitest'
import { pricingModeLabel, priceLabel, groupsCountLabel } from './product-listing'

describe('pricingModeLabel', () => {
  it('mapeia cada modo', () => {
    expect(pricingModeLabel('m2')).toBe('Por m²')
    expect(pricingModeLabel('m2_direto')).toBe('Por m² direto')
    expect(pricingModeLabel('fixo')).toBe('Fixo')
    expect(pricingModeLabel('manual')).toBe('Sob consulta')
  })
})

describe('priceLabel', () => {
  it('m2 e m2_direto usam price_per_m2 com sufixo /m²', () => {
    expect(priceLabel({ pricing_mode: 'm2', price_per_m2: 650, base_price: null }))
      .toBe('R$ 650,00/m²')
    expect(priceLabel({ pricing_mode: 'm2_direto', price_per_m2: 450, base_price: null }))
      .toBe('R$ 450,00/m²')
  })
  it('fixo usa base_price sem sufixo', () => {
    expect(priceLabel({ pricing_mode: 'fixo', price_per_m2: null, base_price: 4800 }))
      .toBe('R$ 4.800,00')
  })
  it('manual não tem preço', () => {
    expect(priceLabel({ pricing_mode: 'manual', price_per_m2: null, base_price: null }))
      .toBeNull()
  })
  it('trata nulos como zero', () => {
    expect(priceLabel({ pricing_mode: 'm2', price_per_m2: null, base_price: null }))
      .toBe('R$ 0,00/m²')
  })
})

describe('groupsCountLabel', () => {
  it('singular e plural', () => {
    expect(groupsCountLabel(0)).toBe('0 grupos de opções')
    expect(groupsCountLabel(1)).toBe('1 grupo de opções')
    expect(groupsCountLabel(2)).toBe('2 grupos de opções')
  })
})
