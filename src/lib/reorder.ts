export function buildSortUpdates(ids: string[]): { id: string; sort_order: number }[] {
  if (ids.some(id => !id)) throw new Error('id inválido')
  if (new Set(ids).size !== ids.length) throw new Error('ids duplicados')
  return ids.map((id, i) => ({ id, sort_order: i }))
}
