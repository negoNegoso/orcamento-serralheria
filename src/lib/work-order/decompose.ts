import { round2 } from '@/lib/pricing/calc'
import type { SelectedOption } from '@/lib/pricing/types'

export interface PlannedLine {
  description: string
  itemLabel: string
  quoteItemId: string | null
  priceCategoryId: string | null
  plannedValue: number
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
}

const dim = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function itemLabel(
  input: Pick<DecomposeInput, 'productName' | 'widthM' | 'heightM'>,
): string {
  if (input.widthM == null || input.heightM == null) return input.productName
  return `${input.productName} ${dim.format(input.widthM)}×${dim.format(input.heightM)}`
}

/**
 * Quebra um item do orçamento nas linhas de custo planejado da OS.
 *
 * O surcharge do modelo não é gravado em quote_items (só model_id/model_name),
 * então entra como resíduo: line_total × multiplier menos o que já foi
 * distribuído. Além de dispensar join no catálogo (mutável), o resíduo absorve
 * qualquer sobra de arredondamento — a soma das linhas fecha com o item por
 * construção.
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

  function push(description: string, priceCategoryId: string | null, plannedValue: number): void {
    lines.push({
      description, itemLabel: label, quoteItemId: input.quoteItemId,
      priceCategoryId, plannedValue, sortOrder: sort++,
    })
  }

  push('Preço base', input.productCategoryId, round2(input.unitBasePrice * input.qty * multiplier))

  for (const opt of input.selectedOptions) {
    const unit = opt.surchargeType === 'por_m2'
      ? opt.surchargeValue * (input.areaM2 ?? 0)
      : opt.surchargeValue
    const category = opt.optionId ? (input.optionCategoryIds[opt.optionId] ?? null) : null
    push(`${opt.group} — ${opt.label}`, category, round2(unit * input.qty * multiplier))
  }

  if (input.extraValue !== 0) {
    push('Ajuste do item', null, round2(input.extraValue * multiplier))
  }

  const total = round2(input.lineTotal * multiplier)
  const distributed = round2(lines.reduce((acc, l) => acc + l.plannedValue, 0))
  const residual = round2(total - distributed)
  if (residual !== 0) {
    push(input.modelName ? `Modelo ${input.modelName}` : 'Ajuste de arredondamento', null, residual)
  }

  return lines
}
