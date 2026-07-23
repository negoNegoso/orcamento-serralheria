import type { PriceCategory } from '@/lib/config-types'

// A opção usa a própria categoria; sem ela, herda a do grupo. Resolvido na
// leitura — nada é copiado para a linha da opção, então trocar a categoria do
// grupo reflete em todas as opções que não definiram a sua.
export function categoriaEfetiva(
  optionCategoryId: string | null,
  groupCategoryId: string | null
): string | null {
  return optionCategoryId ?? groupCategoryId ?? null
}

export function categoryName(
  categories: PriceCategory[],
  id: string | null
): string | null {
  if (!id) return null
  return categories.find(c => c.id === id)?.name ?? null
}
