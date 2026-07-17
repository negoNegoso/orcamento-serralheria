import { createServerSupabase } from '@/lib/supabase/server'
import { NovaEmpresaForm } from './nova-form'

export default async function NovaEmpresaPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('business_areas').select('name').order('name')
  const areas = (data ?? []).map((a) => a.name as string)
  return <NovaEmpresaForm areas={areas} />
}
