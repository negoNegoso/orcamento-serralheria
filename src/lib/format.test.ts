import { describe, expect, it } from 'vitest'
import { formatBRL, formatPercent, parseDecimal, quotePdfTitle } from './format'

describe('formatBRL', () => {
  it('formata em pt-BR', () => {
    expect(formatBRL(1234.56).replace(/ /g, ' ')).toBe('R$ 1.234,56')
    expect(formatBRL(0).replace(/ /g, ' ')).toBe('R$ 0,00')
  })
})

describe('parseDecimal', () => {
  it('aceita vírgula e ponto', () => {
    expect(parseDecimal('1,5')).toBe(1.5)
    expect(parseDecimal('2.75')).toBe(2.75)
    expect(parseDecimal('')).toBe(0)
  })
  it('trata ponto de milhar do pt-BR', () => {
    expect(parseDecimal('3.200,00')).toBe(3200)
    expect(parseDecimal('1.234.567,89')).toBe(1234567.89)
  })
  it('ponto agrupando 3 dígitos sem vírgula é milhar', () => {
    expect(parseDecimal('3.200')).toBe(3200)
    expect(parseDecimal('1.234')).toBe(1234)
    expect(parseDecimal('12.345')).toBe(12345)
    expect(parseDecimal('1.234.567')).toBe(1234567)
  })
  it('ponto com 1-2 dígitos finais sem vírgula segue decimal', () => {
    expect(parseDecimal('2.75')).toBe(2.75)
    expect(parseDecimal('1.5')).toBe(1.5)
    expect(parseDecimal('0.99')).toBe(0.99)
  })
  it('aceita valores negativos (ajuste de item)', () => {
    expect(parseDecimal('-100')).toBe(-100)
    expect(parseDecimal('-100,50')).toBe(-100.5)
    expect(parseDecimal('-1.200')).toBe(-1200)
    expect(parseDecimal('-1.200,50')).toBe(-1200.5)
  })
})

describe('quotePdfTitle', () => {
  it('prefixa a data de geração no formato DD-MM-YYYY', () => {
    // meio-dia local evita virada de dia por fuso
    const createdAt = new Date(2026, 6, 7, 12, 0, 0)
    expect(quotePdfTitle('João Silva', createdAt)).toBe('07-07-2026 - Orçamento - João Silva')
  })
  it('aceita string ISO', () => {
    const createdAt = new Date(2026, 0, 3, 12, 0, 0).toISOString()
    expect(quotePdfTitle('Maria', createdAt)).toBe('03-01-2026 - Orçamento - Maria')
  })
})

describe('formatPercent', () => {
  it('inteiro sem casas decimais', () => {
    expect(formatPercent(10)).toBe('10%')
  })
  it('decimal com vírgula pt-BR', () => {
    expect(formatPercent(12.5)).toBe('12,5%')
  })
  it('zero', () => {
    expect(formatPercent(0)).toBe('0%')
  })
})
