import type { Stage } from '@/lib/production/stages'

export type WorkOrderStatus = 'planejada' | 'em_andamento' | 'concluida' | 'cancelada'
export type CostSource = 'orcamento' | 'manual' | 'terceiro'

export interface WorkOrder {
  id: string
  quote_id: string
  number: number
  status: WorkOrderStatus
  production_stage: Stage | null
  archived_at: string | null
  quote_total: number
  quote_snapshot_at: string
  closed_at: string | null
}

export interface WorkOrderCost {
  id: string
  work_order_id: string
  source: CostSource
  description: string
  item_label: string
  quote_item_id: string | null
  price_category_id: string | null
  qty: number
  unit_value: number
  /** coluna gerada no banco: round(qty * unit_value, 2) */
  actual_value: number
  planned_value: number
  supplier: string
  note: string
  sort_order: number
}

export interface WorkOrderTotals {
  quote_total: number
  planned_total: number
  actual_total: number
  variance: number
  margin: number
}

export interface CategoryTotals {
  price_category_id: string | null
  name: string
  planned_total: number
  actual_total: number
  variance: number
}
