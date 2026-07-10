import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { applicableConditions } from '@/lib/pricing/payment'
import { QuotePresentation } from '@/components/presentation/quote-presentation'
import { PrintButton } from './print-button'
import { quotePdfTitle } from '@/lib/format'

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const robots = { index: false, follow: false }
  const { token } = await params
  if (!/^[a-f0-9]{32}$/.test(token)) return { robots }
  const admin = createAdminClient()
  const { data } = await admin.from('quotes').select('customer_name, created_at').eq('token', token).single()
  return { robots, title: data ? quotePdfTitle(data.customer_name, data.created_at) : 'Orçamento' }
}

export default async function OrcamentoPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[a-f0-9]{32}$/.test(token)) notFound()
  const admin = createAdminClient()
  const [{ data: quote }, { data: company }, { data: conds }] = await Promise.all([
    admin.from('quotes').select('*, quote_items(*), creator:created_by(name)').eq('token', token).single(),
    admin.from('company_settings').select('*').eq('id', 1).single(),
    admin.from('payment_conditions').select('*'),
  ])
  if (!quote) notFound()
  const conditions = applicableConditions(conds ?? [], Number(quote.total))
  const items = [...quote.quote_items].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <main className="min-h-dvh bg-background">
      <QuotePresentation company={company} quote={quote} items={items} conditions={conditions} internal={false} />
      <div className="mx-auto max-w-2xl p-4">
        <PrintButton />
      </div>
    </main>
  )
}
