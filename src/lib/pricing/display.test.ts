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

describe('quoteDisplayFooter', () => {
  it('soma ajustes negativos ao desconto e mantém total', () => {
    // Item A bruto 1000 (ajuste −100), Item B 500; subtotalNet = 900 + 500 = 1400; desconto 50
    const f = quoteDisplayFooter(1400, 50, [-100, 0])
    expect(f.subtotal).toBe(1500) // bruto
    expect(f.discount).toBe(150) // 50 + 100
    expect(f.total).toBe(1350) // 1400 − 50 (inalterado)
    expect(f.hasDeduction).toBe(true)
  })
  it('sem desconto e sem ajuste negativo: sem dedução', () => {
    const f = quoteDisplayFooter(1000, 0, [0, 50])
    expect(f.subtotal).toBe(1000)
    expect(f.discount).toBe(0)
    expect(f.total).toBe(1000)
    expect(f.hasDeduction).toBe(false)
  })
  it('só ajuste negativo (desconto 0) já mostra dedução', () => {
    const f = quoteDisplayFooter(900, 0, [-100])
    expect(f.subtotal).toBe(1000)
    expect(f.discount).toBe(100)
    expect(f.total).toBe(900)
    expect(f.hasDeduction).toBe(true)
  })
  it('ajuste positivo não vira desconto', () => {
    const f = quoteDisplayFooter(1100, 0, [100])
    expect(f.subtotal).toBe(1100)
    expect(f.discount).toBe(0)
    expect(f.total).toBe(1100)
    expect(f.hasDeduction).toBe(false)
  })
  it('vários ajustes negativos são somados', () => {
    const f = quoteDisplayFooter(770, 30, [-100, -50, 20])
    expect(f.subtotal).toBe(920) // 770 + 150
    expect(f.discount).toBe(180) // 30 + 150
    expect(f.total).toBe(740) // 770 − 30
    expect(f.hasDeduction).toBe(true)
  })
  it('multiplicador > 1: unitTotal por casa e total multiplicado', () => {
    const f = quoteDisplayFooter(1400, 50, [-100, 0], 3)
    expect(f.unitTotal).toBe(1350) // 1400 − 50
    expect(f.multiplier).toBe(3)
    expect(f.total).toBe(4050) // 1350 × 3
    expect(f.subtotal).toBe(1500) // bruto, inalterado
    expect(f.discount).toBe(150)
  })
  it('multiplicador padrão 1: total igual ao unitTotal', () => {
    const f = quoteDisplayFooter(1000, 0, [0])
    expect(f.unitTotal).toBe(1000)
    expect(f.multiplier).toBe(1)
    expect(f.total).toBe(1000)
  })
})
