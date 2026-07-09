import { describe, expect, it } from 'vitest'
import { urgencyFor } from './urgency'

describe('urgencyFor', () => {
  const hoje = '2026-07-09'
  it('sem data', () => {
    expect(urgencyFor(null, hoje)).toBe('sem-data')
    expect(urgencyFor('', hoje)).toBe('sem-data')
  })
  it('ontem ou antes = atrasado', () => {
    expect(urgencyFor('2026-07-08', hoje)).toBe('atrasado')
    expect(urgencyFor('2026-01-01', hoje)).toBe('atrasado')
  })
  it('hoje e amanhã = urgente', () => {
    expect(urgencyFor('2026-07-09', hoje)).toBe('urgente')
    expect(urgencyFor('2026-07-10', hoje)).toBe('urgente')
  })
  it('depois de amanhã = futuro', () => {
    expect(urgencyFor('2026-07-11', hoje)).toBe('futuro')
    expect(urgencyFor('2026-12-31', hoje)).toBe('futuro')
  })
  it('vira do mês corretamente (amanhã cruzando mês)', () => {
    expect(urgencyFor('2026-08-01', '2026-07-31')).toBe('urgente')
    expect(urgencyFor('2026-08-02', '2026-07-31')).toBe('futuro')
  })
})
