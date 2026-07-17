// src/app/(app)/clientes/page.tsx
import Link from 'next/link'
import { getProfile } from '@/lib/auth'
import { formatBRL } from '@/lib/format'
import { clientSummary, normalizePhone, type QuoteLite } from '@/lib/clients/summary'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ClientRow {
  id: string
  name: string
  phone: string
  quotes: QuoteLite[]
}

export default async function Clientes({ searchParams }: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const { supabase } = await getProfile()
  const { data } = await supabase
    .from('clients')
    .select('id, name, phone, quotes(status, total, created_at)')
  let clients = (data ?? []) as unknown as ClientRow[]

  if (q) {
    const term = q.trim().toLowerCase()
    const digits = normalizePhone(q)
    clients = clients.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (digits.length >= 4 && normalizePhone(c.phone).includes(digits)))
  }

  const rows = clients
    .map(c => ({ ...c, summary: clientSummary(c.quotes.map(qt => ({ ...qt, total: Number(qt.total) }))) }))
    .sort((a, b) => (b.summary.lastQuoteAt ?? '').localeCompare(a.summary.lastQuoteAt ?? ''))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Clientes</h1>
      <form className="flex gap-2">
        <Input name="q" placeholder="Buscar por nome ou telefone…" defaultValue={q} />
        <Button variant="outline" type="submit">Buscar</Button>
      </form>
      <ul className="space-y-2">
        {rows.map(c => (
          <li key={c.id}>
            <Link href={`/clientes/${c.id}`} className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted-foreground">
                  {c.phone || 'Sem telefone'}
                  {' · '}{c.summary.quoteCount} orçamento{c.summary.quoteCount === 1 ? '' : 's'}
                  {c.summary.lastQuoteAt && ` · Último: ${new Date(c.summary.lastQuoteAt).toLocaleDateString('pt-BR')}`}
                </p>
              </div>
              <p className="text-sm font-semibold">{formatBRL(c.summary.approvedTotal)} aprovado</p>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <p className="text-muted-foreground">Nenhum cliente.</p>}
      </ul>
    </div>
  )
}
