import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { fetchProductConfigs } from '@/lib/queries'
import { canReassignOwner } from '@/lib/quotes/ownership'
import { QuoteEditor, type ExistingQuote } from '@/components/quote/quote-editor'
import { StatusBadge } from '@/components/quote/status-badge'
import { OwnerSelect } from '@/components/quote/owner-select'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { setStatus } from '../actions'
import type { ItemSelection } from '@/lib/pricing/snapshot'

export default async function OrcamentoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user, profile } = await getProfile()
  const [{ data: quote }, products, { data: activeUsers }] = await Promise.all([
    supabase.from('quotes').select('*, quote_items(*), creator:created_by(name)').eq('id', id).single(),
    fetchProductConfigs(supabase),
    supabase.from('profiles').select('id, name').eq('active', true).order('name'),
  ])
  if (!quote) notFound()

  const canReassign = canReassignOwner({
    role: profile.role,
    userId: user.id,
    quoteOwnerId: quote.created_by,
  })

  // reconstrói seleções a partir dos snapshots (ids salvos)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: ItemSelection[] = (quote.quote_items as any[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(it => ({
      productTypeId: it.product_type_id ?? '',
      modelId: it.model_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      optionIds: (it.selected_options as any[]).map(o => o.optionId).filter(Boolean),
      widthM: it.width_m != null ? Number(it.width_m) : null,
      heightM: it.height_m != null ? Number(it.height_m) : null,
      // usado só quando o produto é de preço manual (unit_base_price = valor digitado)
      manualPrice: Number(it.unit_base_price),
      qty: it.qty,
      extraValue: Number(it.extra_value) !== 0 ? Number(it.extra_value) : null,
      note: it.note ?? '',
    }))

  const existing: ExistingQuote = {
    id: quote.id, customer_name: quote.customer_name, customer_phone: quote.customer_phone,
    site_address: quote.site_address, discount: Number(quote.discount), status: quote.status,
    token: quote.token, savedTotal: Number(quote.total), items,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creatorName = (quote.creator as any)?.name ?? 'Sem vendedor'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">Orçamento — {quote.customer_name}</h1>
        <StatusBadge status={quote.status} />
        <Link href={`/orcamentos/${quote.id}/apresentacao`} className="ml-auto">
          <Button type="button" variant="outline" size="sm">Apresentar / Compartilhar</Button>
        </Link>
      </div>
      <div className="no-print flex gap-2 text-sm">
        {quote.status !== 'aprovado' && (
          <form action={setStatus.bind(null, quote.id, 'aprovado')}><SubmitButton variant="link" className="h-auto px-0 text-green-700 underline">Marcar aprovado</SubmitButton></form>
        )}
        {quote.status !== 'recusado' && (
          <form action={setStatus.bind(null, quote.id, 'recusado')}><SubmitButton variant="link" className="h-auto px-0 text-red-700 underline">Marcar recusado</SubmitButton></form>
        )}
        {canReassign
          ? <OwnerSelect quoteId={quote.id} currentOwnerId={quote.created_by}
              users={(activeUsers ?? []) as { id: string; name: string }[]} />
          : <span className="text-muted-foreground">Responsável: {creatorName}</span>}
      </div>
      <QuoteEditor products={products} quote={existing} />
    </div>
  )
}
