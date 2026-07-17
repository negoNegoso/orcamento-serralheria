import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { applicableConditions } from '@/lib/pricing/payment'
import { QuotePresentation } from '@/components/presentation/quote-presentation'
import { PrintButton } from './print-button'
import { quotePdfTitle } from '@/lib/format'
import { readableTextColor } from '@/lib/color'

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
  const { data: quote } = await admin.from('quotes')
    .select('*, quote_items(*), creator:created_by(name)').eq('token', token).single()
  if (!quote) notFound()
  const [{ data: company }, { data: conds }] = await Promise.all([
    admin.from('companies').select('*').eq('id', quote.company_id).single(),
    admin.from('payment_conditions').select('*').eq('company_id', quote.company_id),
  ])
  const conditions = applicableConditions(conds ?? [], Number(quote.total))
  const items = [...quote.quote_items].sort((a, b) => a.sort_order - b.sort_order)
  const accent = company?.accent_color ?? '#006688'
  const vars = {
    '--primary': accent,
    '--on-primary': readableTextColor(accent),
    '--primary-foreground': readableTextColor(accent),
  } as React.CSSProperties
  return (
    <main className="min-h-dvh bg-background" style={vars}>
      <QuotePresentation company={company} quote={quote} items={items} conditions={conditions} internal={false} />
      <div className="mx-auto max-w-2xl p-4">
        <PrintButton />
      </div>
    </main>
  )
}
