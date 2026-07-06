import { describe, expect, it } from 'vitest'
import { formatBRL, parseDecimal } from './format'

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
})
