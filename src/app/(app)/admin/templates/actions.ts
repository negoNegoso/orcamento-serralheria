'use server'
import { revalidatePath } from 'next/cache'
import { getCompany, getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'

function reval() {
  revalidatePath('/admin/templates')
}

export async function saveTemplate(fd: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const id = String(fd.get('id') ?? '')
  const row = {
    name: String(fd.get('name') ?? '').trim(),
    required: fd.get('required') === 'on',
    company_id: company.id,
  }
  if (!row.name) throw new Error('Nome obrigatório')
  const { error } = await (id
    ? supabase.from('option_group_templates').update(row).eq('id', id)
    : supabase.from('option_group_templates').insert(row))
  if (error) throw new Error(error.message)
  reval()
}

export async function deleteTemplate(fd: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('option_group_templates').delete().eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  reval()
}

export async function saveTemplateOption(fd: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const id = String(fd.get('id') ?? '')
  const row = {
    template_id: String(fd.get('template_id')),
    label: String(fd.get('label') ?? '').trim(),
    surcharge_type: String(fd.get('surcharge_type')) as 'fixo' | 'por_m2',
    surcharge_value: parseDecimal(String(fd.get('surcharge_value') ?? '0')),
    sort_order: Number(fd.get('sort_order') ?? 0),
    company_id: company.id,
  }
  if (!row.label) throw new Error('Rótulo obrigatório')
  const { error } = await (id
    ? supabase.from('option_templates').update(row).eq('id', id)
    : supabase.from('option_templates').insert(row))
  if (error) throw new Error(error.message)
  reval()
}

export async function deleteTemplateOption(fd: FormData) {
  const { supabase } = await getProfile()
  const { error } = await supabase.from('option_templates').delete().eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  reval()
}
