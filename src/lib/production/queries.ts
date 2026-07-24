import type { SupabaseClient } from '@supabase/supabase-js'
import type { Stage } from './stages'

export interface BoardQuote {
  id: string
  work_order_id: string
  customer_name: string
  delivery_date: string | null
  total: number
  production_stage: Stage | null
  open_pendencies: number
}

// PostgREST devolve objeto quando detecta 1:1 (unique em quote_id) e array
// quando não detecta. Normaliza os dois casos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function embeddedOrder(row: any) {
  const wo = Array.isArray(row.work_orders) ? row.work_orders[0] : row.work_orders
  return wo ?? null
}

export async function fetchBoardQuotes(supabase: SupabaseClient): Promise<BoardQuote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, customer_name, delivery_date, total, quote_pendencies(done), work_orders!inner(id, production_stage, status, archived_at)')
    .eq('status', 'aprovado')
    .not('work_orders.status', 'in', '("cancelada","concluida")')
    .is('work_orders.archived_at', null)
    .order('delivery_date', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((q: any) => {
    const wo = embeddedOrder(q)
    return {
      id: q.id,
      work_order_id: wo.id,
      customer_name: q.customer_name,
      delivery_date: q.delivery_date,
      total: Number(q.total),
      production_stage: wo.production_stage,
      open_pendencies: (q.quote_pendencies ?? []).filter((p: { done: boolean }) => !p.done).length,
    }
  })
}

export interface Pendency {
  id: string
  label: string
  done: boolean
}

export async function fetchPendencies(supabase: SupabaseClient, quoteId: string): Promise<Pendency[]> {
  const { data, error } = await supabase
    .from('quote_pendencies')
    .select('id, label, done')
    .eq('quote_id', quoteId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as Pendency[]
}

export interface CalendarQuote {
  id: string
  customer_name: string
  delivery_date: string
  production_stage: Stage | null
  archived: boolean
}

export async function fetchCalendarQuotes(
  supabase: SupabaseClient, startISO: string, endISO: string,
): Promise<CalendarQuote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, customer_name, delivery_date, work_orders!inner(production_stage, archived_at, status)')
    .eq('status', 'aprovado')
    .neq('work_orders.status', 'cancelada')
    .gte('delivery_date', startISO)
    .lte('delivery_date', endISO)
    .not('delivery_date', 'is', null)
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((q: any) => {
    const wo = embeddedOrder(q)
    return {
      id: q.id,
      customer_name: q.customer_name,
      delivery_date: q.delivery_date,
      production_stage: wo.production_stage,
      archived: wo.archived_at != null,
    }
  })
}

export interface ArchivedQuote {
  id: string
  customer_name: string
  delivery_date: string | null
  total: number
  archived_at: string
}

export async function fetchArchivedQuotes(
  supabase: SupabaseClient, period: { start: string | null; end: string | null },
): Promise<ArchivedQuote[]> {
  let query = supabase.from('quotes')
    .select('id, customer_name, delivery_date, total, work_orders!inner(archived_at)')
    .not('work_orders.archived_at', 'is', null)
    .order('delivery_date', { ascending: false, nullsFirst: false })
  if (period.start) query = query.gte('delivery_date', period.start.slice(0, 10))
  if (period.end) query = query.lt('delivery_date', period.end.slice(0, 10))
  const { data, error } = await query
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((q: any) => ({
    id: q.id, customer_name: q.customer_name, delivery_date: q.delivery_date,
    total: Number(q.total), archived_at: embeddedOrder(q).archived_at,
  }))
}
