import { describe, it, expect } from 'vitest'
import { resolvePeriod } from './period'

const now = new Date(Date.UTC(2026, 5, 15, 12, 0, 0)) // 2026-06-15

describe('resolvePeriod', () => {
  it('sem params → tudo (null/null)', () => {
    expect(resolvePeriod({}, now)).toEqual({ start: null, end: null })
  })

  it('range=tudo → null/null', () => {
    expect(resolvePeriod({ range: 'tudo' }, now)).toEqual({ start: null, end: null })
  })

  it('range=mes → mês atual', () => {
    const p = resolvePeriod({ range: 'mes' }, now)
    expect(p.start).toBe('2026-06-01T00:00:00.000Z')
    expect(p.end).toBe('2026-07-01T00:00:00.000Z')
  })

  it('range=ano → ano atual', () => {
    const p = resolvePeriod({ range: 'ano' }, now)
    expect(p.start).toBe('2026-01-01T00:00:00.000Z')
    expect(p.end).toBe('2027-01-01T00:00:00.000Z')
  })

  it('month=YYYY-MM tem precedência sobre range', () => {
    const p = resolvePeriod({ range: 'ano', month: '2025-03' }, now)
    expect(p.start).toBe('2025-03-01T00:00:00.000Z')
    expect(p.end).toBe('2025-04-01T00:00:00.000Z')
  })
})
