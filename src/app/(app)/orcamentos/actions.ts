'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { fetchProductConfigs } from '@/lib/queries'
import { PricingError, calcQuoteTotal } from '@/lib/pricing/calc'
import { buildSnapshot, type ItemSelection } from '@/lib/pricing/snapshot'
import { canReassignOwner } from '@/lib/quotes/ownership'
import { isValidDeliveryDate } from '@/lib/quotes/delivery'

export interface SaveQuoteInput {
  id?: string
  clientId: string | null
  customerName: string
  customerPhone: string
  siteAddress: string
  discount: number
  multiplier: number
  deliveryDate: string
  items: ItemSelection[]
}

export async function saveQuote(input: SaveQuoteInput): Promise<{ id: string } | { error: string }> {
  const { supabase, user } = await getProfile()
  try {
    if (!input.customerName.trim()) return { error: 'Informe o nome do cliente' }
    if (input.items.length === 0) return { error: 'Adicione pelo menos um item' }
    if (!Number.isInteger(input.multiplier) || input.multiplier < 1) {
      return { error: 'Multiplicador deve ser um número inteiro maior ou igual a 1' }
    }
    if (!isValidDeliveryDate(input.deliveryDate)) {
      return { error: 'Informe a data de possível entrega' }
    }

    const products = await fetchProductConfigs(supabase)
    const snapshots = input.items.map(sel => {
      const p = products.find(p => p.id === sel.productTypeId)
      if (!p) throw new PricingError('Produto não encontrado ou inativo — remova o item')
      return buildSnapshot(p, sel)
    })
    const { subtotal, total } = calcQuoteTotal(snapshots.map(s => s.line_total), input.discount, input.multiplier)

    const quoteRow = {
      client_id: input.clientId,
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone.trim(),
      site_address: input.siteAddress.trim(),
      discount: input.discount,
      multiplier: input.multiplier,
      delivery_date: input.deliveryDate,
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
  // ao aprovar, entra no quadro de produção na etapa inicial (só se ainda não tem etapa)
  if (status === 'aprovado') {
    await supabase.from('quotes')
      .update({ production_stage: 'pendente' }).eq('id', id).is('production_stage', null)
  }
  revalidatePath('/')
  revalidatePath(`/orcamentos/${id}`)
  revalidatePath('/producao')
}

export async function setQuoteOwner(
  quoteId: string,
  newOwnerId: string
): Promise<{ ok: true } | { error: string }> {
  const { supabase, user, profile } = await getProfile()

  const { data: quote, error: qErr } = await supabase
    .from('quotes').select('created_by').eq('id', quoteId).single()
  if (qErr || !quote) return { error: 'Orçamento não encontrado' }

  if (!canReassignOwner({ role: profile.role, userId: user.id, quoteOwnerId: quote.created_by })) {
    return { error: 'Sem permissão para trocar o responsável' }
  }

  const { data: target } = await supabase
    .from('profiles').select('id').eq('id', newOwnerId).eq('active', true).single()
  if (!target) return { error: 'Selecione um vendedor ativo' }

  const { error } = await supabase.from('quotes')
    .update({ created_by: newOwnerId, updated_at: new Date().toISOString() })
    .eq('id', quoteId)
  if (error) return { error: 'Erro ao trocar o responsável: ' + error.message }

  revalidatePath('/')
  revalidatePath(`/orcamentos/${quoteId}`)
  revalidatePath('/admin/dashboard')
  return { ok: true }
}

export async function cloneQuote(id: string): Promise<void> {
  const { supabase } = await getProfile()
  const { data, error } = await supabase.rpc('clone_quote', { p_source_id: id })
  if (error) throw new Error('Erro ao clonar o orçamento: ' + error.message)
  revalidatePath('/')
  redirect(`/orcamentos/${data as string}`)
}

export async function deleteQuote(id: string): Promise<{ error: string } | void> {
  const { supabase, user, profile } = await getProfile()

  const { data: quote, error: qErr } = await supabase
    .from('quotes').select('created_by').eq('id', id).single()
  if (qErr || !quote) return { error: 'Orçamento não encontrado' }

  if (!canReassignOwner({ role: profile.role, userId: user.id, quoteOwnerId: quote.created_by })) {
    return { error: 'Sem permissão para excluir' }
  }

  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) return { error: 'Erro ao excluir: ' + error.message }

  revalidatePath('/')
  revalidatePath('/admin/dashboard')
  redirect('/')
}
