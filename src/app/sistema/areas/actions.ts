'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeAreaName } from '@/lib/business-area'

async function requireAdminSystem() {
  const { profile } = await getProfile()
  if (profile.role !== 'admin_system') throw new Error('Apenas admin_system')
}

export async function createArea(fd: FormData) {
  await requireAdminSystem()
  const name = normalizeAreaName(String(fd.get('name') ?? ''))
  if (!name) throw new Error('Nome obrigatório')
  const admin = createAdminClient()
  const { error } = await admin.from('business_areas').insert({ name })
  if (error) throw new Error(error.code === '23505' ? 'Área já existe' : error.message)
  revalidatePath('/sistema/areas')
}

export async function renameArea(fd: FormData) {
  await requireAdminSystem()
  const id = String(fd.get('id'))
  const name = normalizeAreaName(String(fd.get('name') ?? ''))
  if (!name) throw new Error('Nome obrigatório')
  const admin = createAdminClient()
  const { error } = await admin.from('business_areas').update({ name }).eq('id', id)
  if (error) throw new Error(error.code === '23505' ? 'Área já existe' : error.message)
  revalidatePath('/sistema/areas')
}

export async function deleteArea(fd: FormData) {
  await requireAdminSystem()
  const id = String(fd.get('id'))
  const admin = createAdminClient()
  const { error } = await admin.from('business_areas').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/sistema/areas')
}
