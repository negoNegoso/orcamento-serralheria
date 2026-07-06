'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { fetchProductConfigs } from '@/lib/queries'
import { PricingError, calcQuoteTotal } from '@/lib/pricing/calc'
import { buildSnapshot, type ItemSelection } from '@/lib/pricing/snapshot'

export interface SaveQuoteInput {
  id?: string
  customerName: string
  customerPhone: string
  siteAddress: string
  discount: number
  items: ItemSelection[]
}

export async function saveQuote(input: SaveQuoteInput): Promise<{ id: string } | { error: string }> {
  const { supabase, user } = await getProfile()
  try {
    if (!input.customerName.trim()) return { error: 'Informe o nome do cliente' }
    if (input.items.length === 0) return { error: 'Adicione pelo menos um item' }

    const products = await fetchProductConfigs(supabase)
    const snapshots = input.items.map(sel => {
      const p = products.find(p => p.id === sel.productTypeId)
      if (!p) throw new PricingError('Produto não encontrado ou inativo — remova o item')
      return buildSnapshot(p, sel)
    })
    const { subtotal, total } = calcQuoteTotal(snapshots.map(s => s.line_total), input.discount)

    const quoteRow = {
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone.trim(),
      site_address: input.siteAddress.trim(),
      discount: input.discount,
      subtotal,
      total,
      updated_at: new Date().toISOString(),
    }

    let quoteId = input.id
    if (!quoteId) {
      const { data: settings } = await supabase.from('company_settings')
        .select('default_validity_days').eq('id', 1).single()
      const days = settings?.default_validity_days ?? 15
      const validUntil = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
      const { data, error } = await supabase.from('quotes')
        .insert({ ...quoteRow, created_by: user.id, valid_until: validUntil })
        .select('id').single()
      if (error) throw new Error(error.message)
      quoteId = data.id as string
    }

    // cabeçalho + troca de itens numa transação só (rollback total em falha)
    const { error: rpcErr } = await supabase.rpc('save_quote_atomic', {
      p_quote_id: quoteId,
      p_quote: quoteRow,
      p_items: snapshots,
    })
    if (rpcErr) throw new Error(rpcErr.message)

    revalidatePath('/')
    revalidatePath(`/orcamentos/${quoteId}`)
    return { id: quoteId! }
  } catch (e) {
    if (e instanceof PricingError) return { error: e.message }
    return { error: 'Erro ao salvar: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

export async function setStatus(id: string, status: 'rascunho' | 'enviado' | 'aprovado' | 'recusado') {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('quotes')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/')
  revalidatePath(`/orcamentos/${id}`)
}
