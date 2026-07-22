import { applicableConditions, type PaymentConditionRow } from '@/lib/pricing/payment'

// Forma de pagamento default do recibo: descrições das condições aplicáveis à
// faixa do total, uma por linha, na ordem de sort_order.
export function receiptPaymentPrefill(conditions: PaymentConditionRow[], total: number): string {
  return applicableConditions(conditions, total).map(c => c.description).join('\n')
}
