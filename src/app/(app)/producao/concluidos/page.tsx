import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { resolvePeriod } from '@/lib/dashboard/period'
import { fetchArchivedQuotes } from '@/lib/production/queries'
import { formatBRL } from '@/lib/format'
import { ProductionNav } from '../producao-nav'

const RANGES = [
  { key: '', label: 'Tudo' },
  { key: 'mes', label: 'Este mês' },
  { key: '30d', label: '30 dias' },
  { key: 'ano', label: 'Este ano' },
]

export default async function ConcluidosPage({ searchParams }: {
  searchParams: Promise<{ range?: string }>
}) {
  const { range = '' } = await searchParams
  const period = resolvePeriod({ range })
  const { supabase } = await getProfile()
  const quotes = await fetchArchivedQuotes(supabase, period)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Produção</h1>
      <ProductionNav />
      <div className="flex gap-2 text-sm">
        {RANGES.map(r => (
          <Link key={r.key} href={`/producao/concluidos${r.key ? `?range=${r.key}` : ''}`}
            className={`rounded border px-2 py-1 ${range === r.key ? 'bg-primary text-primary-foreground' : ''}`}>
            {r.label}
          </Link>
        ))}
      </div>
      <ul className="space-y-2">
        {quotes.map(q => (
          <li key={q.id}>
            <Link href={`/orcamentos/${q.id}`} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{q.customer_name}</p>
                <p className="text-sm text-muted-foreground">
                  Entrega: {q.delivery_date ? new Date(q.delivery_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                  {' · '}Concluído em {new Date(q.archived_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className="font-semibold">{formatBRL(q.total)}</span>
            </Link>
          </li>
        ))}
        {quotes.length === 0 && <p className="text-muted-foreground">Nenhum concluído no período.</p>}
      </ul>
    </div>
  )
}
