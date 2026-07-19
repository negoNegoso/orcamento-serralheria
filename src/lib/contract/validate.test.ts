import { describe, it, expect } from 'vitest'
import { isValidCpfCnpj, isValidEmail } from './validate'

describe('isValidCpfCnpj', () => {
  it('aceita CPF válido, mascarado ou não', () => {
    expect(isValidCpfCnpj('529.982.247-25')).toBe(true)
    expect(isValidCpfCnpj('52998224725')).toBe(true)
  })
  it('rejeita CPF com dígito verificador errado', () => {
    expect(isValidCpfCnpj('529.982.247-26')).toBe(false)
  })
  it('rejeita CPF de dígitos repetidos', () => {
    expect(isValidCpfCnpj('111.111.111-11')).toBe(false)
  })
  it('aceita CNPJ válido', () => {
    expect(isValidCpfCnpj('11.222.333/0001-81')).toBe(true)
  })
  it('rejeita CNPJ com dígito verificador errado', () => {
    expect(isValidCpfCnpj('11.222.333/0001-80')).toBe(false)
  })
  it('rejeita tamanhos intermediários e vazio', () => {
    expect(isValidCpfCnpj('')).toBe(false)
    expect(isValidCpfCnpj('123456')).toBe(false)
    expect(isValidCpfCnpj('529982247251')).toBe(false) // 12 dígitos
  })
})

describe('isValidEmail', () => {
  it('aceita formato básico', () => {
    expect(isValidEmail('a@b.com')).toBe(true)
  })
  it('rejeita sem arroba ou sem domínio', () => {
    expect(isValidEmail('ab.com')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
    expect(isValidEmail('a b@c.com')).toBe(false)
  })
})
