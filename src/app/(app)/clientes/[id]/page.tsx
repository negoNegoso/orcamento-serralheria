import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { formatBRL } from '@/lib/format'
import { clientSummary, type QuoteLite } from '@/lib/clients/summary'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/quote/status-badge'
import { EditClientForm } from '@/components/clients/edit-client-form'

interface QuoteRow extends QuoteLite {
  id: string
  site_address: string
}

export default async function ClienteDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getProfile()
  const [{ data: client }, { data: quotes }] = await Promise.all([
    supabase.from('clients').select('id, name, phone').eq('id', id).single(),
    supabase.from('quotes')
      .select('id, status, total, created_at, site_address')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
  ])
  if (!client) notFound()

  const rows = ((quotes ?? []) as QuoteRow[]).map(q => ({ ...q, total: Number(q.total) }))
  const s = clientSummary(rows)

  const cards = [
    { label: 'Total aprovado', value: formatBRL(s.approvedTotal) },
    { label: 'Em aberto', value: String(s.openCount) },
    { label: 'Fechados', value: String(s.closedCount) },
    { label: 'Perdidos', value: String(s.lostCount) },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-bold">{client.name}</h1>
          <p className="text-sm text-muted-foreground">{client.phone || 'Sem telefone'}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Link href={`/orcamentos/novo?cliente=${client.id}`}>
            <Button size="sm">Novo orçamento</Button>
          </Link>
        </div>
      </div>
      <EditClientForm client={client} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {cards.map(c => (
          <div key={c.label} className="rounded border p-3">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="text-lg font-bold">{c.value}</p>
          </div>
        ))}
      </div>
      <h2 className="font-semibold">Orçamentos</h2>
      <ul className="space-y-2">
        {rows.map(q => (
          <li key={q.id}>
            <Link href={`/orcamentos/${q.id}`} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{new Date(q.created_at).toLocaleDateString('pt-BR')} · {formatBRL(q.total)}</p>
                {q.site_address && <p className="text-sm text-muted-foreground">{q.site_address}</p>}
              </div>
              <StatusBadge status={q.status} />
            </Link>
          </li>
        ))}
        {rows.length === 0 && <p className="text-muted-foreground">Nenhum orçamento.</p>}
      </ul>
    </div>
  )
}
