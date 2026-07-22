import { describe, it, expect } from 'vitest'
import { receiptPaymentPrefill } from './payment-prefill'
import type { PaymentConditionRow } from '@/lib/pricing/payment'

const c = (
  description: string, min: number | null, max: number | null, sort = 0, active = true,
): PaymentConditionRow => ({ description, min_total: min, max_total: max, sort_order: sort, active })

describe('receiptPaymentPrefill', () => {
  it('junta as condições aplicáveis à faixa do total, em ordem de sort', () => {
    const conds = [c('Parcela B', 0, null, 2), c('Entrada A', 0, null, 1)]
    expect(receiptPaymentPrefill(conds, 5000)).toBe('Entrada A\nParcela B')
  })

  it('exclui condições fora da faixa mín/máx', () => {
    const conds = [c('Alto', 10000, null, 1), c('Baixo', 0, 9999, 2)]
    expect(receiptPaymentPrefill(conds, 5000)).toBe('Baixo')
  })

  it('ignora inativas', () => {
    const conds = [c('Ativa', 0, null, 1), c('Inativa', 0, null, 2, false)]
    expect(receiptPaymentPrefill(conds, 5000)).toBe('Ativa')
  })

  it('sem condições aplicáveis → string vazia', () => {
    expect(receiptPaymentPrefill([], 5000)).toBe('')
  })
})
