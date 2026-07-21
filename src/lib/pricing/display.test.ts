import { describe, expect, it } from 'vitest'
import { itemDisplayGross, quoteDisplayFooter } from './display'

describe('itemDisplayGross', () => {
  it('ajuste negativo é retirado — mostra valor bruto', () => {
    // line_total 900 já embute ajuste −100 → bruto 1000
    expect(itemDisplayGross(900, -100)).toBe(1000)
  })
  it('ajuste positivo continua embutido no valor exibido', () => {
    expect(itemDisplayGross(700, 100)).toBe(700)
  })
  it('sem ajuste: valor inalterado', () => {
    expect(itemDisplayGross(500, 0)).toBe(500)
  })
  it('arredonda em fronteiras de dinheiro', () => {
    expect(itemDisplayGross(250.25, -49.99)).toBe(300.24)
  })
})

describe('quoteDisplayFooter — desconto em valor', () => {
  it('soma ajustes negativos ao desconto e mantém total', () => {
    const f = quoteDisplayFooter(1400, 'valor', 50, [-100, 0])
    expect(f.subtotal).toBe(1500)
    expect(f.discount).toBe(150) // 50 + 100 (fundido)
    expect(f.itemAdjustment).toBe(0)
    expect(f.discountPercentLabel).toBeNull()
    expect(f.total).toBe(1350)
    expect(f.hasDeduction).toBe(true)
  })
  it('sem desconto e sem ajuste negativo: sem dedução', () => {
    const f = quoteDisplayFooter(1000, 'valor', 0, [0, 50])
    expect(f.discount).toBe(0)
    expect(f.hasDeduction).toBe(false)
  })
  it('só ajuste negativo já mostra dedução', () => {
    const f = quoteDisplayFooter(900, 'valor', 0, [-100])
    expect(f.subtotal).toBe(1000)
    expect(f.discount).toBe(100)
    expect(f.hasDeduction).toBe(true)
  })
  it('multiplicador > 1: unitTotal por casa e total multiplicado', () => {
    const f = quoteDisplayFooter(1400, 'valor', 50, [-100, 0], 3)
    expect(f.unitTotal).toBe(1350)
    expect(f.total).toBe(4050)
    expect(f.discount).toBe(150)
  })
})

describe('quoteDisplayFooter — desconto percentual', () => {
  it('sem ajuste: uma linha de desconto com rótulo de %', () => {
    const f = quoteDisplayFooter(1000, 'percent', 10, [0])
    expect(f.discount).toBe(100) // 10% de 1000
    expect(f.itemAdjustment).toBe(0)
    expect(f.discountPercentLabel).toBe('10%')
    expect(f.subtotal).toBe(1000)
    expect(f.unitTotal).toBe(900)
    expect(f.total).toBe(900)
    expect(f.hasDeduction).toBe(true)
  })
  it('com ajuste negativo: linhas separadas (ajuste e desconto %)', () => {
    // subtotalNet 900 (item bruto 1000, ajuste −100); 10% de 900 = 90
    const f = quoteDisplayFooter(900, 'percent', 10, [-100])
    expect(f.subtotal).toBe(1000) // bruto
    expect(f.itemAdjustment).toBe(100) // linha separada
    expect(f.discount).toBe(90) // 10% do líquido
    expect(f.discountPercentLabel).toBe('10%')
    expect(f.unitTotal).toBe(810) // 900 − 90
    expect(f.total).toBe(810)
    expect(f.hasDeduction).toBe(true)
  })
  it('0%: sem dedução mesmo sem ajuste', () => {
    const f = quoteDisplayFooter(1000, 'percent', 0, [0])
    expect(f.discount).toBe(0)
    expect(f.itemAdjustment).toBe(0)
    expect(f.hasDeduction).toBe(false)
  })
})
