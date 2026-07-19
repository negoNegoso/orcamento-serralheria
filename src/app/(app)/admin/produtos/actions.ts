'use server'
import { revalidatePath } from 'next/cache'
import { getCompany, getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'

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
