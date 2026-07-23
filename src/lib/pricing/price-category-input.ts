// Select vazio ("— sem categoria —" / "— herdar do grupo —") chega como string
// vazia no FormData e precisa virar null, não ''. A existência do id é
// garantida pela FK de price_categories no banco.
export function parseCategoryId(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  return value === '' ? null : value
}
