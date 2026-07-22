import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { ReciboDocument } from '@/components/receipt/recibo-document'
import { receiptPdfTitle } from '@/lib/receipt/text'
import { PrintButton } from './print-button'

export async function generateMetadata({ params }: { params: Promise<{ id: string; receiptId: string }> }) {
  const { id } = await params
  const { supabase } = await getProfile()
  const { data } = await supabase.from('quotes').select('customer_name').eq('id', id).single()
  return { title: data ? receiptPdfTitle(data.customer_name, new Date()) : 'Recibo' }
}

export default async function ReciboPage({ params }: { params: Promise<{ id: string; receiptId: string }> }) {
  const { id, receiptId } = await params
  const { supabase } = await getProfile()
  const [{ data: quote }, { data: receipt }] = await Promise.all([
    supabase.from('quotes').select('*, quote_items(*)').eq('id', id).single(),
    supabase.from('receipts').select('*').eq('id', receiptId).single(),
  ])
  if (!quote || !receipt) notFound()
  const { data: company } = await supabase.from('companies').select('*').eq('id', quote.company_id).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = [...(quote.quote_items as any[])].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-2">
        <Link href={`/orcamentos/${id}`} className="text-sm underline">← Voltar</Link>
        <div className="ml-auto"><PrintButton /></div>
      </div>
      <ReciboDocument company={company} quote={quote} items={items} receipt={receipt} />
    </div>
  )
}
