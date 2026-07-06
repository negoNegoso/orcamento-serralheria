import { round2 } from './calc'

/**
 * Valor do item para exibição. Ajuste negativo é retirado (vira desconto no
 * rodapé), então o item aparece "bruto"; ajuste positivo continua embutido.
 */
export function itemDisplayGross(lineTotal: number, extraValue: number): number {
  return round2(lineTotal - Math.min(extraValue, 0))
}

export interface QuoteFooter {
  /** subtotal com valores brutos (ajustes negativos somados de volta) */
  subtotal: number
  /** desconto do orçamento + soma dos ajustes negativos dos itens */
  discount: number
  /** total final — idêntico ao subtotal líquido menos desconto */
  total: number
  /** se há alguma dedução a exibir (desconto e/ou ajuste negativo) */
  hasDeduction: boolean
}

/**
 * Consolida o rodapé quando ajustes negativos devem seguir a regra do desconto:
 * o abatimento dos itens é somado ao desconto numa única linha. O total não muda.
 */
export function quoteDisplayFooter(
  subtotalNet: number,
  discount: number,
  extraValues: number[],
): QuoteFooter {
  const negAdj = round2(-extraValues.reduce((a, v) => a + Math.min(v ?? 0, 0), 0))
  const discountShown = round2(discount + negAdj)
  return {
    subtotal: round2(subtotalNet + negAdj),
    discount: discountShown,
    total: round2(subtotalNet - discount),
    hasDeduction: discountShown > 0,
  }
}
