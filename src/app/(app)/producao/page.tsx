import { getProfile } from '@/lib/auth'
import { fetchBoardQuotes, fetchPendencies, type Pendency } from '@/lib/production/queries'
import { fetchBoardVariances } from '@/lib/work-order/queries'
import { ProductionNav } from './producao-nav'
import { Board } from '@/components/production/board'

export default async function ProducaoPage() {
  const { supabase, profile } = await getProfile()
  const quotes = await fetchBoardQuotes(supabase)
  const variances = profile.role === 'vendedor'
    ? {}
    : await fetchBoardVariances(supabase, quotes.map(q => q.work_order_id))
  const todayISO = new Date().toISOString().slice(0, 10)
  const entries = await Promise.all(
    quotes.map(async q => [q.id, await fetchPendencies(supabase, q.id)] as const),
  )
  const pendenciesByQuote: Record<string, Pendency[]> = Object.fromEntries(entries)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Produção</h1>
      <ProductionNav />
      {quotes.length === 0
        ? <p className="text-muted-foreground">Nenhum orçamento aprovado em produção.</p>
        : <Board quotes={quotes} todayISO={todayISO} pendenciesByQuote={pendenciesByQuote} variances={variances} />}
    </div>
  )
}
