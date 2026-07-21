import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { applicableConditions } from '@/lib/pricing/payment'
import { QuotePresentation } from '@/components/presentation/quote-presentation'
import { ShareBar } from '@/components/quote/share-bar'
import { quotePdfTitle } from '@/lib/format'
import { buildQuoteMessage } from '@/lib/whatsapp-message'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('quotes').select('customer_name, created_at').eq('id', id).single()
  return { title: data ? quotePdfTitle(data.customer_name, data.created_at) : 'Orçamento' }
}

export default async function Apresentacao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getProfile()
  const { data: quote } = await supabase
    .from('quotes').select('*, quote_items(*), creator:created_by(name)').eq('id', id).single()
  if (!quote) notFound()
  const [{ data: company }, { data: conds }] = await Promise.all([
    supabase.from('companies').select('*').eq('id', quote.company_id).single(),
    supabase.from('payment_conditions').select('*'),
  ])
  const conditions = applicableConditions(conds ?? [], Number(quote.total))
  const items = [...quote.quote_items].sort((a, b) => a.sort_order - b.sort_order)
  const fullMessage = buildQuoteMessage(
    {
      customer_name: quote.customer_name,
      subtotal: Number(quote.subtotal),
      discount: Number(quote.discount),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      discount_type: ((quote as any).discount_type ?? 'valor') as 'valor' | 'percent',
      multiplier: Number(quote.multiplier ?? 1),
    },
    items.map(it => ({
      product_name: it.product_name,
      model_name: it.model_name,
      width_m: it.width_m != null ? Number(it.width_m) : null,
      height_m: it.height_m != null ? Number(it.height_m) : null,
      qty: Number(it.qty ?? 1),
      line_total: Number(it.line_total),
      extra_value: Number(it.extra_value ?? 0),
    })),
  )
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-2">
        <Link href={`/orcamentos/${id}`} className="text-sm underline">← Voltar</Link>
        <div className="ml-auto">
          <ShareBar quoteId={quote.id} token={quote.token} customerName={quote.customer_name}
            total={Number(quote.total)} markSent={quote.status === 'rascunho'} fullMessage={fullMessage} />
        </div>
      </div>
      <QuotePresentation company={company} quote={quote} items={items} conditions={conditions} internal={true} />
    </div>
  )
}
