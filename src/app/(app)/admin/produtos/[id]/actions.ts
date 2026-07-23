'use server'
import { revalidatePath } from 'next/cache'
import { getCompany, getProfile } from '@/lib/auth'
import { parseDecimal } from '@/lib/format'
import { buildSortUpdates } from '@/lib/reorder'
import { parseCategoryId } from '@/lib/pricing/price-category-input'

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
    price_category_id: parseCategoryId(fd.get('price_category_id')),
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
    price_category_id: parseCategoryId(fd.get('price_category_id')),
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
    surcharge_type: String(fd.get('surcharge_type') ?? 'fixo') === 'por_m2' ? 'por_m2' : 'fixo',
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

export async function applyTemplate(fd: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const templateId = String(fd.get('template_id') ?? '')
  const productId = String(fd.get('product_id') ?? '')
  if (!templateId) throw new Error('Template não informado')
  const { data: tpl, error: tplError } = await supabase
    .from('option_group_templates')
    .select('*, option_templates(*)')
    .eq('id', templateId)
    .single()
  if (tplError || !tpl) throw new Error('Template não encontrado')
  const { data: group, error: groupError } = await supabase
    .from('option_groups')
    .insert({
      product_type_id: productId,
      name: tpl.name,
      required: tpl.required,
      sort_order: 0,
      company_id: company.id,
    })
    .select('id')
    .single()
  if (groupError || !group) throw new Error(groupError?.message ?? 'Falha ao criar grupo')
  const options = (tpl.option_templates ?? []).map((o: { label: string; surcharge_type: string; surcharge_value: number; sort_order: number }) => ({
    group_id: group.id,
    label: o.label,
    surcharge_type: o.surcharge_type,
    surcharge_value: o.surcharge_value,
    sort_order: o.sort_order,
    active: true,
    company_id: company.id,
  }))
  if (options.length > 0) {
    const { error: optError } = await supabase.from('options').insert(options)
    if (optError) {
      await supabase.from('option_groups').delete().eq('id', group.id)
      throw new Error(optError.message)
    }
  }
  reval(fd)
}

export async function saveGroupAsTemplate(fd: FormData) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const groupId = String(fd.get('group_id') ?? '')
  const { data: group, error: groupError } = await supabase
    .from('option_groups')
    .select('*, options(*)')
    .eq('id', groupId)
    .single()
  if (groupError || !group) throw new Error('Grupo não encontrado')
  const { data: tpl, error: tplError } = await supabase
    .from('option_group_templates')
    .insert({ name: group.name, required: group.required, company_id: company.id })
    .select('id')
    .single()
  if (tplError || !tpl) throw new Error(tplError?.message ?? 'Falha ao criar template')
  const options = (group.options ?? []).map((o: { label: string; surcharge_type: string; surcharge_value: number; sort_order: number }) => ({
    template_id: tpl.id,
    label: o.label,
    surcharge_type: o.surcharge_type,
    surcharge_value: o.surcharge_value,
    sort_order: o.sort_order,
    company_id: company.id,
  }))
  if (options.length > 0) {
    const { error: optError } = await supabase.from('option_templates').insert(options)
    if (optError) {
      await supabase.from('option_group_templates').delete().eq('id', tpl.id)
      throw new Error(optError.message)
    }
  }
  revalidatePath('/admin/templates')
  reval(fd)
}

export async function reorderGroups(productId: string, ids: string[]) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const results = await Promise.all(
    buildSortUpdates(ids).map(({ id, sort_order }) =>
      supabase
        .from('option_groups')
        .update({ sort_order })
        .eq('id', id)
        .eq('company_id', company.id)
        .eq('product_type_id', productId)
    )
  )
  const failed = results.find(r => r.error)
  if (failed?.error) throw new Error(failed.error.message)
  revalidatePath(`/admin/produtos/${productId}`)
}

export async function reorderOptions(productId: string, groupId: string, ids: string[]) {
  const { supabase, company } = await getCompany()
  if (!company) throw new Error('Sem empresa ativa')
  const results = await Promise.all(
    buildSortUpdates(ids).map(({ id, sort_order }) =>
      supabase
        .from('options')
        .update({ sort_order })
        .eq('id', id)
        .eq('company_id', company.id)
        .eq('group_id', groupId)
    )
  )
  const failed = results.find(r => r.error)
  if (failed?.error) throw new Error(failed.error.message)
  revalidatePath(`/admin/produtos/${productId}`)
}
