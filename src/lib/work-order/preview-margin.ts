import { round2 } from '@/lib/pricing/calc'
import { decomposeItem, type DecomposeInput } from './decompose'

export interface MarginPreview {
  /** total do orçamento menos o custo esperado */
  predictedMargin: number
  /** soma do planejado (custo onde há cadastro, venda onde não há) */
  plannedTotal: number
  /** quantos preços entraram sem custo cadastrado */
  uncostedCount: number
}

/**
 * Margem prevista de um orçamento antes de aprovar, pela mesma decomposição que
 * a OS usará. Não grava nada. Linha sem custo cadastrado entra pela venda e não
 * contribui margem, então o número é conservador — daí o uncostedCount, que a
 * tela mostra junto para o número se ler como "pelo menos X".
 */
export function previewMargin(
  items: DecomposeInput[],
  quoteTotal: number,
  multiplier: number,
): MarginPreview {
  let plannedTotal = 0
  let uncostedCount = 0

  for (const item of items) {
    for (const line of decomposeItem(item, multiplier)) {
      plannedTotal = round2(plannedTotal + line.plannedValue)
      // linha estrutural (modelo, ajuste do item, arredondamento) não tem preço
      // cadastrável: não conta como pendência
      if (line.plannedKind === 'venda') {
        uncostedCount++
      }
    }
  }

  return { predictedMargin: round2(quoteTotal - plannedTotal), plannedTotal, uncostedCount }
}
