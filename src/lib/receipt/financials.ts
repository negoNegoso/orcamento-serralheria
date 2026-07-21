export interface ReceiptSummary {
  received: number
  balance: number
  settled: boolean
}

// Recebido/saldo/quitado de um orçamento. Saldo nunca negativo (clamp em 0),
// espelhando a view SQL quote_financials.
export function receiptSummary(total: number, received: number): ReceiptSummary {
  const balance = Math.max(total - received, 0)
  return { received, balance, settled: balance <= 0 }
}
