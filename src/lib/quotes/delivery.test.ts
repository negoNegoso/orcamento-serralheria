import { describe, expect, it } from 'vitest'
import { isValidDeliveryDate } from './delivery'

describe('isValidDeliveryDate', () => {
  it('aceita data ISO YYYY-MM-DD', () => {
    expect(isValidDeliveryDate('2026-07-10')).toBe(true)
  })
  it('rejeita string vazia', () => {
    expect(isValidDeliveryDate('')).toBe(false)
    expect(isValidDeliveryDate('   ')).toBe(false)
  })
  it('rejeita formato inválido', () => {
    expect(isValidDeliveryDate('10/07/2026')).toBe(false)
    expect(isValidDeliveryDate('2026-13-40')).toBe(false)
    expect(isValidDeliveryDate('abc')).toBe(false)
  })
})
