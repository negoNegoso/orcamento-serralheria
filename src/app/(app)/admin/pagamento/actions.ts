'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'

export async function saveCondition(fd: FormData) {
  const { supabase } = await getProfile()
  const id = String(fd.get('id') ?? '')
  const minS = String(fd.get('min_total') ?? '').trim()
  const maxS = String(fd.get('max_total') ?? '').trim()
  const row = {
    description: String(fd.get('description') ?? '').trim(),
    min_total: minS ? parseDecimal(minS) : null,
    max_total: maxS ? parseDecimal(maxS) : null,
    sort_order: Number(fd.get('sort_order') ?? 0),
    active: fd.get('active') === 'on',
  }
  if (!row.description) throw new Error('Descrição obrigatória')
  const { error } = await (id
    ? supabase.from('payment_conditions').update(row).eq('id', id)
    : supabase.from('payment_conditions').insert(row))
  if (error) throw new Error(error.message)
  revalidatePath('/admin/pagamento')
}

export async function deleteCondition(fd: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('payment_conditions').delete().eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  revalidatePath('/admin/pagamento')
}
