import { describe, expect, it } from 'vitest'
import { searchContextFor } from './search-context'

describe('searchContextFor', () => {
  it('lista de orçamentos busca cliente', () => {
    expect(searchContextFor('/')).toEqual({
      action: '/', paramName: 'q', placeholder: 'Buscar cliente…',
    })
  })
  it('lista de produtos busca produto', () => {
    expect(searchContextFor('/admin/produtos')).toEqual({
      action: '/admin/produtos', paramName: 'q', placeholder: 'Buscar produto…',
    })
  })
  it('detalhe do produto não tem busca (edição de um item)', () => {
    expect(searchContextFor('/admin/produtos/abc-123')).toBeNull()
  })
  it('telas sem lista pesquisável retornam null', () => {
    expect(searchContextFor('/admin/pagamento')).toBeNull()
    expect(searchContextFor('/admin/empresa')).toBeNull()
    expect(searchContextFor('/admin/usuarios')).toBeNull()
    expect(searchContextFor('/admin/dashboard')).toBeNull()
    expect(searchContextFor('/orcamentos/xyz')).toBeNull()
    expect(searchContextFor('/orcamentos/novo')).toBeNull()
  })
})
