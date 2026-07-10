import { describe, expect, it } from 'vitest'
import { canReassignOwner } from './ownership'

describe('canReassignOwner', () => {
  it('admin pode sempre, mesmo não sendo dono', () => {
    expect(canReassignOwner({ role: 'admin', userId: 'a', quoteOwnerId: 'b' })).toBe(true)
    expect(canReassignOwner({ role: 'admin', userId: 'a', quoteOwnerId: null })).toBe(true)
  })
  it('dono (vendedor) pode trocar o próprio orçamento', () => {
    expect(canReassignOwner({ role: 'vendedor', userId: 'a', quoteOwnerId: 'a' })).toBe(true)
  })
  it('vendedor não-dono não pode', () => {
    expect(canReassignOwner({ role: 'vendedor', userId: 'a', quoteOwnerId: 'b' })).toBe(false)
    expect(canReassignOwner({ role: 'vendedor', userId: 'a', quoteOwnerId: null })).toBe(false)
  })
})
