'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'
import { receiptPaymentPrefill } from '@/lib/receipt/payment-prefill'

// Cria um recibo com valor = saldo restante e forma de pagamento vinda das
// condições cadastradas; depois abre a página de impressão do recibo criado.
export async function createReceipt(quoteId: string) {
  const { supabase } = await getProfile()
  const { data: quote } = await supabase.from('quotes').select('total').eq('id', quoteId).single()
  if (!quote) throw new Error('Orçamento não encontrado')
  const [{ data: fin }, { data: conds }] = await Promise.all([
    supabase.from('quote_financials').select('balance').eq('quote_id', quoteId).single(),
    supabase.from('payment_conditions').select('*').order('sort_order'),
  ])
  const balance = Number(fin?.balance ?? quote.total)
  const payment = receiptPaymentPrefill(conds ?? [], Number(quote.total))
  const { data: id, error } = await supabase.rpc('save_receipt', {
    p_id: null,
    p_quote_id: quoteId,
    p_data: { amount: balance, payment_method: payment },
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}`)
  redirect(`/orcamentos/${quoteId}/recibo/${id}`)
}

// Grava alterações de um recibo (valor + campos do documento). Valida saldo no RPC.
export async function saveReceipt(fd: FormData) {
  const { supabase } = await getProfile()
  const id = String(fd.get('id') ?? '')
  const quoteId = String(fd.get('quote_id') ?? '')
  if (!id || !quoteId) throw new Error('Recibo inválido')
  const p_data = {
    amount: parseDecimal(String(fd.get('amount') ?? '0')),
    receipt_date: String(fd.get('receipt_date') ?? '') || null,
    payer_doc: String(fd.get('payer_doc') ?? ''),
    payment_method: String(fd.get('payment_method') ?? ''),
    receiver_name: String(fd.get('receiver_name') ?? ''),
    receiver_doc: String(fd.get('receiver_doc') ?? ''),
    receiver_method: String(fd.get('receiver_method') ?? ''),
  }
  const { error } = await supabase.rpc('save_receipt', { p_id: id, p_quote_id: quoteId, p_data })
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}`)
  revalidatePath(`/orcamentos/${quoteId}/recibo/${id}`)
}

export async function deleteReceipt(fd: FormData) {
  const { supabase } = await getProfile()
  const id = String(fd.get('id') ?? '')
  const quoteId = String(fd.get('quote_id') ?? '')
  const { error } = await supabase.from('receipts').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}`)
}
