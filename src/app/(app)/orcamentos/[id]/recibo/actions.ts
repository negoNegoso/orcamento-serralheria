'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'

// Cria um recibo com valor = saldo restante; a forma de pagamento fica em branco
// (o usuário adiciona as condições cadastradas pelo seletor no próprio recibo).
export async function createReceipt(quoteId: string) {
  const { supabase } = await getProfile()
  const { data: quote } = await supabase.from('quotes').select('total').eq('id', quoteId).single()
  if (!quote) throw new Error('Orçamento não encontrado')
  const { data: fin } = await supabase.from('quote_financials').select('balance').eq('quote_id', quoteId).single()
  const balance = Number(fin?.balance ?? quote.total)
  const { data: id, error } = await supabase.rpc('save_receipt', {
    p_id: null,
    p_quote_id: quoteId,
    p_data: { amount: balance },
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}`)
  redirect(`/orcamentos/${quoteId}/recibo/${id}`)
}

// Estado do formulário de recibo: erro de validação (ex.: saldo estourado) volta
// pra UI em vez de derrubar a página. ok=true sinaliza salvamento bem-sucedido.
export type SaveReceiptState = { error?: string; ok?: boolean }

// Grava alterações de um recibo (valor + campos do documento). Valida saldo no RPC.
// Erros voltam como estado (useActionState) — nunca lançam pra não crashar a página.
export async function saveReceipt(_prev: SaveReceiptState, fd: FormData): Promise<SaveReceiptState> {
  const { supabase } = await getProfile()
  const id = String(fd.get('id') ?? '')
  const quoteId = String(fd.get('quote_id') ?? '')
  if (!id || !quoteId) return { error: 'Recibo inválido' }
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
  if (error) return { error: error.message }
  revalidatePath(`/orcamentos/${quoteId}`)
  revalidatePath(`/orcamentos/${quoteId}/recibo/${id}`)
  return { ok: true }
}

export async function deleteReceipt(fd: FormData) {
  const { supabase } = await getProfile()
  const id = String(fd.get('id') ?? '')
  const quoteId = String(fd.get('quote_id') ?? '')
  const { error } = await supabase.from('receipts').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}`)
}
