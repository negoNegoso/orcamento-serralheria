import { formatBRL } from '@/lib/format'
import { itemDisplayGross, quoteDisplayFooter } from '@/lib/pricing/display'

export interface QuoteInput {
  customer_name: string
  subtotal: number
  discount: number
  multiplier?: number
}

export interface ItemInput {
  product_name: string
  model_name?: string | null
  width_m?: number | null
  height_m?: number | null
  qty?: number | null
  line_total: number
  extra_value?: number | null
}

export function buildQuoteMessage(quote: QuoteInput, items: ItemInput[]): string {
  const multiplier = quote.multiplier ?? 1
  const extraValues = items.map(i => Number(i.extra_value ?? 0))
  const footer = quoteDisplayFooter(quote.subtotal, quote.discount, extraValues, multiplier)

  const lines: string[] = []
  lines.push(`Olá, ${quote.customer_name}! Segue seu orçamento:`)
  lines.push('')

  items.forEach((item, idx) => {
    const name = item.model_name
      ? `${item.product_name} — ${item.model_name}`
      : item.product_name
    lines.push(`${idx + 1}. *${name}*`)

    const hasMeasures = item.width_m != null && item.height_m != null
    const measures = hasMeasures
      ? `${Number(item.width_m).toLocaleString('pt-BR')} × ${Number(item.height_m).toLocaleString('pt-BR')} m`
      : null
    const qty = item.qty ?? 1
    const gross = itemDisplayGross(item.line_total, Number(item.extra_value ?? 0))
    const value = formatBRL(gross)

    const measureQtyPart = measures ? `${measures} · ${qty} un` : `${qty} un`
    lines.push(`   ${measureQtyPart} — ${value}`)
    lines.push('')
  })

  if (multiplier > 1) {
    lines.push(`${multiplier} casas × ${formatBRL(footer.total)}`)
  }
  lines.push(`*Total: ${formatBRL(footer.total)}*`)

  return lines.join('\n')
}
