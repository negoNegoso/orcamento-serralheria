import type { ItemInput, ItemTotals } from './types'

export class PricingError extends Error {}

export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

export function calcItem(input: ItemInput): ItemTotals {
  if (!Number.isInteger(input.qty) || input.qty < 1) {
    throw new PricingError('Quantidade deve ser um número inteiro maior ou igual a 1')
  }
  let areaM2: number | null = null
  let base: number
  if (input.pricingMode === 'm2') {
    if (!input.widthM || input.widthM <= 0 || !input.heightM || input.heightM <= 0) {
      throw new PricingError('Informe largura e altura maiores que zero')
    }
    if (input.pricePerM2 == null || input.pricePerM2 < 0) {
      throw new PricingError('Produto sem preço por m² configurado')
    }
    areaM2 = round2(input.widthM * input.heightM)
    base = areaM2 * input.pricePerM2
  } else if (input.pricingMode === 'manual') {
    if (input.manualPrice == null || input.manualPrice < 0) {
      throw new PricingError('Informe o valor do item (produto orçado pela responsável)')
    }
    // medidas opcionais, só registro — não alteram o valor
    if (input.widthM && input.widthM > 0 && input.heightM && input.heightM > 0) {
      areaM2 = round2(input.widthM * input.heightM)
    }
    base = input.manualPrice
  } else {
    if (input.basePrice == null || input.basePrice < 0) {
      throw new PricingError('Produto sem preço fixo configurado')
    }
    base = input.basePrice
  }
  let unit = base + (input.modelSurcharge ?? 0)
  for (const opt of input.options) {
    unit += opt.surchargeType === 'por_m2' ? opt.surchargeValue * (areaM2 ?? 0) : opt.surchargeValue
  }
  const unitTotal = round2(unit)
  return {
    areaM2,
    unitBasePrice: round2(base),
    unitTotal,
    lineTotal: round2(unitTotal * input.qty),
  }
}

export function calcQuoteTotal(lineTotals: number[], discount = 0): { subtotal: number; total: number } {
  const subtotal = round2(lineTotals.reduce((a, b) => a + b, 0))
  if (discount < 0) throw new PricingError('Desconto não pode ser negativo')
  if (discount > subtotal) throw new PricingError('Desconto não pode ser maior que o subtotal')
  return { subtotal, total: round2(subtotal - discount) }
}
