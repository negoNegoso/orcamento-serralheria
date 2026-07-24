'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'

async function adminClient() {
  const { supabase, profile } = await getProfile()
  if (profile.role === 'vendedor') throw new Error('Sem permissão')
  return supabase
}

/** Lançamento novo durante a produção: planejado zero = custo não previsto. */
export async function addCost(quoteId: string, fd: FormData): Promise<void> {
  const supabase = await adminClient()
  const workOrderId = String(fd.get('work_order_id') ?? '')
  const description = String(fd.get('description') ?? '').trim()
  if (!workOrderId || !description) throw new Error('Descrição obrigatória')

  const { data: wo } = await supabase
    .from('work_orders').select('company_id').eq('id', workOrderId).single()
  if (!wo) throw new Error('Ordem de serviço não encontrada')

  const source = String(fd.get('source') ?? 'manual')
  const categoryId = String(fd.get('price_category_id') ?? '')
  const { error } = await supabase.from('work_order_costs').insert({
    work_order_id: workOrderId,
    company_id: wo.company_id,
    source: source === 'terceiro' ? 'terceiro' : 'manual',
    description,
    item_label: '',
    price_category_id: categoryId || null,
    qty: parseDecimal(String(fd.get('qty') ?? '1')) || 1,
    unit_value: parseDecimal(String(fd.get('unit_value') ?? '0')),
    supplier: source === 'terceiro' ? String(fd.get('supplier') ?? '').trim() : '',
    note: String(fd.get('note') ?? '').trim(),
    sort_order: 9999,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}/ordem`)
  revalidatePath(`/orcamentos/${quoteId}`)
}

/** Só qty e unit_value: actual_value é coluna gerada, planned_value é congelado. */
export async function updateCost(fd: FormData): Promise<void> {
  const supabase = await adminClient()
  const id = String(fd.get('id') ?? '')
  const quoteId = String(fd.get('quote_id') ?? '')
  if (!id || !quoteId) throw new Error('Lançamento inválido')
  const { error } = await supabase.from('work_order_costs').update({
    qty: parseDecimal(String(fd.get('qty') ?? '1')),
    unit_value: parseDecimal(String(fd.get('unit_value') ?? '0')),
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}/ordem`)
  revalidatePath(`/orcamentos/${quoteId}`)
}

export async function deleteCost(fd: FormData): Promise<void> {
  const supabase = await adminClient()
  const id = String(fd.get('id') ?? '')
  const quoteId = String(fd.get('quote_id') ?? '')
  if (!id || !quoteId) throw new Error('Lançamento inválido')

  // Linha de orçamento é a base de comparação congelada: nunca pode ser
  // excluída, só ter o valor real editado. A UI já esconde o botão, mas o
  // guard precisa estar aqui — a RLS não distingue source.
  const { data: row } = await supabase
    .from('work_order_costs').select('source').eq('id', id).single()
  if (!row) throw new Error('Lançamento não encontrado')
  if (row.source === 'orcamento') throw new Error('Linha do orçamento não pode ser excluída')

  const { error } = await supabase.from('work_order_costs').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}/ordem`)
  revalidatePath(`/orcamentos/${quoteId}`)
}

export async function closeOrder(quoteId: string, workOrderId: string): Promise<void> {
  const supabase = await adminClient()
  const { error } = await supabase.rpc('close_work_order', { p_id: workOrderId })
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}/ordem`)
  revalidatePath(`/orcamentos/${quoteId}`)
}

export async function reopenOrder(quoteId: string, workOrderId: string): Promise<void> {
  const supabase = await adminClient()
  const { error } = await supabase.rpc('reopen_work_order', { p_id: workOrderId })
  if (error) throw new Error(error.message)
  revalidatePath(`/orcamentos/${quoteId}/ordem`)
  revalidatePath(`/orcamentos/${quoteId}`)
}
