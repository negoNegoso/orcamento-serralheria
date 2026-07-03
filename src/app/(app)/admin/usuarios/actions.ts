'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const { profile } = await getProfile()
  if (profile.role !== 'admin') throw new Error('Apenas admin')
}

export async function createUser(fd: FormData) {
  await requireAdmin()
  const email = String(fd.get('email') ?? '').trim()
  const password = String(fd.get('password') ?? '')
  const name = String(fd.get('name') ?? '').trim()
  const role = String(fd.get('role')) === 'admin' ? 'admin' : 'vendedor'
  if (!email || password.length < 8 || !name) throw new Error('Dados inválidos (senha mínima: 8 caracteres)')
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(error.message)
  const { error: pErr } = await admin.from('profiles').insert({ id: data.user.id, email, name, role })
  if (pErr) throw new Error(pErr.message)
  revalidatePath('/admin/usuarios')
}

export async function updateUser(fd: FormData) {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update({
    role: String(fd.get('role')) === 'admin' ? 'admin' : 'vendedor',
    active: fd.get('active') === 'on',
  }).eq('id', String(fd.get('id')))
  if (error) throw new Error(error.message)
  revalidatePath('/admin/usuarios')
}
