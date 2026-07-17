'use server'
import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeCompanyRole, validateAssignInput } from '@/lib/users/assign'

async function requireSystemAdmin() {
  const { profile } = await getProfile()
  if (profile.role !== 'admin_system') throw new Error('Apenas admin_system')
}

async function companyExists(companyId: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('companies').select('id').eq('id', companyId).maybeSingle()
  return !!data
}

export async function createPlatformUser(fd: FormData) {
  await requireSystemAdmin()
  const name = String(fd.get('name') ?? '').trim()
  const email = String(fd.get('email') ?? '').trim()
  const password = String(fd.get('password') ?? '')
  const companyId = String(fd.get('company_id') ?? '')
  const role = normalizeCompanyRole(String(fd.get('role') ?? ''))

  const v = validateAssignInput({ id: 'novo', companyId })
  if (!v.ok) throw new Error(v.error)
  if (!name || !email || password.length < 8) {
    throw new Error('Dados inválidos (senha mínima: 8 caracteres)')
  }
  if (!(await companyExists(companyId))) throw new Error('Empresa inválida')

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(error.message)
  const { error: pErr } = await admin.from('profiles')
    .insert({ id: data.user.id, email, name, role, company_id: companyId })
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id) // rollback: sem profile órfão
    throw new Error(pErr.message)
  }
  revalidatePath('/sistema/usuarios')
}

export async function assignUser(fd: FormData) {
  await requireSystemAdmin()
  const id = String(fd.get('id') ?? '')
  const companyId = String(fd.get('company_id') ?? '')
  const role = normalizeCompanyRole(String(fd.get('role') ?? ''))
  const active = fd.get('active') === 'on'

  const v = validateAssignInput({ id, companyId })
  if (!v.ok) throw new Error(v.error)
  if (!(await companyExists(companyId))) throw new Error('Empresa inválida')

  const admin = createAdminClient()
  // não permite alterar perfis de plataforma
  const { data: target } = await admin.from('profiles').select('role').eq('id', id).maybeSingle()
  if (!target) throw new Error('Usuário não encontrado')
  if (target.role === 'admin_system') throw new Error('Não é possível alterar um usuário do sistema')

  const { error } = await admin.from('profiles')
    .update({ company_id: companyId, role, active }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/sistema/usuarios')
}
