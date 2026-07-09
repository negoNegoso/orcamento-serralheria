import type { SupabaseClient } from '@supabase/supabase-js'
import type { Stage } from './stages'

export interface BoardQuote {
  id: string
  customer_name: string
  delivery_date: string | null
  total: number
  production_stage: Stage | null
  open_pendencies: number
}

export async function fetchBoardQuotes(supabase: SupabaseClient): Promise<BoardQuote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, customer_name, delivery_date, total, production_stage, quote_pendencies(done)')
    .eq('status', 'aprovado')
    .is('archived_at', null)
    .order('delivery_date', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((q: any) => ({
    id: q.id,
    customer_name: q.customer_name,
    delivery_date: q.delivery_date,
    total: Number(q.total),
    production_stage: q.production_stage,
    open_pendencies: (q.quote_pendencies ?? []).filter((p: { done: boolean }) => !p.done).length,
  }))
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
