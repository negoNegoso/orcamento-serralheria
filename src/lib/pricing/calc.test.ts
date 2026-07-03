import { describe, expect, it } from 'vitest'
import { PricingError, calcItem, calcQuoteTotal, round2 } from './calc'
import type { ItemInput } from './types'

const m2Item = (over: Partial<ItemInput> = {}): ItemInput => ({
  pricingMode: 'm2', pricePerM2: 100, widthM: 2, heightM: 1.5,
  qty: 1, options: [], ...over,
})

describe('round2', () => {
  it('arredonda meio para cima', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.344)).toBe(2.34)
    expect(round2(2.345)).toBe(2.35)
  })
  it('fronteiras .xx5 em magnitudes reais de dinheiro (regressão float)', () => {
    expect(round2(4.015)).toBe(4.02)
    expect(round2(8.075)).toBe(8.08)
    expect(round2(35.035)).toBe(35.04)
    expect(round2(67.335)).toBe(67.34)
    expect(round2(2730)).toBe(2730)
  })
})

describe('calcItem por m²', () => {
  it('base = área × preço/m²', () => {
    const r = calcItem(m2Item()) // 3 m² × 100
    expect(r.areaM2).toBe(3)
    expect(r.unitBasePrice).toBe(300)
    expect(r.unitTotal).toBe(300)
    expect(r.lineTotal).toBe(300)
  })
  it('soma adicional fixo (Bronze +500)', () => {
    const r = calcItem(m2Item({ options: [{ group: 'Cor', label: 'Bronze', surchargeType: 'fixo', surchargeValue: 500 }] }))
    expect(r.unitTotal).toBe(800)
  })
  it('adicional por m² multiplica pela área', () => {
    const r = calcItem(m2Item({ options: [{ group: 'Vidro', label: 'Fumê', surchargeType: 'por_m2', surchargeValue: 50 }] }))
    expect(r.unitTotal).toBe(450) // 300 + 50×3
  })
  it('soma adicional do modelo e multiplica por quantidade', () => {
    const r = calcItem(m2Item({ modelSurcharge: 120, qty: 3 }))
    expect(r.unitTotal).toBe(420)
    expect(r.lineTotal).toBe(1260)
  })
  it('rejeita medidas ausentes ou zero', () => {
    expect(() => calcItem(m2Item({ widthM: 0 }))).toThrow(PricingError)
    expect(() => calcItem(m2Item({ heightM: null }))).toThrow(PricingError)
  })
  it('rejeita produto m² sem preço configurado', () => {
    expect(() => calcItem(m2Item({ pricePerM2: null }))).toThrow(PricingError)
  })
})

describe('calcItem fixo', () => {
  const fixo = (over: Partial<ItemInput> = {}): ItemInput => ({
    pricingMode: 'fixo', basePrice: 1800, qty: 1, options: [], ...over,
  })
  it('base = preço fixo, ignora medidas', () => {
    expect(calcItem(fixo()).unitTotal).toBe(1800)
    expect(calcItem(fixo()).areaM2).toBeNull()
  })
  it('adicional por_m2 em produto fixo contribui 0', () => {
    const r = calcItem(fixo({ options: [{ group: 'X', label: 'Y', surchargeType: 'por_m2', surchargeValue: 99 }] }))
    expect(r.unitTotal).toBe(1800)
  })
  it('rejeita qty < 1 ou não inteira', () => {
    expect(() => calcItem(fixo({ qty: 0 }))).toThrow(PricingError)
    expect(() => calcItem(fixo({ qty: 1.5 }))).toThrow(PricingError)
  })
})

describe('calcItem manual (sob consulta)', () => {
  const manual = (over: Partial<ItemInput> = {}): ItemInput => ({
    pricingMode: 'manual', manualPrice: 2500, qty: 1, options: [], ...over,
  })
  it('base = valor digitado', () => {
    const r = calcItem(manual())
    expect(r.unitBasePrice).toBe(2500)
    expect(r.unitTotal).toBe(2500)
    expect(r.areaM2).toBeNull()
  })
  it('medidas opcionais viram área informativa', () => {
    const r = calcItem(manual({ widthM: 2, heightM: 1.5 }))
    expect(r.areaM2).toBe(3)
    expect(r.unitTotal).toBe(2500) // área não altera o valor
  })
  it('soma adicionais e quantidade normalmente', () => {
    const r = calcItem(manual({ qty: 2, options: [{ group: 'Cor', label: 'Bronze', surchargeType: 'fixo', surchargeValue: 250 }] }))
    expect(r.unitTotal).toBe(2750)
    expect(r.lineTotal).toBe(5500)
  })
  it('rejeita valor ausente ou negativo', () => {
    expect(() => calcItem(manual({ manualPrice: null }))).toThrow(PricingError)
    expect(() => calcItem(manual({ manualPrice: -1 }))).toThrow(PricingError)
  })
})

describe('calcQuoteTotal', () => {
  it('soma linhas e aplica desconto', () => {
    expect(calcQuoteTotal([300, 1260], 60)).toEqual({ subtotal: 1560, total: 1500 })
  })
  it('desconto padrão 0', () => {
    expect(calcQuoteTotal([100.005]).total).toBe(100.01)
  })
  it('rejeita desconto negativo ou maior que subtotal', () => {
    expect(() => calcQuoteTotal([100], -1)).toThrow(PricingError)
    expect(() => calcQuoteTotal([100], 101)).toThrow(PricingError)
  })
})
