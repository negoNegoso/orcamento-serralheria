import { describe, expect, it } from 'vitest'
import { calendarDays, shiftPeriod } from './calendar'

describe('calendarDays', () => {
  it('dia = só a própria data', () => {
    expect(calendarDays('dia', '2026-07-09')).toEqual(['2026-07-09'])
  })
  it('semana = domingo a sábado contendo a data', () => {
    // 2026-07-09 é quinta; semana começa 2026-07-05 (domingo)
    expect(calendarDays('semana', '2026-07-09')).toEqual([
      '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08',
      '2026-07-09', '2026-07-10', '2026-07-11',
    ])
  })
  it('mês = grade de semanas completas cobrindo julho/2026', () => {
    const dias = calendarDays('mes', '2026-07-15')
    expect(dias.length % 7).toBe(0)
    expect(dias[0]).toBe('2026-06-28') // domingo antes do dia 1 (2026-07-01 é quarta)
    expect(dias).toContain('2026-07-01')
    expect(dias).toContain('2026-07-31')
    expect(dias[dias.length - 1] >= '2026-07-31').toBe(true)
  })
})

describe('shiftPeriod', () => {
  it('dia ±1', () => {
    expect(shiftPeriod('dia', '2026-07-09', 1)).toBe('2026-07-10')
    expect(shiftPeriod('dia', '2026-07-09', -1)).toBe('2026-07-08')
  })
  it('semana ±7', () => {
    expect(shiftPeriod('semana', '2026-07-09', 1)).toBe('2026-07-16')
  })
  it('mês ±1 mês', () => {
    expect(shiftPeriod('mes', '2026-07-15', 1)).toBe('2026-08-15')
    expect(shiftPeriod('mes', '2026-01-15', -1)).toBe('2025-12-15')
  })
})
