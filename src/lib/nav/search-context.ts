export interface SearchContext {
  /** rota para onde o form de busca submete (GET) */
  action: string
  /** nome do parâmetro de query (ex: 'q') */
  paramName: string
  /** texto do placeholder do campo */
  placeholder: string
}

/**
 * Busca contextual do topo: decide o que a barra procura conforme a rota atual.
 * Retorna null nas telas sem lista pesquisável (a barra some).
 */
export function searchContextFor(pathname: string): SearchContext | null {
  if (pathname === '/') {
    return { action: '/', paramName: 'q', placeholder: 'Buscar cliente…' }
  }
  if (pathname === '/admin/produtos') {
    return { action: '/admin/produtos', paramName: 'q', placeholder: 'Buscar produto…' }
  }
  return null
}
