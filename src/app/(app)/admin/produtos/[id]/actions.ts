'use server'
import { revalidatePath } from 'next/cache'
import { getCompany, getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'

function reval(fd: FormData) {
  revalidatePath(`/admin/produtos/${String(fd.get('product_id'))}`)
}

export async function saveGroup(fd: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const id = String(fd.get('id') ?? '')
  const row = {
    product_type_id: String(fd.get('product_id')),
    name: String(fd.get('name') ?? '').trim(),
    required: fd.get('required') === 'on',
    sort_order: Number(fd.get('sort_order') ?? 0),
    company_id: company.id,
  }
  if (!row.name) throw new Error('Nome obrigatório')
  const { error } = await (id
    ? supabase.from('option_groups').update(row).eq('id', id)
    : supabase.from('option_groups').insert(row))
  if (error) throw new Error(error.message)
  reval(fd)
}

export async function deleteGroup(fd: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('option_groups').delete().eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  reval(fd)
}

export async function saveOption(fd: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const id = String(fd.get('id') ?? '')
  const row = {
    group_id: String(fd.get('group_id')),
    label: String(fd.get('label') ?? '').trim(),
    surcharge_type: String(fd.get('surcharge_type')) as 'fixo' | 'por_m2',
    surcharge_value: parseDecimal(String(fd.get('surcharge_value') ?? '0')),
    sort_order: Number(fd.get('sort_order') ?? 0),
    active: fd.get('active') === 'on',
    company_id: company.id,
  }
  if (!row.label) throw new Error('Rótulo obrigatório')
  const { error } = await (id
    ? supabase.from('options').update(row).eq('id', id)
    : supabase.from('options').insert(row))
  if (error) throw new Error(error.message)
  reval(fd)
}

export async function deleteOption(fd: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('options').delete().eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  reval(fd)
}

export async function saveModel(fd: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const id = String(fd.get('id') ?? '')
  const row = {
    product_type_id: String(fd.get('product_id')),
    name: String(fd.get('name') ?? '').trim(),
    photo_url: String(fd.get('photo_url') ?? '') || null,
    surcharge: parseDecimal(String(fd.get('surcharge') ?? '0')),
    sort_order: Number(fd.get('sort_order') ?? 0),
    active: fd.get('active') === 'on',
    company_id: company.id,
  }
  if (!row.name) throw new Error('Nome obrigatório')
  const { error } = await (id
    ? supabase.from('models').update(row).eq('id', id)
    : supabase.from('models').insert(row))
  if (error) throw new Error(error.message)
  reval(fd)
}

export async function deleteModel(fd: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('models').delete().eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  reval(fd)
}
