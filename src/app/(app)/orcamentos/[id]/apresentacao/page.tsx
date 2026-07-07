import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { applicableConditions } from '@/lib/pricing/payment'
import { QuotePresentation } from '@/components/presentation/quote-presentation'
import { ShareBar } from '@/components/quote/share-bar'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('quotes').select('customer_name').eq('id', id).single()
  return { title: data ? `Orçamento - ${data.customer_name}` : 'Orçamento' }
}

export default async function Apresentacao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase } = await getProfile()
  const [{ data: quote }, { data: company }, { data: conds }] = await Promise.all([
    supabase.from('quotes').select('*, quote_items(*), creator:created_by(name)').eq('id', id).single(),
    supabase.from('company_settings').select('*').eq('id', 1).single(),
    supabase.from('payment_conditions').select('*'),
  ])
  if (!quote) notFound()
  const conditions = applicableConditions(conds ?? [], Number(quote.total))
  const items = [...quote.quote_items].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-2">
        <Link href={`/orcamentos/${id}`} className="text-sm underline">← Voltar</Link>
        <div className="ml-auto">
          <ShareBar quoteId={quote.id} token={quote.token} customerName={quote.customer_name}
            total={Number(quote.total)} markSent={quote.status === 'rascunho'} />
        </div>
      </div>
      <QuotePresentation company={company} quote={quote} items={items} conditions={conditions} />
    </div>
  )
}
