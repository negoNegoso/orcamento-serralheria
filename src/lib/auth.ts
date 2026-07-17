import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { effectiveCompanyId, type Company } from '@/lib/tenant'

export interface Profile {
  id: string; email: string; name: string
  role: 'admin_system' | 'admin' | 'vendedor'
  active: boolean
  company_id: string | null
  acting_company_id: string | null
}

export async function getProfile() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !profile.active) redirect('/login')
  return { user, profile: profile as Profile, supabase }
}

// Perfil + empresa efetiva (a do usuário, ou a selecionada pelo admin_system)
export async function getCompany() {
  const { user, profile, supabase } = await getProfile()
  const companyId = effectiveCompanyId(profile)
  if (!companyId) return { user, profile, supabase, company: null as Company | null }
  const { data } = await supabase.from('companies').select('*').eq('id', companyId).single()
  return { user, profile, supabase, company: (data ?? null) as Company | null }
}
