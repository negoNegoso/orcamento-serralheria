'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { effectiveCompanyId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const { profile } = await getProfile()
  const companyId = effectiveCompanyId(profile)
  if (profile.role === 'vendedor' || !companyId) throw new Error('Apenas admin')
  return { profile, companyId }
}

export async function createUser(fd: FormData) {
  const { companyId } = await requireAdmin()
  const email = String(fd.get('email') ?? '').trim()
  const password = String(fd.get('password') ?? '')
  const name = String(fd.get('name') ?? '').trim()
  const role = String(fd.get('role')) === 'admin' ? 'admin' : 'vendedor'
  if (!email || password.length < 8 || !name) throw new Error('Dados inválidos (senha mínima: 8 caracteres)')
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(error.message)
  const { error: pErr } = await admin.from('profiles')
    .insert({ id: data.user.id, email, name, role, company_id: companyId })
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id) // rollback: sem profile órfão
    throw new Error(pErr.message)
  }
  revalidatePath('/admin/usuarios')
}

export async function updateUser(fd: FormData) {
  const { companyId } = await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({
    role: String(fd.get('role')) === 'admin' ? 'admin' : 'vendedor',
    active: fd.get('active') === 'on',
  }).eq('id', String(fd.get('id'))).eq('company_id', companyId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/usuarios')
}
