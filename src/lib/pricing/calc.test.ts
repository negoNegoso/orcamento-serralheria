import { describe, expect, it } from 'vitest'
import { PricingError, calcItem, calcQuoteTotal, discountAmount, round2 } from './calc'
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
  it('adicional do modelo por m² multiplica pela área', () => {
    const r = calcItem(m2Item({ modelSurcharge: 50, modelSurchargeType: 'por_m2' }))
    expect(r.unitTotal).toBe(450) // 300 + 50×3
  })
  it('rejeita medidas ausentes ou zero', () => {
    expect(() => calcItem(m2Item({ widthM: 0 }))).toThrow(PricingError)
    expect(() => calcItem(m2Item({ heightM: null }))).toThrow(PricingError)
  })
  it('rejeita produto m² sem preço configurado', () => {
    expect(() => calcItem(m2Item({ pricePerM2: null }))).toThrow(PricingError)
  })
})

describe('calcItem m² direto (metragem digitada)', () => {
  const direto = (over: Partial<ItemInput> = {}): ItemInput => ({
    pricingMode: 'm2_direto', pricePerM2: 100, areaInputM2: 3,
    qty: 1, options: [], ...over,
  })
  it('base = metragem × preço/m²', () => {
    const r = calcItem(direto())
    expect(r.areaM2).toBe(3)
    expect(r.unitBasePrice).toBe(300)
    expect(r.unitTotal).toBe(300)
    expect(r.lineTotal).toBe(300)
  })
  it('arredonda metragem digitada para 2 casas', () => {
    expect(calcItem(direto({ areaInputM2: 3.456 })).areaM2).toBe(3.46)
  })
  it('adicional por m² multiplica pela metragem digitada', () => {
    const r = calcItem(direto({ options: [{ group: 'Vidro', label: 'Fumê', surchargeType: 'por_m2', surchargeValue: 50 }] }))
    expect(r.unitTotal).toBe(450) // 300 + 50×3
  })
  it('adicional do modelo por m² multiplica pela metragem', () => {
    const r = calcItem(direto({ modelSurcharge: 50, modelSurchargeType: 'por_m2' }))
    expect(r.unitTotal).toBe(450)
  })
  it('rejeita metragem ausente ou zero', () => {
    expect(() => calcItem(direto({ areaInputM2: 0 }))).toThrow(PricingError)
    expect(() => calcItem(direto({ areaInputM2: null }))).toThrow(PricingError)
  })
  it('rejeita produto sem preço por m² configurado', () => {
    expect(() => calcItem(direto({ pricePerM2: null }))).toThrow(PricingError)
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

describe('calcItem extraValue (ajuste do item)', () => {
  it('ajuste positivo soma uma vez na linha, não no unitário', () => {
    const r = calcItem(m2Item({ qty: 2, extraValue: 100 }))
    expect(r.unitTotal).toBe(300)
    expect(r.lineTotal).toBe(700) // 300×2 + 100
  })
  it('ajuste negativo abate da linha', () => {
    expect(calcItem(m2Item({ extraValue: -50 })).lineTotal).toBe(250)
  })
  it('ajuste ausente ou zero não muda nada', () => {
    expect(calcItem(m2Item({})).lineTotal).toBe(300)
    expect(calcItem(m2Item({ extraValue: 0 })).lineTotal).toBe(300)
    expect(calcItem(m2Item({ extraValue: null })).lineTotal).toBe(300)
  })
  it('rejeita ajuste que deixa a linha negativa', () => {
    expect(() => calcItem(m2Item({ extraValue: -301 }))).toThrow(PricingError)
  })
  it('linha zerada por ajuste é permitida', () => {
    expect(calcItem(m2Item({ extraValue: -300 })).lineTotal).toBe(0)
  })
})

describe('discountAmount', () => {
  it('percent: aplica a porcentagem sobre o subtotal líquido', () => {
    expect(discountAmount(1000, 'percent', 10)).toBe(100)
    expect(discountAmount(1400, 'percent', 5)).toBe(70)
  })
  it('percent: arredonda em fronteira de dinheiro', () => {
    expect(discountAmount(333.7, 'percent', 12.5)).toBe(41.71) // 41.7125
  })
  it('percent: 0 e 100 são válidos', () => {
    expect(discountAmount(1000, 'percent', 0)).toBe(0)
    expect(discountAmount(1000, 'percent', 100)).toBe(1000)
  })
  it('percent: rejeita fora de 0–100', () => {
    expect(() => discountAmount(1000, 'percent', -1)).toThrow(PricingError)
    expect(() => discountAmount(1000, 'percent', 101)).toThrow(PricingError)
  })
  it('valor: devolve o próprio valor em R$', () => {
    expect(discountAmount(1000, 'valor', 250)).toBe(250)
  })
  it('valor: rejeita negativo ou maior que o subtotal', () => {
    expect(() => discountAmount(1000, 'valor', -1)).toThrow(PricingError)
    expect(() => discountAmount(1000, 'valor', 1001)).toThrow(PricingError)
  })
})

describe('calcQuoteTotal', () => {
  it('soma linhas e aplica desconto em valor', () => {
    expect(calcQuoteTotal([300, 1260], 'valor', 60)).toEqual({ subtotal: 1560, unitTotal: 1500, total: 1500 })
  })
  it('aplica desconto percentual sobre o subtotal', () => {
    expect(calcQuoteTotal([300, 1260], 'percent', 10)).toEqual({ subtotal: 1560, unitTotal: 1404, total: 1404 })
  })
  it('desconto padrão 0 (tipo valor)', () => {
    expect(calcQuoteTotal([100.005]).total).toBe(100.01)
  })
  it('rejeita desconto valor negativo ou maior que subtotal', () => {
    expect(() => calcQuoteTotal([100], 'valor', -1)).toThrow(PricingError)
    expect(() => calcQuoteTotal([100], 'valor', 101)).toThrow(PricingError)
  })
  it('rejeita percentual fora de 0–100', () => {
    expect(() => calcQuoteTotal([100], 'percent', 101)).toThrow(PricingError)
  })
  it('multiplicador multiplica o valor por unidade', () => {
    expect(calcQuoteTotal([300, 1260], 'valor', 60, 3)).toEqual({ subtotal: 1560, unitTotal: 1500, total: 4500 })
  })
  it('multiplicador 1 é o padrão', () => {
    expect(calcQuoteTotal([100]).total).toBe(calcQuoteTotal([100], 'valor', 0, 1).total)
  })
  it('rejeita multiplicador não inteiro ou menor que 1', () => {
    expect(() => calcQuoteTotal([100], 'valor', 0, 0)).toThrow(PricingError)
    expect(() => calcQuoteTotal([100], 'valor', 0, 1.5)).toThrow(PricingError)
  })
})
