import { describe, it, expect } from 'vitest'
import { valorPorExtenso, contractNumber, contractPdfTitle } from './text'

describe('valorPorExtenso', () => {
  it('zero', () => {
    expect(valorPorExtenso(0)).toBe('zero reais')
  })
  it('só centavos', () => {
    expect(valorPorExtenso(0.5)).toBe('cinquenta centavos')
    expect(valorPorExtenso(0.01)).toBe('um centavo')
  })
  it('unidades e singular', () => {
    expect(valorPorExtenso(1)).toBe('um real')
    expect(valorPorExtenso(2)).toBe('dois reais')
  })
  it('cem e centenas compostas', () => {
    expect(valorPorExtenso(100)).toBe('cem reais')
    expect(valorPorExtenso(123)).toBe('cento e vinte e três reais')
  })
  it('milhares', () => {
    expect(valorPorExtenso(1000)).toBe('mil reais')
    expect(valorPorExtenso(5000)).toBe('cinco mil reais')
    expect(valorPorExtenso(2500)).toBe('dois mil e quinhentos reais')
    expect(valorPorExtenso(1001)).toBe('mil e um reais')
    expect(valorPorExtenso(123456)).toBe('cento e vinte e três mil, quatrocentos e cinquenta e seis reais')
  })
  it('milhões', () => {
    expect(valorPorExtenso(1_000_000)).toBe('um milhão de reais')
    expect(valorPorExtenso(2_000_000)).toBe('dois milhões de reais')
    expect(valorPorExtenso(1_200_000)).toBe('um milhão, duzentos mil reais')
  })
  it('reais e centavos juntos', () => {
    expect(valorPorExtenso(5320.5)).toBe('cinco mil, trezentos e vinte reais e cinquenta centavos')
  })
})

describe('contractNumber', () => {
  it('usa 8 primeiros chars do uuid em maiúsculas e o ano', () => {
    expect(contractNumber('a1b2c3d4-0000-0000-0000-000000000000', '2026-07-19T12:00:00'))
      .toBe('A1B2C3D4/2026')
  })
})

describe('contractPdfTitle', () => {
  it('monta o título no formato data - Contrato - cliente', () => {
    expect(contractPdfTitle('Efigênia Batista', '2026-05-05T12:00:00'))
      .toBe('05-05-2026 - Contrato - Efigênia Batista')
  })
})
