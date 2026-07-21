import { round2 } from './calc'
import { formatPercent } from '@/lib/format'

/**
 * Valor do item para exibição. Ajuste negativo é retirado (vira desconto no
 * rodapé), então o item aparece "bruto"; ajuste positivo continua embutido.
 */
export function itemDisplayGross(lineTotal: number, extraValue: number): number {
  return round2(lineTotal - Math.min(extraValue, 0))
}

export interface QuoteFooter {
  /** subtotal bruto (ajustes negativos somados de volta) */
  subtotal: number
  /** valor do desconto exibido na linha "Desconto" (R$) */
  discount: number
  /** ajuste negativo dos itens, em linha separada (só no modo percent; 0 caso contrário) */
  itemAdjustment: number
  /** rótulo da porcentagem, ex "10%"; null no modo valor */
  discountPercentLabel: string | null
  /** valor líquido de uma unidade (subtotalNet − desconto R$) */
  unitTotal: number
  /** número de unidades iguais */
  multiplier: number
  /** total final — unitTotal × multiplier */
  total: number
  /** se há alguma dedução a exibir */
  hasDeduction: boolean
}

/**
 * Consolida o rodapé. No modo "valor" o abatimento dos itens é somado ao
 * desconto numa linha só (comportamento histórico). No modo "percent" a
 * porcentagem incide sobre o subtotal líquido e o abatimento dos itens vai
 * numa linha própria ("Ajuste dos itens"), separada do "Desconto (10%)".
 * A função é pura e não lança: a validação do percentual vive em `discountAmount`.
 */
export function quoteDisplayFooter(
  subtotalNet: number,
  discountType: 'valor' | 'percent',
  discountValue: number,
  extraValues: number[],
  multiplier = 1,
): QuoteFooter {
  const negAdj = round2(-extraValues.reduce((a, v) => a + Math.min(v ?? 0, 0), 0))
  const discountRs = discountType === 'percent'
    ? round2(subtotalNet * discountValue / 100)
    : round2(discountValue)
  const unitTotal = round2(subtotalNet - discountRs)
  const total = round2(unitTotal * multiplier)
  const subtotal = round2(subtotalNet + negAdj)

  if (discountType === 'percent') {
    return {
      subtotal,
      discount: discountRs,
      itemAdjustment: negAdj,
      discountPercentLabel: formatPercent(discountValue),
      unitTotal,
      multiplier,
      total,
      hasDeduction: discountRs > 0 || negAdj > 0,
    }
  }

  const merged = round2(discountRs + negAdj)
  return {
    subtotal,
    discount: merged,
    itemAdjustment: 0,
    discountPercentLabel: null,
    unitTotal,
    multiplier,
    total,
    hasDeduction: merged > 0,
  }
}
