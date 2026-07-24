import { describe, expect, it } from 'vitest'
import { canClose, canEditCosts, canReopen, nextStatusForStage, WO_STATUS_LABELS } from './status'

describe('nextStatusForStage', () => {
  it('planejada vira em_andamento quando a produção começa', () => {
    expect(nextStatusForStage('planejada', 'em_producao')).toBe('em_andamento')
    expect(nextStatusForStage('planejada', 'pronto')).toBe('em_andamento')
    expect(nextStatusForStage('planejada', 'instalado')).toBe('em_andamento')
  })
  it('planejada continua planejada nas etapas anteriores à produção', () => {
    expect(nextStatusForStage('planejada', 'pendente')).toBe('planejada')
    expect(nextStatusForStage('planejada', 'a_produzir')).toBe('planejada')
  })
  it('nunca rebaixa nem ressuscita status já avançado', () => {
    expect(nextStatusForStage('em_andamento', 'pendente')).toBe('em_andamento')
    expect(nextStatusForStage('concluida', 'em_producao')).toBe('concluida')
    expect(nextStatusForStage('cancelada', 'em_producao')).toBe('cancelada')
  })
})

describe('canEditCosts', () => {
  it('libera enquanto a OS está aberta', () => {
    expect(canEditCosts('planejada')).toBe(true)
    expect(canEditCosts('em_andamento')).toBe(true)
  })
  it('bloqueia depois de encerrada ou cancelada', () => {
    expect(canEditCosts('concluida')).toBe(false)
    expect(canEditCosts('cancelada')).toBe(false)
  })
})

describe('canClose / canReopen', () => {
  it('conclui só o que está aberto', () => {
    expect(canClose('em_andamento')).toBe(true)
    expect(canClose('planejada')).toBe(true)
    expect(canClose('concluida')).toBe(false)
    expect(canClose('cancelada')).toBe(false)
  })
  it('reabre só o que está concluído', () => {
    expect(canReopen('concluida')).toBe(true)
    expect(canReopen('em_andamento')).toBe(false)
    expect(canReopen('cancelada')).toBe(false)
  })
})

describe('WO_STATUS_LABELS', () => {
  it('rotula os quatro status', () => {
    expect(WO_STATUS_LABELS.planejada).toBe('Planejada')
    expect(WO_STATUS_LABELS.em_andamento).toBe('Em andamento')
    expect(WO_STATUS_LABELS.concluida).toBe('Concluída')
    expect(WO_STATUS_LABELS.cancelada).toBe('Cancelada')
  })
})
