import { describe, expect, it } from 'vitest'
import { parseCategoryId } from './price-category-input'

describe('parseCategoryId', () => {
  it('uuid vira o próprio id', () => {
    expect(parseCategoryId('3f0c7c1e-0000-4000-8000-000000000001')).toBe(
      '3f0c7c1e-0000-4000-8000-000000000001'
    )
  })
  it('string vazia vira null', () => {
    expect(parseCategoryId('')).toBeNull()
  })
  it('campo ausente vira null', () => {
    expect(parseCategoryId(null)).toBeNull()
  })
  it('só espaços vira null', () => {
    expect(parseCategoryId('   ')).toBeNull()
  })
})
