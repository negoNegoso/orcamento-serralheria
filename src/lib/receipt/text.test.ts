import { describe, it, expect } from 'vitest'
import { receiptDeclaration, receiptPdfTitle } from './text'

describe('receiptDeclaration', () => {
  it('inclui o valor formatado em BRL e o nome do cliente', () => {
    const text = receiptDeclaration('Efigênia Batista', 4000)
    expect(text).toContain('R$\u00a04.000,00')
    expect(text).toContain('Efigênia Batista')
    expect(text.toLowerCase()).toContain('recebi')
  })
})

describe('receiptPdfTitle', () => {
  it('monta o título no formato data - Recibo - cliente', () => {
    expect(receiptPdfTitle('Efigênia Batista', '2026-05-05T12:00:00'))
      .toBe('05-05-2026 - Recibo - Efigênia Batista')
  })
})
