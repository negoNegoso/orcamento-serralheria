import { describe, expect, it } from 'vitest'
import { normalizeAreaName } from './business-area'

describe('normalizeAreaName', () => {
  it('remove espaços das pontas', () => {
    expect(normalizeAreaName('  Serralheria  ')).toBe('Serralheria')
  })
  it('colapsa espaços internos', () => {
    expect(normalizeAreaName('Estruturas   Metálicas')).toBe('Estruturas Metálicas')
  })
  it('string vazia ou só espaços vira vazio', () => {
    expect(normalizeAreaName('   ')).toBe('')
    expect(normalizeAreaName('')).toBe('')
  })
})
