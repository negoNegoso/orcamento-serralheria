export type Stage = 'pendente' | 'a_produzir' | 'em_producao' | 'pronto' | 'instalado'

export const STAGES: Stage[] = ['pendente', 'a_produzir', 'em_producao', 'pronto', 'instalado']

export const STAGE_LABELS: Record<Stage, string> = {
  pendente: 'Pendente',
  a_produzir: 'A produzir',
  em_producao: 'Em produção',
  pronto: 'Pronto',
  instalado: 'Instalado',
}

export function isValidStage(s: string): s is Stage {
  return (STAGES as string[]).includes(s)
}

export function nextStage(s: Stage): Stage | null {
  const i = STAGES.indexOf(s)
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null
}

export function prevStage(s: Stage): Stage | null {
  const i = STAGES.indexOf(s)
  return i > 0 ? STAGES[i - 1] : null
}
