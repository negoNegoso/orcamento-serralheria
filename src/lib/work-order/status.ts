import type { Stage } from '@/lib/production/stages'
import type { WorkOrderStatus } from './types'

export const WO_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  planejada: 'Planejada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

/** Etapas que ainda não consomem mão de obra nem máquina. */
const PRE_WIP: Stage[] = ['pendente', 'a_produzir']

/**
 * Promoção automática: começou a produzir, a OS acumula custo (WIP). Só sobe a
 * partir de 'planejada' — concluir e cancelar são atos explícitos e não voltam
 * por movimento de card. Repetido em SQL dentro de set_production_stage.
 */
export function nextStatusForStage(status: WorkOrderStatus, stage: Stage): WorkOrderStatus {
  if (status === 'planejada' && !PRE_WIP.includes(stage)) return 'em_andamento'
  return status
}

export function canEditCosts(status: WorkOrderStatus): boolean {
  return status === 'planejada' || status === 'em_andamento'
}

export function canClose(status: WorkOrderStatus): boolean {
  return canEditCosts(status)
}

export function canReopen(status: WorkOrderStatus): boolean {
  return status === 'concluida'
}
