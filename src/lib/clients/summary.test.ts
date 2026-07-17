import { describe, expect, it } from 'vitest'
import { clientSummary, normalizePhone } from './summary'

describe('normalizePhone', () => {
  it('mantém só dígitos', () => {
    expect(normalizePhone('(31) 99999-8888')).toBe('31999998888')
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone('abc')).toBe('')
  })
})

describe('clientSummary', () => {
  const q = (status: string, total: number, created_at: string) => ({ status, total, created_at })

  it('agrega por status: aberto=rascunho+enviado, fechado=aprovado, perdido=recusado', () => {
    const s = clientSummary([
      q('rascunho', 100, '2026-01-01'),
      q('enviado', 200, '2026-02-01'),
      q('aprovado', 300, '2026-03-01'),
      q('aprovado', 400, '2026-04-01'),
      q('recusado', 500, '2026-05-01'),
    ])
    expect(s.quoteCount).toBe(5)
    expect(s.openCount).toBe(2)
    expect(s.closedCount).toBe(2)
    expect(s.lostCount).toBe(1)
    expect(s.approvedTotal).toBe(700)
    expect(s.lastQuoteAt).toBe('2026-05-01')
  })

  it('lista vazia', () => {
    const s = clientSummary([])
    expect(s.quoteCount).toBe(0)
    expect(s.approvedTotal).toBe(0)
    expect(s.lastQuoteAt).toBeNull()
  })
})
