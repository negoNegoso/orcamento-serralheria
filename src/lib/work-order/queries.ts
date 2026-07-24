import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkOrder, WorkOrderCost, WorkOrderTotals } from './types'

const WO_COLUMNS =
  'id, quote_id, number, status, production_stage, archived_at, quote_total, quote_snapshot_at, closed_at'

export async function fetchWorkOrder(
  supabase: SupabaseClient, quoteId: string,
): Promise<WorkOrder | null> {
  const { data, error } = await supabase
    .from('work_orders').select(WO_COLUMNS).eq('quote_id', quoteId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { ...data, quote_total: Number(data.quote_total) } as WorkOrder
}

export async function fetchWorkOrderCosts(
  supabase: SupabaseClient, workOrderId: string,
): Promise<WorkOrderCost[]> {
  const { data, error } = await supabase
    .from('work_order_costs')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('sort_order')
    .order('created_at')
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((c: any) => ({
    ...c,
    qty: Number(c.qty),
    unit_value: Number(c.unit_value),
    actual_value: Number(c.actual_value),
    planned_value: Number(c.planned_value),
  })) as WorkOrderCost[]
}

export async function fetchWorkOrderTotals(
  supabase: SupabaseClient, workOrderId: string,
): Promise<WorkOrderTotals | null> {
  const { data, error } = await supabase
    .from('work_order_totals')
    .select('quote_total, planned_total, actual_total, variance, margin')
    .eq('work_order_id', workOrderId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    quote_total: Number(data.quote_total),
    planned_total: Number(data.planned_total),
    actual_total: Number(data.actual_total),
    variance: Number(data.variance),
    margin: Number(data.margin),
  }
}
