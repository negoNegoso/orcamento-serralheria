import { describe, expect, it } from 'vitest'
import { STAGES, STAGE_LABELS, nextStage, prevStage, isValidStage } from './stages'

describe('etapas de produção', () => {
  it('ordem fixa das 5 etapas', () => {
    expect(STAGES).toEqual(['pendente', 'a_produzir', 'em_producao', 'pronto', 'instalado'])
  })
  it('rótulos pt-BR', () => {
    expect(STAGE_LABELS.pendente).toBe('Pendente')
    expect(STAGE_LABELS.a_produzir).toBe('A produzir')
    expect(STAGE_LABELS.em_producao).toBe('Em produção')
    expect(STAGE_LABELS.pronto).toBe('Pronto')
    expect(STAGE_LABELS.instalado).toBe('Instalado')
  })
  it('nextStage avança e para na última', () => {
    expect(nextStage('pendente')).toBe('a_produzir')
    expect(nextStage('pronto')).toBe('instalado')
    expect(nextStage('instalado')).toBeNull()
  })
  it('prevStage volta e para na primeira', () => {
    expect(prevStage('a_produzir')).toBe('pendente')
    expect(prevStage('pendente')).toBeNull()
  })
  it('isValidStage', () => {
    expect(isValidStage('pronto')).toBe(true)
    expect(isValidStage('qualquer')).toBe(false)
  })
})
