import { describe, it, expect } from 'vitest'
import { receiptSummary } from './financials'

describe('receiptSummary', () => {
  it('recebido parcial → saldo positivo, não quitado', () => {
    expect(receiptSummary(1000, 400)).toEqual({ received: 400, balance: 600, settled: false })
  })

  it('recebido == total → saldo zero, quitado', () => {
    expect(receiptSummary(1000, 1000)).toEqual({ received: 1000, balance: 0, settled: true })
  })

  it('recebido acima do total (não deve ocorrer, mas é defensivo) → saldo 0, quitado', () => {
    expect(receiptSummary(1000, 1200)).toEqual({ received: 1200, balance: 0, settled: true })
  })

  it('nada recebido → saldo total, não quitado', () => {
    expect(receiptSummary(1000, 0)).toEqual({ received: 0, balance: 1000, settled: false })
  })
})
