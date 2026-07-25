'use server'
import { revalidatePath } from 'next/cache'
import { getCompany, getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'
import { parseCategoryId } from '@/lib/pricing/price-category-input'

export async function saveProduct(formData: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const id = String(formData.get('id') ?? '')
  const mode = String(formData.get('pricing_mode')) as 'm2' | 'm2_direto' | 'fixo' | 'manual'
  const row = {
    name: String(formData.get('name') ?? '').trim(),
    pricing_mode: mode,
    price_per_m2: mode === 'm2' || mode === 'm2_direto' ? parseDecimal(String(formData.get('price_per_m2') ?? '0')) : null,
    base_price: mode === 'fixo' ? parseDecimal(String(formData.get('base_price') ?? '0')) : null,
    active: formData.get('active') === 'on',
    sort_order: Number(formData.get('sort_order') ?? 0),
    price_category_id: parseCategoryId(formData.get('price_category_id')),
    company_id: company.id,
  }
  if (!row.name) throw new Error('Nome obrigatório')
  const q = id
    ? supabase.from('product_types').update(row).eq('id', id)
    : supabase.from('product_types').insert(row)
  const { error } = await q
  if (error) throw new Error(error.message)
  revalidatePath('/admin/produtos')
}

export async function deleteProduct(id: string) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('product_types').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/produtos')
}

export async function toggleProductActive(id: string, active: boolean) {
  const { supabase } = await getProfile()
  const { error } = await supabase
    .from('product_types')
    .update({ active })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/produtos')
}

/**
 * Grava os componentes de custo de um preço. Input vazio apaga o componente;
 * valor presente faz upsert. Valida tudo antes de escrever, para uma falha de
 * validação não deixar o lote pela metade. Admin-only pela RLS de price_costs.
 */
export async function savePriceCosts(fd: FormData): Promise<void> {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const productId = String(fd.get('product_type_id') ?? '')
  const optionId = String(fd.get('option_id') ?? '')
  if (!productId && !optionId) throw new Error('Preço não informado')
  if (productId && optionId) throw new Error('Informe produto ou opção, não os dois')

  // O id do dono vem do cliente: confirma que pertence à empresa antes de
  // escrever — sem isso, um UUID forjado de outra empresa contaminaria o
  // clone da OS dela (a busca do clone é por dono, não por empresa).
  const ownerTable = productId ? 'product_types' : 'options'
  const ownerId = productId || optionId
  const { data: owner } = await supabase
    .from(ownerTable).select('id')
    .eq('id', ownerId).eq('company_id', company.id)
    .maybeSingle()
  if (!owner) throw new Error('Preço não encontrado nesta empresa')

  const owner_cols = productId
    ? { product_type_id: productId, option_id: null }
    : { product_type_id: null, option_id: optionId }

  // valida tudo antes da primeira escrita
  const deletes: string[] = []
  const upserts: { categoryId: string; value: number }[] = []
  for (const [key, raw] of fd.entries()) {
    if (!key.startsWith('cost_')) continue
    const categoryId = key.slice('cost_'.length)
    const text = String(raw).trim()
    if (!text) {
      deletes.push(categoryId)
      continue
    }
    const value = parseDecimal(text)
    if (!Number.isFinite(value)) throw new Error('Custo inválido')
    if (value < 0) throw new Error('Custo não pode ser negativo')
    upserts.push({ categoryId, value })
  }

  for (const categoryId of deletes) {
    let del = supabase.from('price_costs').delete().eq('price_category_id', categoryId)
    del = productId ? del.eq('product_type_id', productId) : del.eq('option_id', optionId)
    const { error } = await del
    if (error) throw new Error(error.message)
  }
  for (const { categoryId, value } of upserts) {
    const { error } = await supabase.from('price_costs').upsert(
      { ...owner_cols, price_category_id: categoryId, value, company_id: company.id,
        updated_at: new Date().toISOString() },
      { onConflict: productId ? 'product_type_id,price_category_id' : 'option_id,price_category_id' },
    )
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/produtos')
  if (optionId) revalidatePath(`/admin/produtos/${String(fd.get('product_id') ?? '')}`)
}
