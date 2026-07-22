import { formatBRL } from '@/lib/format'
import type { PricingMode } from './types'

export type { PricingMode }

const MODE_LABELS: Record<PricingMode, string> = {
  m2: 'Por m²',
  m2_direto: 'Por m² direto',
  fixo: 'Fixo',
  manual: 'Sob consulta',
}

export function pricingModeLabel(mode: PricingMode): string {
  return MODE_LABELS[mode]
}

export function priceLabel(p: {
  pricing_mode: PricingMode
  price_per_m2: number | null
  base_price: number | null
}): string | null {
  if (p.pricing_mode === 'm2' || p.pricing_mode === 'm2_direto') {
    return `${formatBRL(p.price_per_m2 ?? 0)}/m²`
  }
  if (p.pricing_mode === 'fixo') {
    return formatBRL(p.base_price ?? 0)
  }
  return null
}

export function groupsCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'grupo' : 'grupos'} de opções`
}
