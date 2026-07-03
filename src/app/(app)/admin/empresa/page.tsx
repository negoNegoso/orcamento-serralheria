import { getProfile } from '@/lib/auth'
import { saveCompany } from './actions'
import { CompanyForm } from './company-form'

export default async function EmpresaPage() {
  const { supabase } = await getProfile()
  const { data } = await supabase.from('company_settings').select('*').eq('id', 1).single()
  return <CompanyForm settings={data} action={saveCompany} />
}
