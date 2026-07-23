import { describe, expect, it } from 'vitest'
import type { PriceCategory } from '@/lib/config-types'
import { categoriaEfetiva, categoryName } from './price-category'

const CATEGORIES: PriceCategory[] = [
  { id: 'c1', slug: 'custo', name: 'Custo', sort_order: 0 },
  { id: 'c2', slug: 'insumo', name: 'Insumo', sort_order: 1 },
  { id: 'c3', slug: 'repasse', name: 'Repasse', sort_order: 2 },
]

describe('categoriaEfetiva', () => {
  it('categoria própria da opção vence a do grupo', () => {
    expect(categoriaEfetiva('c3', 'c2')).toBe('c3')
  })
  it('opção sem categoria herda a do grupo', () => {
    expect(categoriaEfetiva(null, 'c2')).toBe('c2')
  })
  it('opção e grupo sem categoria resulta em null', () => {
    expect(categoriaEfetiva(null, null)).toBeNull()
  })
})

describe('categoryName', () => {
  it('resolve o rótulo pelo id', () => {
    expect(categoryName(CATEGORIES, 'c1')).toBe('Custo')
  })
  it('id nulo não tem rótulo', () => {
    expect(categoryName(CATEGORIES, null)).toBeNull()
  })
  it('id desconhecido não tem rótulo', () => {
    expect(categoryName(CATEGORIES, 'inexistente')).toBeNull()
  })
})
