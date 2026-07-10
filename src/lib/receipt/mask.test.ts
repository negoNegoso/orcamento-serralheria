import { describe, it, expect } from 'vitest'
import { maskCpfCnpj } from './mask'

describe('maskCpfCnpj', () => {
  it('formata CPF parcial e completo', () => {
    expect(maskCpfCnpj('278')).toBe('278')
    expect(maskCpfCnpj('278379')).toBe('278.379')
    expect(maskCpfCnpj('27837967836')).toBe('278.379.678-36')
  })

  it('formata CNPJ quando passa de 11 dígitos', () => {
    expect(maskCpfCnpj('61004063000100')).toBe('61.004.063/0001-00')
  })

  it('ignora caracteres não numéricos e limita a 14 dígitos', () => {
    expect(maskCpfCnpj('278.379.678-36')).toBe('278.379.678-36')
    expect(maskCpfCnpj('610040630001000000')).toBe('61.004.063/0001-00')
  })

  it('retorna vazio para entrada vazia', () => {
    expect(maskCpfCnpj('')).toBe('')
  })
})
