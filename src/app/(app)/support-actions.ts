'use server'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function exitSupport() {
  const { profile } = await getProfile()
  if (profile.role !== 'admin_system') throw new Error('Apenas admin_system')
  const admin = createAdminClient()
  const { error } = await admin.from('profiles')
    .update({ acting_company_id: null }).eq('id', profile.id)
  if (error) throw new Error(error.message)
  redirect('/sistema/empresas')
}
