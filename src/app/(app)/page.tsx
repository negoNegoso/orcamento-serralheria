import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { formatBRL } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/quote/status-badge'

const STATUSES = ['rascunho', 'enviado', 'aprovado', 'recusado'] as const

export default async function Home({ searchParams }: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; de?: string; ate?: string }>
}) {
  const { q = '', status = '', sort = 'criacao', de = '', ate = '' } = await searchParams
  const { supabase } = await getProfile()
  let query = supabase.from('quotes').select('*, creator:created_by(name)').limit(100)
  query = sort === 'entrega'
    ? query.order('delivery_date', { ascending: true, nullsFirst: false })
    : query.order('created_at', { ascending: false })
  if (q) query = query.ilike('customer_name', `%${q}%`)
  if (status) query = query.eq('status', status)
  if (de) query = query.gte('delivery_date', de)
  if (ate) query = query.lte('delivery_date', ate)
  const { data: quotes } = await query
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Orçamentos</h1>
        <Link href="/orcamentos/novo"><Button>Novo orçamento</Button></Link>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <Input name="q" placeholder="Buscar cliente…" defaultValue={q} />
        <select name="status" defaultValue={status} className="rounded border bg-background p-2 text-sm">
          <option value="">Todos</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="sort" defaultValue={sort} className="rounded border bg-background p-2 text-sm">
          <option value="criacao">Ordenar por: Criação</option>
          <option value="entrega">Ordenar por: Entrega</option>
        </select>
        <label className="text-sm text-muted-foreground">Entrega de
          <Input type="date" name="de" defaultValue={de} className="mt-1" />
        </label>
        <label className="text-sm text-muted-foreground">até
          <Input type="date" name="ate" defaultValue={ate} className="mt-1" />
        </label>
        <Button variant="outline" type="submit">Filtrar</Button>
      </form>
      <ul className="space-y-2">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(quotes ?? []).map((qt: any) => (
          <li key={qt.id}>
            <Link href={`/orcamentos/${qt.id}`} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{qt.customer_name}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(qt.created_at).toLocaleDateString('pt-BR')} · {formatBRL(qt.total)}
                  {' · '}Entrega: {qt.delivery_date ? new Date(qt.delivery_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                  {' · '}Vendedor: {qt.creator?.name ?? 'Sem vendedor'}
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
