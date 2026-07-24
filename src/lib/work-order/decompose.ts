import { round2 } from '@/lib/pricing/calc'
import type { PricingMode, SelectedOption } from '@/lib/pricing/types'
import type { CostComponent, PlannedKind } from './types'

export interface PlannedLine {
  description: string
  itemLabel: string
  quoteItemId: string | null
  priceCategoryId: string | null
  plannedValue: number
  plannedKind: PlannedKind
  sortOrder: number
}

export interface DecomposeInput {
  quoteItemId: string | null
  productName: string
  widthM: number | null
  heightM: number | null
  areaM2: number | null
  qty: number
  /** quote_items.unit_base_price — só a base, sem modelo e sem opções */
  unitBasePrice: number
  /** quote_items.line_total — já inclui modelo, opções, qty e extra_value */
  lineTotal: number
  extraValue: number
  modelName: string | null
  selectedOptions: SelectedOption[]
  productCategoryId: string | null
  /** categoria efetiva (opção ?? grupo) já resolvida, indexada por optionId */
  optionCategoryIds: Record<string, string | null>
  /** modo de preço do produto: define se o custo da base é R$ ou R$/m² */
  pricingMode: PricingMode
  /** custo esperado do preço base; vazio = sem custo cadastrado */
  baseCosts: CostComponent[]
  /** custo esperado por opção, indexado por optionId */
  optionCosts: Record<string, CostComponent[]>
  /** nome de cada categoria, para compor a descrição da linha */
  categoryNames: Record<string, string>
}

const dim = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function itemLabel(
  input: Pick<DecomposeInput, 'productName' | 'widthM' | 'heightM'>,
): string {
  if (input.widthM == null || input.heightM == null) return input.productName
  return `${input.productName} ${dim.format(input.widthM)}×${dim.format(input.heightM)}`
}

/**
 * Quebra um item do orçamento nas linhas planejadas da OS.
 *
 * Preço com custo esperado cadastrado vira uma linha por componente
 * (`plannedKind='custo'`): o planejado é o custo, então a margem já nasce
 * prevista. Preço sem custo cai no comportamento antigo — planejado é a venda,
 * `plannedKind='venda'`, contribuição de margem zero.
 *
 * O resíduo do modelo é medido contra a soma da VENDA distribuída, acumulada
 * em separado: linhas de custo não carregam o valor de venda, e a venda de um
 * preço conta uma vez só, mesmo que ele gere vários componentes.
 *
 * Repetido em SQL dentro de work_order_clone_costs.
 */
export function decomposeItem(
  input: DecomposeInput,
  multiplier: number,
  startSort = 0,
): PlannedLine[] {
  const label = itemLabel(input)
  const lines: PlannedLine[] = []
  let sort = startSort
  // soma da venda distribuída — base do resíduo, independente do planejado
  let vendaSum = 0

  function push(
    description: string,
    priceCategoryId: string | null,
    plannedValue: number,
    plannedKind: PlannedKind,
  ): void {
    lines.push({
      description, itemLabel: label, quoteItemId: input.quoteItemId,
      priceCategoryId, plannedValue, plannedKind, sortOrder: sort++,
    })
  }

  function categoryLabel(id: string): string {
    return input.categoryNames[id] ?? 'Sem categoria'
  }

  /**
   * Emite as linhas de um preço: uma por componente de custo, ou uma de venda
   * quando não há custo cadastrado. `unitCostFactor` converte o valor cadastrado
   * na unidade da linha (área quando o preço é por m², 1 quando é fixo).
   */
  function pushPrice(
    baseDescription: string,
    vendaValue: number,
    vendaCategoryId: string | null,
    costs: CostComponent[],
    unitCostFactor: number,
  ): void {
    vendaSum = round2(vendaSum + vendaValue)
    if (costs.length === 0) {
      push(baseDescription, vendaCategoryId, vendaValue, 'venda')
      return
    }
    for (const c of costs) {
      push(
        `${baseDescription} — ${categoryLabel(c.priceCategoryId)}`,
        c.priceCategoryId,
        round2(c.value * unitCostFactor * input.qty * multiplier),
        'custo',
      )
    }
  }

  const porM2 = input.pricingMode === 'm2' || input.pricingMode === 'm2_direto'
  pushPrice(
    'Preço base',
    round2(input.unitBasePrice * input.qty * multiplier),
    input.productCategoryId,
    input.baseCosts,
    porM2 ? (input.areaM2 ?? 0) : 1,
  )

  for (const opt of input.selectedOptions) {
    const unit = opt.surchargeType === 'por_m2'
      ? opt.surchargeValue * (input.areaM2 ?? 0)
      : opt.surchargeValue
    const category = opt.optionId ? (input.optionCategoryIds[opt.optionId] ?? null) : null
    const costs = opt.optionId ? (input.optionCosts[opt.optionId] ?? []) : []
    pushPrice(
      `${opt.group} — ${opt.label}`,
      round2(unit * input.qty * multiplier),
      category,
      costs,
      opt.surchargeType === 'por_m2' ? (input.areaM2 ?? 0) : 1,
    )
  }

  if (input.extraValue !== 0) {
    const extra = round2(input.extraValue * multiplier)
    vendaSum = round2(vendaSum + extra)
    push('Ajuste do item', null, extra, 'venda')
  }

  // resíduo: surcharge do modelo (não persistido) + sobra de arredondamento
  const total = round2(input.lineTotal * multiplier)
  const residual = round2(total - vendaSum)
  if (residual !== 0) {
    push(
      input.modelName ? `Modelo ${input.modelName}` : 'Ajuste de arredondamento',
      null, residual, 'venda',
    )
  }

  return lines
}
