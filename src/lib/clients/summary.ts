export function normalizePhone(s: string): string {
  return s.replace(/\D/g, '')
}

export interface QuoteLite {
  status: string
  total: number
  created_at: string
}

export interface ClientSummary {
  quoteCount: number
  approvedTotal: number
  openCount: number
  closedCount: number
  lostCount: number
  lastQuoteAt: string | null
}

// em aberto = rascunho+enviado · fechado = aprovado · perdido = recusado
export function clientSummary(quotes: QuoteLite[]): ClientSummary {
  let approvedTotal = 0
  let openCount = 0
  let closedCount = 0
  let lostCount = 0
  let lastQuoteAt: string | null = null
  for (const q of quotes) {
    if (q.status === 'aprovado') { closedCount++; approvedTotal += q.total }
    else if (q.status === 'recusado') lostCount++
    else openCount++
    if (!lastQuoteAt || q.created_at > lastQuoteAt) lastQuoteAt = q.created_at
  }
  return { quoteCount: quotes.length, approvedTotal, openCount, closedCount, lostCount, lastQuoteAt }
}
