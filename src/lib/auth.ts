import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'

export interface Profile {
  id: string; email: string; name: string
  role: 'admin' | 'vendedor'; active: boolean
}

export async function getProfile() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !profile.active) redirect('/login')
  return { user, profile: profile as Profile, supabase }
}
