'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { isValidHexColor } from '@/lib/color'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdminSystem() {
  const { profile } = await getProfile()
  if (profile.role !== 'admin_system') throw new Error('Apenas admin_system')
  return profile
}

export async function createCompany(fd: FormData) {
  await requireAdminSystem()
  const name = String(fd.get('name') ?? '').trim()
  const accent = String(fd.get('accent_color') ?? '#006688').toLowerCase()
  const adminName = String(fd.get('admin_name') ?? '').trim()
  const adminEmail = String(fd.get('admin_email') ?? '').trim()
  const adminPassword = String(fd.get('admin_password') ?? '')
  if (!name || !adminName || !adminEmail || adminPassword.length < 8)
    throw new Error('Dados inválidos (senha mínima: 8 caracteres)')
  if (!isValidHexColor(accent)) throw new Error('Cor inválida')

  const admin = createAdminClient()
  const { data: company, error: cErr } = await admin.from('companies')
    .insert({
      name,
      city: String(fd.get('city') ?? ''),
      phone: String(fd.get('phone') ?? ''),
      accent_color: accent,
      business_area: String(fd.get('business_area') ?? '').trim() || 'Serralheria',
    })
    .select('id').single()
  if (cErr) throw new Error(cErr.message)

  const { data: userData, error: uErr } = await admin.auth.admin
    .createUser({ email: adminEmail, password: adminPassword, email_confirm: true })
  if (uErr) {
    await admin.from('companies').delete().eq('id', company.id) // rollback
    throw new Error(uErr.message)
  }
  const { error: pErr } = await admin.from('profiles').insert({
    id: userData.user.id, email: adminEmail, name: adminName,
    role: 'admin', company_id: company.id,
  })
  if (pErr) {
    await admin.auth.admin.deleteUser(userData.user.id) // rollback
    await admin.from('companies').delete().eq('id', company.id)
    throw new Error(pErr.message)
  }
  revalidatePath('/sistema/empresas')
  redirect('/sistema/empresas')
}

export async function updateCompany(fd: FormData) {
  await requireAdminSystem()
  const id = String(fd.get('id'))
  const accent = String(fd.get('accent_color') ?? '').toLowerCase()
  if (!isValidHexColor(accent)) throw new Error('Cor inválida')
  const admin = createAdminClient()
  const { error } = await admin.from('companies').update({
    name: String(fd.get('name') ?? ''),
    city: String(fd.get('city') ?? ''),
    phone: String(fd.get('phone') ?? ''),
    accent_color: accent,
    business_area: String(fd.get('business_area') ?? '').trim() || 'Serralheria',
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/sistema/empresas')
  revalidatePath(`/sistema/empresas/${id}`)
}

export async function setCompanyStatus(fd: FormData) {
  await requireAdminSystem()
  const id = String(fd.get('id'))
  const status = String(fd.get('status')) === 'suspensa' ? 'suspensa' : 'ativa'
  const admin = createAdminClient()
  const { error } = await admin.from('companies').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/sistema/empresas')
}

export async function enterSupport(fd: FormData) {
  const profile = await requireAdminSystem()
  const companyId = String(fd.get('company_id'))
  const admin = createAdminClient()
  const { data: company } = await admin.from('companies').select('id').eq('id', companyId).single()
  if (!company) throw new Error('Empresa não encontrada')
  const { error } = await admin.from('profiles')
    .update({ acting_company_id: companyId }).eq('id', profile.id)
  if (error) throw new Error(error.message)
  redirect('/')
}
