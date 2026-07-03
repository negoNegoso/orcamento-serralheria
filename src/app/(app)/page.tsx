import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { formatBRL } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/quote/status-badge'

const STATUSES = ['rascunho', 'enviado', 'aprovado', 'recusado'] as const

export default async function Home({ searchParams }: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { q = '', status = '' } = await searchParams
  const { supabase } = await getProfile()
  let query = supabase.from('quotes').select('*').order('created_at', { ascending: false }).limit(100)
  if (q) query = query.ilike('customer_name', `%${q}%`)
  if (status) query = query.eq('status', status)
  const { data: quotes } = await query
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Orçamentos</h1>
        <Link href="/orcamentos/novo"><Button>Novo orçamento</Button></Link>
      </div>
      <form className="flex gap-2">
        <Input name="q" placeholder="Buscar cliente…" defaultValue={q} />
        <select name="status" defaultValue={status} className="rounded border bg-background p-2 text-sm">
          <option value="">Todos</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button variant="outline" type="submit">Filtrar</Button>
      </form>
      <ul className="space-y-2">
        {(quotes ?? []).map(qt => (
          <li key={qt.id}>
            <Link href={`/orcamentos/${qt.id}`} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{qt.customer_name}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(qt.created_at).toLocaleDateString('pt-BR')} · {formatBRL(qt.total)}
                </p>
              </div>
              <StatusBadge status={qt.status} />
            </Link>
          </li>
        ))}
        {(quotes ?? []).length === 0 && <p className="text-muted-foreground">Nenhum orçamento.</p>}
      </ul>
    </div>
  )
}
