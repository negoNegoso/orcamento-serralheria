import type { PriceCategory, ProductConfig } from '@/lib/config-types'
import { categoriaEfetiva } from '@/lib/pricing/price-category'
import type { DecomposeInput } from './decompose'
import type { CostComponent, PriceCost } from './types'

/** Linha de quote_items usada na prévia (só os campos que a decomposição lê). */
export interface QuoteItemRow {
  id: string
  product_type_id: string | null
  product_name: string
  model_name: string | null
  width_m: number | null
  height_m: number | null
  area_m2: number | null
  qty: number
  unit_base_price: number
  line_total: number
  extra_value: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selected_options: any[]
}

function componentsOf(costs: PriceCost[]): CostComponent[] {
  return costs.map(c => ({ priceCategoryId: c.price_category_id, value: c.value }))
}

/**
 * Ordena os componentes de custo pelo sort_order da categoria — paridade com o
 * clone SQL (work_order_clone_costs), que ordena `order by cat.sort_order`
 * antes de inserir as linhas. decomposeItem confia na ordem do array recebido,
 * então sem isso a prévia poderia listar os componentes em ordem diferente da
 * OS que nasce ao aprovar. Categoria sem sort_order conhecido vai pro fim,
 * espelhando o NULLS LAST do Postgres.
 */
function sortByCategoryRank(
  costs: CostComponent[],
  rankByCategory: Map<string, number>,
): CostComponent[] {
  return [...costs].sort((a, b) => {
    const ra = rankByCategory.get(a.priceCategoryId) ?? Infinity
    const rb = rankByCategory.get(b.priceCategoryId) ?? Infinity
    return ra - rb
  })
}

/**
 * Traduz o orçamento salvo para as entradas da decomposição, resolvendo
 * categoria efetiva das opções e anexando o custo esperado do catálogo.
 */
export function buildPreviewInputs(
  items: QuoteItemRow[],
  products: ProductConfig[],
  priceCosts: PriceCost[],
  categories: PriceCategory[],
): DecomposeInput[] {
  const categoryNames = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const rankByCategory = new Map(categories.map(c => [c.id, c.sort_order]))
  const productById = new Map(products.map(p => [p.id, p]))

  return items.map(it => {
    const product = it.product_type_id ? productById.get(it.product_type_id) : undefined
    const optionCategoryIds: Record<string, string | null> = {}
    const optionCosts: Record<string, CostComponent[]> = {}

    for (const group of product?.option_groups ?? []) {
      for (const opt of group.options ?? []) {
        optionCategoryIds[opt.id] = categoriaEfetiva(opt.price_category_id, group.price_category_id)
        const costs = priceCosts.filter(c => c.option_id === opt.id)
        if (costs.length > 0) optionCosts[opt.id] = sortByCategoryRank(componentsOf(costs), rankByCategory)
      }
    }

    return {
      quoteItemId: it.id,
      productName: it.product_name,
      widthM: it.width_m, heightM: it.height_m, areaM2: it.area_m2,
      qty: it.qty,
      unitBasePrice: Number(it.unit_base_price),
      lineTotal: Number(it.line_total),
      extraValue: Number(it.extra_value ?? 0),
      modelName: it.model_name,
      selectedOptions: it.selected_options ?? [],
      productCategoryId: product?.price_category_id ?? null,
      optionCategoryIds,
      pricingMode: product?.pricing_mode ?? 'fixo',
      baseCosts: it.product_type_id
        ? sortByCategoryRank(
            componentsOf(priceCosts.filter(c => c.product_type_id === it.product_type_id)),
            rankByCategory,
          )
        : [],
      optionCosts,
      categoryNames,
    }
  })
}
