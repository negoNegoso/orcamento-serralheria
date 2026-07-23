import { describe, expect, it } from 'vitest'
import { buildSortUpdates } from './reorder'

describe('buildSortUpdates', () => {
  it('mapeia ids para sort_order sequencial', () => {
    expect(buildSortUpdates(['b', 'a', 'c'])).toEqual([
      { id: 'b', sort_order: 0 },
      { id: 'a', sort_order: 1 },
      { id: 'c', sort_order: 2 },
    ])
  })

  it('lista vazia vira lista vazia', () => {
    expect(buildSortUpdates([])).toEqual([])
  })

  it('rejeita ids duplicados', () => {
    expect(() => buildSortUpdates(['a', 'a'])).toThrow('ids duplicados')
  })

  it('rejeita id vazio', () => {
    expect(() => buildSortUpdates(['a', ''])).toThrow('id inválido')
  })
})
