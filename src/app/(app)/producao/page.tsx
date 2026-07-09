import { getProfile } from '@/lib/auth'
import { fetchBoardQuotes } from '@/lib/production/queries'
import { ProductionNav } from './producao-nav'
import { Board } from '@/components/production/board'

export default async function ProducaoPage() {
  const { supabase } = await getProfile()
  const quotes = await fetchBoardQuotes(supabase)
  const todayISO = new Date().toISOString().slice(0, 10)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Produção</h1>
      <ProductionNav />
      {quotes.length === 0
        ? <p className="text-muted-foreground">Nenhum orçamento aprovado em produção.</p>
        : <Board quotes={quotes} todayISO={todayISO} />}
    </div>
  )
}
