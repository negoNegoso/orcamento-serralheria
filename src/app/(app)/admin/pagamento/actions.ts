'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'

// vazio → null (sem limite); não-numérico → erro (0 silencioso esconderia a condição de todos os orçamentos)
function parseRange(s: FormDataEntryValue | null): number | null {
  const t = String(s ?? '').trim()
  if (!t) return null
  const n = parseDecimal(t)
  if (n === 0 && !/^0([.,]0*)?$/.test(t)) throw new Error(`Valor de faixa inválido: "${t}"`)
  return n
}

export async function saveCondition(fd: FormData) {
  const { supabase } = await getProfile()
  const id = String(fd.get('id') ?? '')
  const row = {
    description: String(fd.get('description') ?? '').trim(),
    min_total: parseRange(fd.get('min_total')),
    max_total: parseRange(fd.get('max_total')),
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
