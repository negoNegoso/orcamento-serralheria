import { describe, expect, it } from 'vitest'
import { buildQuoteMessage } from './whatsapp-message'

const baseQuote = { customer_name: 'Maria', subtotal: 1000, discount: 0, discount_type: 'valor' as const }

describe('buildQuoteMessage', () => {
  it('saudação e total formatados corretamente', () => {
    const msg = buildQuoteMessage(baseQuote, [
      { product_name: 'Janela', line_total: 1000 },
    ])
    expect(msg).toMatch(/^Olá, Maria! Segue seu orçamento:/)
    expect(msg).toMatch(/\*Total: R\$\s*1\.000,00\*$/)
  })

  it('item sem model e sem medidas: apenas qty un — valor', () => {
    const msg = buildQuoteMessage(baseQuote, [
      { product_name: 'Porta', line_total: 500 },
    ])
    expect(msg).toContain('1. *Porta*')
    expect(msg).toContain('   1 un — R$\u00a0500,00')
  })

  it('item com model: nome — model em negrito', () => {
    const msg = buildQuoteMessage(baseQuote, [
      { product_name: 'Janela', model_name: 'Suprema', line_total: 1000 },
    ])
    expect(msg).toContain('1. *Janela — Suprema*')
  })

  it('item com medidas e qty: L × A m · qty un — valor', () => {
    const msg = buildQuoteMessage(baseQuote, [
      { product_name: 'Janela', width_m: 1.2, height_m: 1.0, qty: 2, line_total: 1500 },
    ])
    expect(msg).toContain('   1,2 × 1 m · 2 un — R$\u00a01.500,00')
  })

  it('item sem medidas mas com qty', () => {
    const msg = buildQuoteMessage(baseQuote, [
      { product_name: 'Grade', qty: 3, line_total: 600 },
    ])
    expect(msg).toContain('   3 un — R$\u00a0600,00')
  })

  it('itens são numerados sequencialmente', () => {
    const msg = buildQuoteMessage(baseQuote, [
      { product_name: 'Item A', line_total: 100 },
      { product_name: 'Item B', line_total: 200 },
      { product_name: 'Item C', line_total: 300 },
    ])
    expect(msg).toContain('1. *Item A*')
    expect(msg).toContain('2. *Item B*')
    expect(msg).toContain('3. *Item C*')
  })

  it('linha em branco entre itens e antes do total', () => {
    const msg = buildQuoteMessage(baseQuote, [
      { product_name: 'A', line_total: 100 },
      { product_name: 'B', line_total: 200 },
    ])
    // blank line between items
    expect(msg).toMatch(/un — R\$[\s\S]*\n\n2\./)
    // blank line before total
    expect(msg).toMatch(/un — R\$[\s\S]*\n\n\*Total/)
  })

  it('ajuste negativo: mostra valor bruto (line_total 900 + extra -100 → R$ 1.000,00)', () => {
    const msg = buildQuoteMessage(
      { customer_name: 'João', subtotal: 900, discount: 0, discount_type: 'valor' as const },
      [{ product_name: 'Janela', line_total: 900, extra_value: -100 }],
    )
    expect(msg).toContain('R$\u00a01.000,00')
    // total é o líquido (subtotalNet=900, sem desconto)
    expect(msg).toContain('*Total: R$\u00a0900,00*')
  })

  it('ajuste positivo: valor permanece o mesmo', () => {
    const msg = buildQuoteMessage(
      { customer_name: 'João', subtotal: 1100, discount: 0, discount_type: 'valor' as const },
      [{ product_name: 'Janela', line_total: 1100, extra_value: 100 }],
    )
    expect(msg).toContain('R$\u00a01.100,00')
  })

  it('multiplier > 1: linha "N casas × valor" antes do total', () => {
    const msg = buildQuoteMessage(
      { customer_name: 'Carlos', subtotal: 1350, discount: 0, discount_type: 'valor' as const, multiplier: 3 },
      [{ product_name: 'Janela', line_total: 1350 }],
    )
    expect(msg).toContain('3 casas × R$\u00a01.350,00')
    expect(msg).toContain('*Total: R$\u00a04.050,00*')
    expect(msg).toMatch(/casas × R\$\u00a01\.350,00\n\*Total:/)
  })

  it('multiplier = 1 (padrão): sem linha "casas"', () => {
    const msg = buildQuoteMessage(
      { customer_name: 'Ana', subtotal: 500, discount: 0, discount_type: 'valor' as const, multiplier: 1 },
      [{ product_name: 'Porta', line_total: 500 }],
    )
    expect(msg).not.toContain('casas')
  })

  it('desconto reduz o total', () => {
    const msg = buildQuoteMessage(
      { customer_name: 'Pedro', subtotal: 1000, discount: 100, discount_type: 'valor' as const },
      [{ product_name: 'Grade', line_total: 1000 }],
    )
    expect(msg).toContain('*Total: R$\u00a0900,00*')
  })

  it('desconto percentual: 10% reduz total de 1000 para 900', () => {
    const msg = buildQuoteMessage(
      { customer_name: 'Ana', subtotal: 1000, discount: 10, discount_type: 'percent' as const },
      [{ product_name: 'Janela', line_total: 1000 }],
    )
    expect(msg).toContain('*Total: R$\u00a0900,00*')
  })

  it('width_m sem height_m: sem medidas exibidas', () => {
    const msg = buildQuoteMessage(baseQuote, [
      { product_name: 'Peça', width_m: 1.5, line_total: 200 },
    ])
    expect(msg).not.toContain('×')
    expect(msg).toContain('1 un — ')
  })

  it('model_name null: sem separador de model no nome do item', () => {
    const msg = buildQuoteMessage(baseQuote, [
      { product_name: 'Porta', model_name: null, line_total: 300 },
    ])
    expect(msg).toContain('1. *Porta*')
    // the name line must not include a model separator
    const nameLine = msg.split('\n').find(l => l.startsWith('1.'))
    expect(nameLine).toBe('1. *Porta*')
  })
})
