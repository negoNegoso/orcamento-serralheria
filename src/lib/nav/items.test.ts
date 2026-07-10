import { describe, it, expect } from 'vitest'
import { navFor } from './items'

describe('navFor', () => {
  it('vendedor só vê itens não-admin', () => {
    const items = navFor('vendedor')
    expect(items.every((i) => !i.adminOnly)).toBe(true)
    expect(items.map((i) => i.href)).toContain('/')
    expect(items.map((i) => i.href)).not.toContain('/admin/dashboard')
  })

  it('admin vê todos os itens', () => {
    const items = navFor('admin')
    expect(items.map((i) => i.href)).toContain('/admin/dashboard')
    expect(items.map((i) => i.href)).toContain('/admin/usuarios')
    expect(items.map((i) => i.href)).toContain('/')
  })
})
