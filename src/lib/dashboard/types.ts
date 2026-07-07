export interface DashboardKpis {
  total_count: number
  approved_value: number
  open_value: number
  avg_ticket: number
  conversion_rate: number
}

export interface FunnelRow {
  status: string
  count: number
  value: number
}

export interface DashboardMetrics {
  kpis: DashboardKpis
  funnel: FunnelRow[]
  expiring: { due_7_days: number; overdue: number }
  monthly: { month: string; value: number }[]
  sellers: { name: string; approved_value: number; count: number }[]
  products: { product_name: string; times: number; qty: number }[]
  recent: {
    id: string
    customer_name: string
    total: number
    status: string
    created_at: string
  }[]
}

export const EMPTY_METRICS: DashboardMetrics = {
  kpis: { total_count: 0, approved_value: 0, open_value: 0, avg_ticket: 0, conversion_rate: 0 },
  funnel: [],
  expiring: { due_7_days: 0, overdue: 0 },
  monthly: [],
  sellers: [],
  products: [],
  recent: [],
}
